#!/usr/bin/env node
/**
 * 蛮有味·美食发现 Agent DomainPack 编译自检
 * ------------------------------------------------------------
 * 直接复用本机 Hypha 的 @hypha/domain 运行时：
 *   1. LocalDomainPackLoader 读取 YAML（内部会跑 validateDomainPackSpec）
 *   2. compileDomainPackToHarnessedSystem 编译为框架自有 Harness 系统
 *   3. 打印 processHash / 依赖快照 / 绑定摘要，证明它是「真·Hypha 智能体」
 *
 * 运行：
 *   NODE_PATH=/Users/onebilion/opt/hypha/node_modules \
 *     /Users/onebilion/.workbuddy/binaries/node/versions/22.22.2/bin/node compile-check.cjs
 */
'use strict';

const path = require('path');
const {
  DomainPackRegistry,
  LocalDomainPackLoader,
  compileDomainPackToHarnessedSystem,
  applyDomainAgentPatch,
} = require('@hypha/domain');

const DOMAIN_ID = 'domain.manyouwei-food-discovery';
const DOMAIN_VERSION = '0.1.0';

(async () => {
  console.log('== 1. 加载并校验 DomainPack YAML ==');
  const registry = new DomainPackRegistry();
  const loader = new LocalDomainPackLoader({ directories: [__dirname] });
  const loaded = await loader.loadInto(registry);
  console.log('   已加载:', loaded.map((e) => `${e.id}@${e.version}`).join(', '));

  const pack = registry.get(DOMAIN_ID, DOMAIN_VERSION);
  if (!pack) throw new Error(`未找到 ${DOMAIN_ID}@${DOMAIN_VERSION}`);
  console.log('   校验通过 ✓');

  console.log('\n== 2. 编译为框架自有 Harness 系统 ==');
  const compiled = compileDomainPackToHarnessedSystem(pack, {
    agentRef: { id: 'agent.manyouwei-food', version: '0.1.0' },
    taskSchemaId: 'task.food-discovery',
    workflowId: 'workflow.food-discovery',
    sessionProfileId: 'session.food-discovery',
    memoryProfileId: 'memory.local',
  });

  console.log('   processHash        :', compiled.processHash);
  console.log('   compilerVersion    :', compiled.compilerVersion);
  console.log('   依赖快照条目数     :', Object.keys(compiled.dependencySnapshot || {}).length);
  const fsm = compiled.fsmProcess;
  console.log('   FSM 节点           :', fsm && (fsm.states || (fsm.spec && fsm.spec.states)) ? '已生成' : 'n/a');

  console.log('\n== 3. 绑定摘要 ==');
  const b = compiled.bindings || {};
  const hs = compiled.harnessedSystem || {};
  console.log('   任务               :', (b.taskSchema && b.taskSchema.id) || 'n/a');
  console.log('   工作流             :', (b.workflow && b.workflow.id) || 'n/a');
  console.log('   工具绑定数         :', (hs.toolRefs || []).length);
  console.log('   技能绑定数         :', (hs.skillRefs || []).length);
  console.log('   策略绑定           :', (hs.policyRefs || []).map((p) => p.id || p).join(', '));

  console.log('\n== 4. 应用 Agent Patch ==');
  const baseAgent = {
    id: 'agent.manyouwei-food',
    version: '0.1.0',
    name: '蛮有味·美食发现 Agent',
    modelAlias: 'default-chat',
  };
  const agent = applyDomainAgentPatch(baseAgent, compiled.agentPatch);
  console.log('   Agent 技能引用     :', (agent.skillRefs || []).map((s) => s.id || s).join(', '));

  console.log('\n== 5. 工作流状态（美食发现闭环，FSM 证据）==');
  const wf = (pack.workflows || []).find((w) => w.id === 'workflow.food-discovery');
  for (const s of wf.states) {
    const tools = (s.allowedTools || []).length;
    const human = s.humanReviewPolicy ? ' [人工复核]' : '';
    const write = (s.allowedTools || []).some((t) => ['user.favorite', 'reward.checkin', 'reward.claim'].includes(t)) ? ' [本人写入]' : '';
    console.log(`   - ${s.id.padEnd(10)} 工具:${String(tools).padStart(2)}  ${s.goal.slice(0, 30)}${human}${write}`);
  }

  console.log('\n✅ 蛮有味·美食发现 Agent 已成功编译为 Hypha Harness 系统（不再是静态前端模块）。');
})().catch((err) => {
  console.error('\n❌ 编译/校验失败:', err && err.message ? err.message : err);
  process.exit(1);
});
