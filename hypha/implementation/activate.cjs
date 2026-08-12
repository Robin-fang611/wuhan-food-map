// activate.cjs —— 编译 manyouwei-food-discovery.domain.yaml 并打印 processHash。
//
// 重要（已对 ~/opt/hypha 真实源码核实，见 ARCHITECTURE.md 第 4 节回修说明）：
//   loadDomainPackFile / compileDomainPackToHarnessedSystem / applyDomainAgentPatch
//   这三个 @hypha/domain 函数均为「纯离线」编译/合并——只产出 Spec 与 processHash，
//   不会向任何运行中的 Server 注册/激活工具。Hypha Server 的工具由 ToolManager 加载：
//   仅内置工具、configs/tools.yaml(enabled 开关)、MCP 服务、声明式 tool-adapter-profile
//   （kind: http/local_function/...）。内联 domainPack 的 toolSpec 不会被 Server 执行为业务工具。
//   因此「把 10 工具激活进运行 Server」无法仅靠这三个函数完成，需要：
//     (a) 在 Hypha Server 配置中加入 tool-adapter-profile(http) 指向本实现 :8788，并重启 Server；
//     (b) ReAct 执行还需可用的 LLM 后端（本机 runtimeProvider=model-provider、local.enabled=false）。
//   本脚本如实编译、打印 processHash，并探测本机 Server 可达性，但**不伪造激活**。
'use strict';
const path = require('path');

(async () => {
  const DOMAIN_YAML = path.resolve(__dirname, '../manyouwei-food-discovery.domain.yaml');
  const DOMAIN_PKG = process.env.HYPHA_DOMAIN_PKG ||
    '/Users/onebilion/opt/hypha/node_modules/@hypha/domain/dist/index.js';
  const { loadDomainPackFile, compileDomainPackToHarnessedSystem, applyDomainAgentPatch } =
    await import(DOMAIN_PKG);

  // 1) 加载 DomainPack（真实 yaml）
  const domainPack = await loadDomainPackFile(DOMAIN_YAML);
  console.log('[activate] loaded domainPack:', domainPack.id, 'v' + domainPack.version);
  console.log('[activate] declared tools:', (domainPack.tools || []).map((t) => t.id).join(', '));

  // 2) 离线编译 → HarnessedAgentSystemSpec + processHash
  const result = compileDomainPackToHarnessedSystem(domainPack, {
    agentRef: 'manyouwei-food-agent',
    systemId: `${domainPack.id}.food-discovery.system`,
  });
  console.log('[activate] processHash:', result.processHash);
  console.log('[activate] harnessedSystem.id:', result.harnessedSystem.id);
  console.log('[activate] compiled toolRefs:', (result.harnessedSystem.toolRefs || []).map((r) => r.id).join(', '));
  console.log('[activate] fsm states:', (result.fsmProcess?.states || []).map((s) => s.id).join(' → '));

  // 3) 演示 applyDomainAgentPatch（纯内存合并：把 10 工具 ref 并入一个 agent spec）
  const baseAgent = {
    id: 'manyouwei-food-agent',
    toolRefs: [],
    policyRefs: [],
    skillRefs: [],
  };
  const patched = applyDomainAgentPatch(baseAgent, result.agentPatch);
  console.log('[activate] patched agent toolRefs count:', (patched.toolRefs || []).length);

  // 4) 探测本机 Hypha Server(3000) 可达性（只读，不改变任何状态）
  const HYPHA = process.env.HYPHA_URL || 'http://localhost:3000';
  let reachable = false;
  try {
    const r = await fetch(HYPHA + '/health', { method: 'GET' });
    reachable = r.ok || r.status < 500;
    console.log(`[activate] hypha server ${HYPHA} reachable=${reachable} (status ${r.status})`);
  } catch (e) {
    console.log(`[activate] hypha server ${HYPHA} unreachable:`, String(e && e.message || e));
  }

  console.log('\n[activate] ACTIVATION STATUS: BLOCKED (real-server activation not achievable via @hypha/domain compile alone)');
  console.log('  root cause: ToolManager 不从内联 domainPack 注册自定义业务工具；ReAct 需可用 LLM。');
  console.log('  next step : 在 Hypha Server 配置加 tool-adapter-profile(http→:8788) 并重启，且提供 LLM 后端后，再用 start-run 跑端到端。');
})().catch((e) => {
  console.error('[activate] FAILED:', e && e.stack || e);
  process.exit(1);
});
