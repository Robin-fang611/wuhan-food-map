#!/usr/bin/env node
/**
 * hypha/dev-loop.cjs — 蛮有味·美食发现 Agent 的「自动迭代循环」编排器。
 *
 * 设计哲学（利用本机 Hypha 基座，但不依赖被 BLOCK 的共享 3000 运行时）：
 *  - FSM 驱动：SCAN → PLAN → IMPLEMENT → VERIFY → GATE → REPORT（失败回 FIX）。
 *  - 确定性门禁用本机 Hypha 离线编译器 `compile-check.cjs` 产出的 `processHash`（sha256）
 *    作为 DomainPack 指纹不变式 —— 这是「利用本机 Hypha 基座」的可用、可靠形态。
 *  - 子智能体编排契约（Scanner / Implementer / Verifier）由调用方（自动化 prompt）负责，
 *    本脚本只跑可自动化的扫描/验证/门禁/报告，并给出可验证结论。
 *
 * 用法：
 *   node hypha/dev-loop.cjs                # 跑一轮：SCAN + PLAN(下一个待办) + VERIFY(门禁) + GATE + REPORT
 *   node hypha/dev-loop.cjs --mark G1 done # 把 BACKLOG 里 G1 标记 [x]
 *   node hypha/dev-loop.cjs --mark G1 blocked
 *
 * 硬约束（任何迭代不得破坏）：不暴露 Key/PII；不伪造坐标/券；渲染走 h()；排序不出卖。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');           // wuhan-food-map
const HYPHA = path.join(ROOT, 'hypha');
const H5 = path.join(ROOT, 'h5');
const NODE = process.env.MYW_NODE || '/Users/onebilion/.workbuddy/binaries/node/versions/22.22.2/bin/node';
const HYPHA_NODE_MODULES = path.join(os.homedir(), 'opt', 'hypha', 'node_modules');
const BACKLOG = path.join(HYPHA, 'BACKLOG.md');
const EVENTS_LOG = path.join(HYPHA, 'dev-loop.events.json');

const STATES = { SCAN: 'SCAN', PLAN: 'PLAN', IMPLEMENT: 'IMPLEMENT', VERIFY: 'VERIFY', GATE: 'GATE', REPORT: 'REPORT', FIX: 'FIX' };
const events = [];
function emit(state, msg, extra = {}) {
  const e = { t: new Date().toISOString(), state, msg, ...extra };
  events.push(e);
  process.stdout.write(`[${state}] ${msg}\n`);
}

function sh(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, {
      cwd: opts.cwd || ROOT, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'], ...opts,
    }).toString();
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}`.trim() };
  }
}

// —— SCAN：前端改动概览（只读 git diff，不改动）——
function scan() {
  const r = sh('git', ['status', '--short', 'h5/', 'hypha/'], { cwd: ROOT });
  const lines = (r.out || '').split('\n').filter(Boolean);
  emit(STATES.SCAN, `改动文件 ${lines.length} 个`, { files: lines });
  return lines;
}

// —— PLAN：从 BACKLOG 读下一个待办（跳过 [!] 受阻项）——
function plan() {
  if (!fs.existsSync(BACKLOG)) { emit(STATES.PLAN, 'BACKLOG.md 不存在', { item: null }); return null; }
  const txt = fs.readFileSync(BACKLOG, 'utf8');
  const re = /^(##\s+)(G\d+|F\d+)\s+(.+)$/gm;
  let m, next = null;
  while ((m = re.exec(txt))) {
    const id = m[2];
    // 找到该条目下第一个状态行
    const blockStart = m.index + m[0].length;
    const after = txt.slice(blockStart);
    const statusLine = after.match(/^- 状态：`(\[[ x~!]\])`/);
    const status = statusLine ? statusLine[1] : '[ ]';
    if (status === '[ ]' && !next) { next = { id, title: m[3].trim(), status }; break; }
  }
  if (next) emit(STATES.PLAN, `下一待办：${next.id} ${next.title}`, next);
  else emit(STATES.PLAN, '无待办（全部 [x] 或 [!]）', { item: null });
  return next;
}

// —— VERIFY：确定性门禁（Hypha 离线编译 + vite build + 可选后端健康）——
function verify() {
  emit(STATES.VERIFY, '运行门禁…');
  const gates = {};

  // Gate 1: Hypha 离线编译 → processHash 不变式（本机 Hypha 基座核心用法）
  const cc = sh(NODE, ['compile-check.cjs'], {
    cwd: HYPHA,
    env: { ...process.env, NODE_PATH: HYPHA_NODE_MODULES },
  });
  const hash = (cc.out || '').match(/sha256:([0-9a-f]{12,})/i);
  gates.hyphaCompile = { ok: cc.ok && !!hash, processHash: hash ? `sha256:${hash[1]}` : null, out: cc.out.slice(0, 300) };
  emit(STATES.VERIFY, `Gate·Hypha编译 ${gates.hyphaCompile.ok ? '✅' : '⚠️'} ${gates.hyphaCompile.processHash || ''}`, gates.hyphaCompile);

  // Gate 2: vite build（全量解析/打包）
  const build = sh(NODE, ['node_modules/vite/bin/vite.js', 'build'], { cwd: H5 });
  gates.viteBuild = { ok: build.ok, out: build.out.split('\n').slice(-4).join(' | ') };
  emit(STATES.VERIFY, `Gate·vite build ${gates.viteBuild.ok ? '✅' : '❌'}`, gates.viteBuild);

  // Gate 3: 后端健康（可选，:8799 未起则跳过，不误杀）
  const health = sh('curl', ['-s', '-m', '4', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:8799/health'], { cwd: ROOT });
  if (health.out === '200') {
    gates.backend = { ok: true, out: '8799 up' };
    emit(STATES.VERIFY, 'Gate·backend :8799 ✅', gates.backend);
  } else {
    gates.backend = { ok: null, out: '8799 down(skip)' };
    emit(STATES.VERIFY, 'Gate·backend :8799 未起，跳过（不误杀）', gates.backend);
  }

  return gates;
}

// —— GATE：汇总 ——
function gate(gates) {
  const hardFail = !gates.viteBuild.ok || gates.hyphaCompile.ok === false;
  if (hardFail) {
    emit(STATES.GATE, '❌ 门禁未过（vite build 或 Hypha 编译失败），进入 FIX', { gates });
    return false;
  }
  if (gates.hyphaCompile.ok) emit(STATES.GATE, '✅ 门禁通过（Hypha 指纹稳定 + build 通过）', { processHash: gates.hyphaCompile.processHash });
  else emit(STATES.GATE, '⚠️ 门禁软通过（build 通过；Hypha 编译不可用，检查 NODE_PATH=~/opt/hypha/node_modules）', {});
  return true;
}

// —— REPORT：指纹 + 事件落盘 ——
function report(passed, gates, item) {
  const fingerprint = gates.hyphaCompile.processHash || 'n/a';
  const summary = {
    ts: new Date().toISOString(),
    passed,
    item: item ? `${item.id} ${item.title}` : null,
    processHash: fingerprint,
    gates,
    events,
  };
  fs.writeFileSync(EVENTS_LOG, JSON.stringify(summary, null, 2));
  emit(STATES.REPORT, `指纹=${fingerprint} · 结论=${passed ? 'PASS' : 'FAIL'} · 事件已写 ${path.basename(EVENTS_LOG)}`);
  return summary;
}

// —— 标记 BACKLOG 状态（按行定位，避免跨行误吞）——
function mark(id, status) {
  if (!fs.existsSync(BACKLOG)) return;
  const sym = status === 'done' ? '[x]' : status === 'blocked' ? '[!]' : status === 'wip' ? '[~]' : '[ ]';
  const lines = fs.readFileSync(BACKLOG, 'utf8').split('\n');
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(`^##\\s+${id}\\b`).test(lines[i])) { inBlock = true; continue; }
    if (inBlock && /^##\s+/.test(lines[i])) break; // 下一个条目，停止
    if (inBlock && /^-\s*状态：/.test(lines[i])) {
      lines[i] = lines[i].replace(/`\[[ x~!]\]`/, '`' + sym + '`');
      break;
    }
  }
  fs.writeFileSync(BACKLOG, lines.join('\n'));
  emit(STATES.PLAN, `BACKLOG ${id} → ${sym}`);
}

// —— main ——
function main() {
  const args = process.argv.slice(2);
  const markIdx = args.indexOf('--mark');
  if (markIdx >= 0 && args[markIdx + 1] && args[markIdx + 2]) {
    mark(args[markIdx + 1], args[markIdx + 2]);
    return;
  }
  emit(STATES.SCAN, '迭代循环启动');
  const files = scan();
  const item = plan();                 // PLAN（IMPLEMENT 由子智能体执行）
  const gates = verify();              // VERIFY
  const passed = gate(gates);          // GATE
  report(passed, gates, item);         // REPORT
  process.exit(passed ? 0 : 1);
}

main();
