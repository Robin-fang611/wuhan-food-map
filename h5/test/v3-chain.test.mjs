// V3.2 验收回归：领券 → 收藏 → 查看 全绿（本地、无网络、无 DOM 渲染）。
// 覆盖：rewardEngine.participate('claim') → couponIssuer → LocalStore.addCoupon → getCoupons（查看）
//       → auth.addFavorite → getFavorites（收藏）。并验证同商家重复领券被防刷拦截。
// 红线：不使用 phone/token/user_id 作为新字段名；不引入任何网络/外部调用。

// 确定性内存 localStorage 垫片，保证 node 直接跑且不触碰真实存储。
const mem = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
  }
});

const { setActiveStore, LocalStore, DEMO_USER } = await import('../src/core/store.js');
const { LocalAuthProvider } = await import('../src/core/auth.js');
const { participate } = await import('../src/core/rewardEngine.js');
// 导入即注册所有玩法插件（checkin/lottery/task/claim，真实实现，非 mock）。
await import('../src/plays/index.js');

// 隔离存储 + 账号，避免与全局单例串扰。
setActiveStore(new LocalStore());
const auth = new LocalAuthProvider();
const userId = DEMO_USER;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

const MID = 'm_claim_test';

// —— 1) 领券 ——
const claim = await participate('claim', userId, { merchantId: MID, merchantName: '测试面馆', summary: '满20减5' });
ok(claim.ok === true, '领券成功');
ok(Array.isArray(claim.coupons) && claim.coupons.length === 1, '返回 1 张券');
ok(claim.coupons[0] && claim.coupons[0].title.includes('测试面馆'), '券标题绑定商家名');

// —— 2) 查看（券包）——
const coupons = await (await import('../src/core/store.js')).getActiveStore().getCoupons(userId);
ok(coupons.length >= 1, '券包可见（查看）');
ok(coupons[0].merchant_id === MID, '券绑定正确商家');
ok(coupons[0].status === '已得', '券状态=已得');

// —— 3) 收藏 ——
const favRes = await auth.addFavorite(MID);
ok(favRes.ok === true, '收藏成功');
ok((await auth.getFavorites()).includes(MID), '收藏列表可见（查看）');

// —— 4) 完整链路：领券后券与收藏同时存在 ——
const [c2, f2] = await Promise.all([
  (await import('../src/core/store.js')).getActiveStore().getCoupons(userId),
  auth.getFavorites()
]);
ok(c2.some((c) => c.merchant_id === MID) && f2.includes(MID), '领券+收藏 链路闭环');

// —— 5) 防刷：同商家重复领券被拒 ——
const dup = await participate('claim', userId, { merchantId: MID, merchantName: '测试面馆' });
ok(dup.ok === false, '同商家重复领券被拦截');
ok(/已领取/.test(dup.reason || ''), '拒绝原因含「已领取」');

console.log(`\nV3.2 领券→收藏→查看 链路测试： ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
