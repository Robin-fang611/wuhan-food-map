// 探测：h5 真实模块在 node(ESM) 下能否干净 import + store 在内存 localStorage 下可用。
// 仅用于本机验证，不进入交付。
const NODE = '/Users/onebilion/.workbuddy/binaries/node/versions/22.22.2/bin/node';

// 内存 localStorage 兜底（store.js 用全局 localStorage，无 memoryFallback）
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const H5 = '/Users/onebilion/One Billion/当前项目/美食地图/wuhan-food-map/h5/src';
const mods = [
  `${H5}/core/query.js`,
  `${H5}/core/ranking.js`,
  `${H5}/data/merchants.js`,
  `${H5}/core/auth.js`,
  `${H5}/core/store.js`,
  `${H5}/core/analytics.js`,
  `${H5}/core/couponIssuer.js`,
  `${H5}/plays/checkin.js`,
  `${H5}/plays/claim.js`,
];
for (const m of mods) {
  try {
    const x = await import(m);
    console.log('OK  ', m.split('/').slice(-2).join('/'), '->', Object.keys(x).join(','));
  } catch (e) {
    console.log('FAIL', m.split('/').slice(-2).join('/'), '->', e.message);
  }
}

// 验证 store 在内存下可用 + checkin 发券
const { store } = await import(`${H5}/core/store.js`);
const { checkinPlugin } = await import(`${H5}/plays/checkin.js`);
const { claimPlugin } = await import(`${H5}/plays/claim.js`);
const before = await store.getCoupons('u_test');
const r = await checkinPlugin.participate('u_test');
console.log('checkin ->', JSON.stringify({ streak: r.status.streak, coupons: r.coupons.length }));
const c = await claimPlugin.participate('u_test', { merchantId: 'm0001', merchantName: '兰精灵饺子馆' });
console.log('claim ->', JSON.stringify({ ok: c.ok, coupons: c.coupons.length }));
const after = await store.getCoupons('u_test');
console.log('coupons count:', before.length, '->', after.length);
