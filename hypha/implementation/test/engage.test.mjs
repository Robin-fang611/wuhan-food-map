// 集成测试：经本机工具服务验证 Engage 状态（favorite / checkin / claim / viewWallet）的治理，
// 并覆盖 Track（analytics.track PII 剥离）与 discovery 的降级标注 + 红线校验（eval.redline-check）。
//
// 在独立测试端口(:8797)起 httpServer，避免干扰常驻 :8799 服务或外部 :8788。
// 验证口径对齐 ARCHITECTURE.md 步骤 6 / 步骤 8 完成条件：
//   - favorite/checkin/claim/viewWallet 经 Agent 治理返回预期，幂等，本人 scope；
//   - 输出绝不回显 user_id / phone / token 等 PII（守 data.export-pii 红线）；
//   - analytics.track 入库事件不含 PII；
//   - discovery 输出 summary 含 total_matched 与 degradation（数据缺口显式标注，不编造）。
import assert from 'node:assert/strict';

process.env.MYWO_PORT = '8797';
const { server } = await import('../src/httpServer.js');
const { getAnalytics } = await import('../src/runtime.js');
const { redlineCheck } = await import('../src/orchestrator.js');

const BASE = `http://127.0.0.1:${process.env.MYWO_PORT}`;
const UID = 'utest-engage';
const MID = 'm-test-engage';

async function callTool(id, body) {
  const res = await fetch(`${BASE}/tools/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}
async function runDiscovery(input) {
  const res = await fetch(`${BASE}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.json();
}

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, '✗ ' + name);
  passed++;
  console.log('  ✓', name);
}

// —— 1. favorite 幂等 + 无 PII 回显 ——
console.log('Engage · user.favorite');
const fa1 = await callTool('user.favorite', { merchantId: MID, action: 'add', userId: UID });
ok('add → success & favorited=true', fa1.success && fa1.output.favorited === true);
ok('add 输出无 userId 回显', !('userId' in (fa1.output || {})));
const fa2 = await callTool('user.favorite', { merchantId: MID, action: 'remove', userId: UID });
ok('remove → success & favorited=false', fa2.success && fa2.output.favorited === false);
const fa3 = await callTool('user.favorite', { merchantId: MID, action: 'remove', userId: UID });
ok('remove 重复不报错（幂等）', fa3.success && fa3.output.favorited === false);

// —— 2. checkin 同日幂等 ——
console.log('Engage · reward.checkin');
const ck1 = await callTool('reward.checkin', { userId: UID });
ok('首次签到 idempotent≠true', ck1.success && ck1.output.idempotent !== true);
const ck2 = await callTool('reward.checkin', { userId: UID });
ok('同日重复签到 idempotent===true', ck2.success && ck2.output.idempotent === true);

// —— 3. claim 每商家每用户限 1 + 无 PII ——
console.log('Engage · reward.claim');
const cl1 = await callTool('reward.claim', { userId: UID, merchantId: MID });
ok('首次领券 idempotent≠true', cl1.success && cl1.output.idempotent !== true);
ok('首次领券发 1 张', Array.isArray(cl1.output.coupons) && cl1.output.coupons.length === 1);
ok('券投射无 user_id', cl1.output.coupons.every((c) => !('user_id' in c)));
const cl2 = await callTool('reward.claim', { userId: UID, merchantId: MID });
ok('重复领券 idempotent===true', cl2.success && cl2.output.idempotent === true);
ok('重复领券不发新券', Array.isArray(cl2.output.coupons) && cl2.output.coupons.length === 1);

// —— 4. view-wallet 仅本人 + 无 PII 回显 ——
console.log('Engage · reward.view-wallet');
const w = await callTool('reward.view-wallet', { userId: UID });
ok('viewWallet success', w.success);
ok('viewWallet 无 userId 回显', !('userId' in (w.output || {})));
ok('viewWallet count≥1（含已领券）', w.output.count >= 1);
ok('viewWallet 券无 user_id', w.output.coupons.every((c) => !('user_id' in c)));

// —— 5. Track：analytics.track 入库剥离 PII ——
console.log('Track · analytics.track');
const tr = await callTool('analytics.track', {
  event: 'search',
  payload: { user_id: 'u-pii', phone: '13800000000', name: '张三', term: '南湖宵夜' },
});
ok('track queued & piiStripped', tr.success && tr.output.queued === true && tr.output.piiStripped === true);
const last = getAnalytics().getQueue().slice(-1)[0];
ok('入库事件保留非 PII 维度 term', last && last.props && last.props.term === '南湖宵夜');
ok('入库事件不含 user_id/phone/name', last && !('user_id' in (last.props || {})) && !('phone' in (last.props || {})) && !('name' in (last.props || {})));

// —— 6. Discovery：降级标注 + 红线校验 ——
console.log('Discovery · degradation + redline');
const d = await runDiscovery({ intent: '南湖附近便宜的宵夜' });
ok('discovery success & 有商户', d.success && Array.isArray(d.output.merchants));
ok('summary.total_matched 为数字', typeof d.output.summary.total_matched === 'number');
ok('summary.degradation 为数组（数据缺口显式标注）', Array.isArray(d.output.summary.degradation));
const bad = redlineCheck({ merchants: [{ user_id: 'x' }], summary: {} });
ok('redlineCheck 拒绝含 PII 输出（data.export-pii）', bad.passed === false && bad.violations.includes('data.export-pii'));
const good = redlineCheck({ merchants: [], summary: {} });
ok('redlineCheck 放行干净输出', good.passed === true);

console.log(`\nALL ENGAGE/Track/Redline TESTS PASSED (${passed} assertions)`);
server.close();
process.exit(0);
