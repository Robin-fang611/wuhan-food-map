// 核销引擎测试（M14，无 DOM，node 直接跑）。
// 覆盖：券码归一 / 核销资格(幂等+过期) / 按码查找 / 端到端核销与重复拦截。
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => Array.from(mem.keys())[i] ?? null,
  get length() { return mem.size; }
};

const { store, DEMO_USER } = await import('../src/core/store.js');
const { issueCoupon } = await import('../src/core/couponIssuer.js');
const { normalizeCode, canRedeem, findCouponByCode, redeem } = await import('../src/core/redemption.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

// —— 券码归一 ——
ok(normalizeCode('  myw-7f3k-2q9x ') === 'MYW-7F3K-2Q9X', '小写+空白被归一为大写无空白');
ok(normalizeCode('#MYW-7F3K-2Q9X!') === 'MYW-7F3K-2Q9X', '非法符号被剥离，连字符保留');
ok(normalizeCode('') === '', '空输入归一为空');
ok(normalizeCode(null) === '', 'null 归一为空');

// —— 核销资格（纯函数）——
const base = { id: 'c1', code: 'MYW-0000-0001', status: '已得', expires_at: Date.now() + 86400000 };
ok(canRedeem(base).ok === true, '正常券可核销');
ok(canRedeem({ ...base, status: '已核销' }).ok === false, '已核销不可重复核销');
ok(canRedeem({ ...base, status: '已核销' }).reason.includes('已核销'), '已核销拒绝带原因');
ok(canRedeem({ ...base, status: '已过期' }).ok === false, '已过期不可核销');
ok(canRedeem({ ...base, expires_at: Date.now() - 1000 }).ok === false, 'expire_at 过期不可核销');
ok(canRedeem(null).ok === false, '无券对象不可核销');

// —— 按码查找 ——
const issued = await issueCoupon(DEMO_USER, { title: '测试券', discountDesc: '满20减3', playType: 'checkin', amount: 3 });
ok(typeof issued.code === 'string' && issued.code.length > 0, '发放一张测试券');
ok(findCouponByCode(issued.code) !== null, '按精确码查到');
ok(findCouponByCode(issued.code.toLowerCase()) !== null, '按小写码也能查到（归一）');
ok(findCouponByCode('MYW-NOPE-NOPE') === null, '未知码返回 null');

// —— 端到端核销 + 幂等 ——
const now = Date.now();
const r1 = await redeem(issued.code, { now });
ok(r1.ok === true, '端到端核销成功');
ok(r1.coupon.status === '已核销', '券状态置为已核销');
ok(typeof r1.coupon.redeemed_at === 'number', '写入核销时间');
const persisted = (await store.getCoupons(DEMO_USER)).find((c) => c.id === issued.id);
ok(persisted && persisted.status === '已核销', '核销结果已持久化');

const r2 = await redeem(issued.code, { now });
ok(r2.ok === false, '重复核销被拒（幂等）');
ok(r2.reason.includes('已核销'), '重复核销原因正确');

const r3 = await redeem('MYW-NOPE-NOPE', { now });
ok(r3.ok === false && r3.reason.includes('不存在'), '未知码无法核销');

// —— 过期券 ——
const exp = await issueCoupon(DEMO_USER, { title: '过期券', discountDesc: 'x', playType: 'checkin', amount: 1 });
await store.updateCoupon(DEMO_USER, exp.id, { expires_at: now - 1000 });
const r4 = await redeem(exp.code, { now });
ok(r4.ok === false && r4.reason.includes('过期'), '过期券无法核销');

console.log(`\n核销引擎测试： ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
