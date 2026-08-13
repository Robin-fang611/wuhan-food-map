// agent-client 验收：用 mock fetch 验证 L3 集成层的「请求路由 / 响应解析 / 后端切换 / 错误处理」。
// 不依赖真实 :8799 后端或外网；锁定前端（reasoning.js）与后端（httpServer）之间的响应契约（SPEC §3 / §7.1）。
// 运行：node hypha/integration/agent-client.test.mjs
import assert from 'node:assert/strict';
import { discover, agentChat, setBackend, getBackend, uploadShop } from './agent-client.js';

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, '✗ ' + name);
  passed++;
  console.log('  ✓', name);
}

// mock fetch：记录请求并回吐预设响应（agent-client 只读 res.ok + res.json()）。
let lastReq = null;
function mockFetch(handler) {
  globalThis.fetch = async (url, init = {}) => {
    lastReq = { url, init };
    const res = await handler(url, init);
    return {
      ok: res.ok !== false,
      status: res.status || (res.ok === false ? 500 : 200),
      json: async () => res.body,
      text: async () => JSON.stringify(res.body),
    };
  };
}
function runFixture(urlMatch, body) {
  mockFetch((url) => {
    if (url.includes(urlMatch)) return { ok: true, body };
    return { ok: false, status: 404, body: { error: 'not found' } };
  });
}

console.log('Agent Client · /run 确定性 FSM 路由与解析（local 后端）');
setBackend('local');
runFixture('/run', {
  success: true,
  output: {
    merchants: [{ id: 's001', name: '暖暖面馆', avgPrice: 28, reason: '治愈系', cpsTag: false }],
    summary: { decision: { primaryId: 's001', alternatives: [], reason: '最暖' }, provenance: { driver: 'deterministic', processHash: 'sha256:abc' } },
  },
  trace: { steps: [{ title: '筛选', detail: '按条件' }] },
});
const runRes = await discover({ intent: '想吃辣的' });
ok('discover 走 /run 端点', lastReq.url.endsWith('/run'));
ok('discover 用 POST + JSON', lastReq.init.method === 'POST' && lastReq.init.headers['Content-Type'] === 'application/json');
ok('discover 回传 success', runRes.success === true);
ok('discover 解析 merchants', Array.isArray(runRes.output.merchants) && runRes.output.merchants[0].id === 's001');
ok('discover 解析决策契约（primaryId）', runRes.output.summary.decision.primaryId === 's001');
ok('discover 解析 trace（推理时间线）', Array.isArray(runRes.trace.steps) && runRes.trace.steps.length === 1);

console.log('Agent Client · /agent LLM 大脑路由与解析（server 后端）');
setBackend('server');
runFixture('/agent', {
  success: true,
  output: {
    merchants: [{ id: 's006', name: '治愈系小馆', avgPrice: 45, reason: '暖', cpsTag: true }],
    summary: { decision: { primaryId: 's006', alternatives: [], reason: '最治愈' }, provenance: { driver: 'hypha-react', processHash: 'sha256:def' } },
  },
  trace: { steps: [{ title: '理解', detail: '心情' }] },
});
const agentRes = await agentChat({ message: '心情不好', sessionId: 's' });
ok('agentChat 走 /agent 端点', lastReq.url.endsWith('/agent'));
const sentBody = JSON.parse(lastReq.init.body);
ok('agentChat 请求体含 message/sessionId', sentBody.message === '心情不好' && sentBody.sessionId === 's');
ok('agentChat 解析 success + 主推', agentRes.success === true && agentRes.output.summary.decision.primaryId === 's006');

console.log('Agent Client · 清晰化契约透传（needsClarification）');
runFixture('/agent', { success: true, needsClarification: true, question: '几个人吃饭？' });
const clar = await agentChat({ message: '带人吃饭', sessionId: 's' });
ok('needsClarification / question 被原样透传（前端据此追问）', clar.success === true && clar.needsClarification === true && clar.question === '几个人吃饭？');

console.log('Agent Client · 后端切换');
setBackend('local'); ok("setBackend('local') → getBackend()='local'", getBackend() === 'local');
setBackend('server'); ok("setBackend('server') → getBackend()='server'", getBackend() === 'server');
setBackend('bogus'); ok("非法值归位为 'local'（默认本地可跑）", getBackend() === 'local');

console.log('Agent Client · 错误处理（前端据此转「连不上后端」提示）');
mockFetch(() => ({ ok: false, status: 500, body: { error: 'boom' } }));
setBackend('local');
let runThrew = false;
try { await discover({ intent: 'x' }); } catch (e) { runThrew = /\/run/.test(e.message); }
ok('/run 5xx 抛错', runThrew);

mockFetch(() => { throw new Error('network down'); });
setBackend('server');
let netThrew = false;
try { await agentChat({ message: 'x', sessionId: 's' }); } catch { netThrew = true; }
ok('网络不可达抛错（触发前端降级提示）', netThrew);

console.log('Agent Client · 探店采集 uploadShop 路由（SPEC §7.4）');
runFixture('/upload', { decision: 'pending', uploadId: 'u_1', label: '待核验', reason: '高德未匹配且非摊类' });
const upRes = await uploadShop({ name: '神秘私房菜', description: '朋友家做的', isStall: false });
ok('uploadShop 走 /upload 端点', lastReq.url.endsWith('/upload'));
ok('uploadShop 用 POST + JSON', lastReq.init.method === 'POST' && lastReq.init.headers['Content-Type'] === 'application/json');
ok('uploadShop 解析三分支 decision', upRes.decision === 'pending' && upRes.uploadId === 'u_1');

console.log(`\nagent-client.test.mjs 全部通过（${passed} 项）`);
