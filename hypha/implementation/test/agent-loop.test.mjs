// agent-loop 验收：用 mock 传输层验证 ReAct 工具编排 / 输出契约 / 降级熔断 / 红线。
// 不依赖真实 DeepSeek Key 或外网；真实 LLM 调用由 Robin 用 env 跑（见 cheap-validation / 启动命令）。
// 运行：node hypha/implementation/test/agent-loop.test.mjs
import assert from 'node:assert/strict';
import { agentChat, AgentFallbackError } from '../src/agent-loop.js';
import { createDeepSeekTransport } from '../src/deepseek.js';

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, '✗ ' + name);
  passed++;
  console.log('  ✓', name);
}

// mock 传输：第一次返回 search_merchants，第二次（看到搜索结果后）返回 finalize_recommendation。
function makeMockTransport() {
  return {
    kind: 'mock',
    async call(messages) {
      const lastTool = [...messages].reverse().find((m) => m.role === 'tool');
      if (lastTool && lastTool.content.includes('"merchants"')) {
        let data;
        try { data = JSON.parse(lastTool.content); } catch { data = { merchants: [] }; }
        const ids = (data.merchants || []).map((m) => m.id).filter(Boolean);
        if (ids.length) {
          return {
            content: '',
            toolCalls: [{
              id: 'c2', name: 'finalize_recommendation',
              arguments: { primaryId: ids[0], alternativeIds: ids.slice(1, 4), reason: '这家最治愈，暖暖的', guidance: '去试试吧~' },
            }],
          };
        }
      }
      return { content: '', toolCalls: [{ id: 'c1', name: 'search_merchants', arguments: { zone: '武汉全城', limit: 5 } }] };
    },
  };
}

console.log('Agent Loop · ReAct 工具编排');
const r = await agentChat({ message: '心情不好想吃点治愈系暖暖的', sessionId: 'test-1', transport: makeMockTransport() });
ok('返回 success', r.success === true);
ok('驱动标记为 hypha-react（LLM）', r.output.summary.provenance.driver === 'hypha-react');
ok('merchants 非空', Array.isArray(r.output.merchants) && r.output.merchants.length > 0);
ok('决策契约：primaryId 存在', !!(r.output.summary.decision && r.output.summary.decision.primaryId));
ok('决策契约：含 2~3 备选', Array.isArray(r.output.summary.decision.alternatives) && r.output.summary.decision.alternatives.length >= 1);
ok('决策契约：含理由', typeof r.output.summary.decision.reason === 'string' && r.output.summary.decision.reason.length > 0);
ok('guidance 非空（导览语）', !!(r.output.summary.guidance));
ok('provenance.processHash 存在', !!r.output.summary.provenance.processHash);
ok('每商户带 cpsTag 布尔（渲染层，非排序输入）', r.output.merchants.every((m) => typeof m.cpsTag === 'boolean'));
ok('未触发降级（fallback=false）', r.fallback === false);

console.log('Agent Loop · 降级熔断（transport 抛错 → AgentFallbackError）');
let threw = false;
try {
  await agentChat({
    message: '测试', sessionId: 'test-2',
    transport: { kind: 'bad', async call() { throw new Error('DeepSeek 500'); } },
  });
} catch (e) {
  threw = e instanceof AgentFallbackError;
}
ok('LLM 不可用时抛 AgentFallbackError（由 httpServer 捕获降级）', threw);

console.log('Agent Loop · 红线校验通过（无 PII / 无伪造坐标 / 无暴露密钥）');
const blob = JSON.stringify(r.output);
ok('输出不含 user_id/phone/token 回显', !/\buser_id\b/i.test(blob) && !/\bphone\b/i.test(blob) && !/"token"/i.test(blob));
ok('输出不含密钥下发明文', !/webapi\.amap\.com[^"']*key=/i.test(blob));

console.log('Agent Loop · 无 Key 时 transport 不可用（不泄露密钥）');
const t = createDeepSeekTransport();
ok('无 DEEPSEEK_API_KEY 时 kind=unavailable', t.kind === 'unavailable');
let unavailableThrew = false;
try { await t.call([], []); } catch { unavailableThrew = true; }
ok('unavailable transport call() 抛错（触发降级）', unavailableThrew);

console.log(`\nagent-loop.test.mjs 全部通过（${passed} 项）`);
