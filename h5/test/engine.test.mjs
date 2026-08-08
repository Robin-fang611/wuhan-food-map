// 引擎核心闭环测试（无 DOM，可在 node 直接跑，供自动开发循环做验收）。
// 覆盖：奖励引擎注册、签到发券、券码格式、同日防重复、持久化。
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};

const { store, DEMO_USER } = await import('../src/core/store.js');
const { participate } = await import('../src/core/rewardEngine.js');
await import('../src/plays/index.js'); // 注册 checkin 玩法

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

const coupons0 = await store.getCoupons(DEMO_USER);
ok(coupons0.length === 0, '初始券包为空');

const r1 = await participate('checkin', DEMO_USER);
ok(r1.ok === true, '首次签到成功');
ok(Array.isArray(r1.coupons) && r1.coupons.length === 1, '首发 1 张券');
ok(r1.coupons[0].code.startsWith('MYW-'), '券码格式 MYW-****-****');
ok(r1.coupons[0].status === '已得', '券状态=已得');
ok(r1.status.streak === 1, '连续天数=1');

const r2 = await participate('checkin', DEMO_USER);
ok(r2.ok === false, '同日重复签到被拒（防作弊）');
ok(typeof r2.reason === 'string' && r2.reason.length > 0, '拒绝带原因');

const coupons1 = await store.getCoupons(DEMO_USER);
ok(coupons1.length === 1, '券已持久化到存储');

console.log(`\n引擎测试： ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
