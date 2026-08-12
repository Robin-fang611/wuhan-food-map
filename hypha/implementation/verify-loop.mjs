#!/usr/bin/env node
/**
 * 蛮有味·美食地图 Agent —— 本地闭环健康 / 回归门禁（Phase 5）
 *
 * 自包含：仅用 Node 内置 http + child_process，无外部依赖。
 * 覆盖（对齐 ARCHITECTURE.md 路线图完成条件 + Phase 5 验收）：
 *   1. （非阻塞）Hypha Server(3000) —— Path B 不依赖 3000（BLOCKED by design），仅作信息提示。
 *   2. 本地后端(:8799) 10 工具 + /run（sample 与 wuhan 双数据源）+ /agent（LLM 路径，无 Key 自动降级）。
 *   3. 前端预览(:5180) HTTP 200。
 *   4. 6 套单测回归（datasource / intent-parser / orchestrator / engage / prompts / agent-loop）。
 *   5. processHash 与激活物料指纹一致（sha256:afbfbab2…）。
 *
 * 退出码：全绿 0；任一红 1（可作 CI / 自动化门禁）。
 * 不触碰 ~/opt/hypha 共享配置、不改密钥。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const NODE = '/Users/onebilion/.workbuddy/binaries/node/versions/22.22.2/bin/node';
const EXPECTED_HASH = 'sha256:afbfbab26f95d13fa354808258bde08662bbdfb8e00650280d14cdfbb57cbfb5';
const HERE = fileURLToPath(new URL('.', import.meta.url));

const execFileP = promisify(execFile);
const results = [];
function record(name, ok, detail, opts = {}) {
  results.push({ name, ok: opts.nonBlocking ? true : ok, nonBlocking: !!opts.nonBlocking, shown: ok, detail });
  const tag = ok ? (opts.nonBlocking ? '⚠️' : '✅') : '❌';
  console.log(`${tag} ${name}${detail ? ' — ' + detail : ''}`);
}

function httpReq(method, host, port, path, body, timeout = 5000) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {};
    const req = http.request({ method, host, port, path, headers, timeout }, (res) => {
      let s = '';
      res.on('data', (d) => (s += d));
      res.on('end', () => resolve({ status: res.statusCode, body: s, ok: res.statusCode >= 200 && res.statusCode < 400 }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', ok: false, error: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, body: '', ok: false, error: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

async function runSuite(file) {
  try {
    await execFileP(NODE, [file], { cwd: HERE, env: { ...process.env } });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('  蛮有味 Agent · 本地闭环健康 / 回归门禁（Phase 5）');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // 1. Hypha Server(3000) —— Path B 不依赖，非阻塞信息提示。
  const s3 = await httpReq('GET', '127.0.0.1', 3000, '/api/v1/health');
  record('Hypha Server(3000) [Path B 不依赖，BLOCKED non-blocking]', s3.ok, s3.ok ? '可达（可选）' : '不可达（符合 Path B 设计，不影响验收）', { nonBlocking: true });

  // 2. 本地后端(:8799)
  const t9 = await httpReq('POST', '127.0.0.1', 8799, '/health', {});
  let toolsOk = false, toolDetail = '';
  if (t9.ok) {
    try { const j = JSON.parse(t9.body); toolsOk = Array.isArray(j.ids) && j.ids.length === 10; toolDetail = `tools=${j.ids ? j.ids.length : 0}/10 llmEnabled=${!!j.llmEnabled}`; } catch { toolDetail = 'health 响应非 JSON'; }
  } else { toolDetail = `http ${t9.status} ${t9.error || ''}（后端未启动？）`; }
  record('后端(:8799) 10 工具', toolsOk, toolDetail);

  // 2b. /run sample
  const runS = await httpReq('POST', '127.0.0.1', 8799, '/run', { intent: '南湖附近便宜的宵夜', dataSource: 'sample' });
  let runOk = false, runDetail = '', hashOk = false;
  if (runS.ok) {
    try {
      const o = JSON.parse(runS.body);
      const out = o.output || {};
      const sum = out.summary || {};
      const hasCore = typeof sum.total_matched === 'number' && !!sum.ranked_by;
      const hasGuidance = !!sum.guidance && !!sum.provenance;
      hashOk = sum.provenance && sum.provenance.processHash === EXPECTED_HASH;
      runOk = hasCore && hasGuidance && Array.isArray(out.merchants);
      runDetail = `total=${sum.total_matched} ranked_by=${sum.ranked_by} merchants=${out.merchants ? out.merchants.length : '?'} hash=${hashOk ? '一致' : '不一致'}`;
    } catch { runDetail = 'run 响应非 JSON'; }
  } else { runDetail = `http ${runS.status} ${runS.error || ''}`; }
  record('端到端 /run(sample) 产出合法契约', runOk, runDetail);
  record('processHash 与激活物料一致', hashOk, `期望 ${EXPECTED_HASH.slice(0, 12)}…`);

  // 2c. /run wuhan（数据后灌接入点）
  const runW = await httpReq('POST', '127.0.0.1', 8799, '/run', { intent: '首义必吃', dataSource: 'wuhan' });
  let wuhanOk = false, wuhanDetail = '';
  if (runW.ok) {
    try {
      const o = JSON.parse(runW.body);
      const sum = (o.output || {}).summary || {};
      wuhanOk = sum.dataSource === 'wuhan-590' && typeof sum.total_matched === 'number' && sum.total_matched > 0;
      wuhanDetail = `dataSource=${sum.dataSource} total=${sum.total_matched}`;
    } catch { wuhanDetail = 'run 响应非 JSON'; }
  } else { wuhanDetail = `http ${runW.status} ${runW.error || ''}`; }
  record('端到端 /run(wuhan) 真实 590 数据合法契约', wuhanOk, wuhanDetail);

  // 2d. /agent（LLM 路径；无 Key 时自动降级 /run，仍返回合法契约 + fallback=true）
  const ag = await httpReq('POST', '127.0.0.1', 8799, '/agent', { message: '心情不好想吃点治愈系暖暖的', sessionId: 'verify' }, 60000);
  let agentOk = false, agentDetail = '';
  if (ag.ok) {
    try {
      const o = JSON.parse(ag.body);
      const sum = (o.output || {}).summary || {};
      const hasDecision = !!(sum.decision && sum.decision.primaryId);
      agentOk = (o.success === true) && Array.isArray((o.output || {}).merchants) && hasDecision;
      agentDetail = `fallback=${!!o.fallback} driver=${sum.provenance && sum.provenance.driver} primary=${(sum.decision || {}).primaryId || '-'}`;
    } catch { agentDetail = 'agent 响应非 JSON'; }
  } else { agentDetail = `http ${ag.status} ${ag.error || ''}`; }
  record('/agent LLM 路径产出合法决策契约（含降级）', agentOk, agentDetail);

  // 3. 前端预览(:5180)
  const p8 = await httpReq('GET', '127.0.0.1', 5180, '/');
  record('前端预览(:5180) HTTP 200', p8.ok, p8.ok ? '可体验闭环入口可达' : `http ${p8.status} ${p8.error || ''}`);

  // 4. 6 套单测
  console.log('');
  const suites = ['test/datasource.test.mjs', 'test/intent-parser.test.mjs', 'test/orchestrator.test.mjs', 'test/engage.test.mjs', 'test/prompts.test.mjs', 'test/agent-loop.test.mjs'];
  for (const f of suites) {
    const ok = await runSuite(f);
    record(`单测回归 ${f.split('/').pop()}`, ok, ok ? '全绿' : '失败（见上方输出）');
  }

  // 汇总
  const failed = results.filter((r) => !r.ok);
  console.log('\n────────────────────────────────────────────────────────');
  if (failed.length === 0) {
    console.log('🟢 全绿：本地可体验闭环存活，回归零退化，激活物料指纹一致。');
    console.log('   Path B 后端(:8799) 已就绪：/run（确定性 FSM）+ /agent（DeepSeek ReAct，llmEnabled=true 即真调）。');
    console.log('   无 DEEPSEEK_API_KEY 时 /agent 自动降级确定性 FSM（前端无感）；设 Key 后 /agent 即走真实 LLM。');
  } else {
    console.log(`🔴 ${failed.length} 项未通过，闭环可能退化，需排查：`);
    failed.forEach((r) => console.log(`   - ${r.name}：${r.detail}`));
  }
  console.log('────────────────────────────────────────────────────────');
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('verify-loop 异常:', e); process.exit(1); });
