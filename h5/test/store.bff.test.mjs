// BffStore 测试（无 DOM / 无真实后端，transport 可注入，纯逻辑可跑）。
// 覆盖：5 个方法 → 路由/方法/请求体/鉴权头映射；错误与 204 处理；缺配置报错；
//       setActiveStore 切换 + 经奖励引擎(participate)发券的端到端闭环（引擎/玩法/券包零改动）。

// 最小 localStorage 兜底（与 engine.test.mjs 一致，保证模块加载不崩）。
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};

const { BffStore } = await import('../src/core/store.bff.js');
const { store, setActiveStore, getActiveStore, DEMO_USER } = await import('../src/core/store.js');
const { participate, listPlugins } = await import('../src/core/rewardEngine.js');
await import('../src/plays/index.js'); // 注册 checkin 玩法

let pass = 0, fail = 0;
const ok = (c, m) => {
  if (c) { pass++; console.log('  PASS', m); }
  else { fail++; console.log('  FAIL', m); }
};

// —— 可注入的极简 Response ——
const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return body; }
});

// —— Part A：方法 → 路由映射（记录式 fake transport）——
function recordingTransport() {
  const calls = [];
  const send = async (url, opts) => {
    calls.push({ url, method: opts.method, headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : undefined });
    if (url.includes('/checkin') && opts.method === 'GET') return res(200, { streak: 0, lastDate: null, dates: [] });
    if (url.includes('/checkin') && opts.method === 'PUT') return res(200, opts.body ? JSON.parse(opts.body) : {});
    if (url.includes('/coupons') && opts.method === 'GET') return res(200, []);
    if (url.includes('/coupons') && opts.method === 'POST') return res(200, opts.body ? JSON.parse(opts.body).coupon : {});
    if (opts.method === 'PATCH') return res(200, opts.body ? JSON.parse(opts.body).patch : {});
    return res(404, { error: '未知路由' });
  };
  return { calls, send };
}

console.log('\n[A] 路由映射');
{
  const { calls, send } = recordingTransport();
  const s = new BffStore({ baseUrl: 'http://bff.local', transport: send, getToken: () => 'jwt-abc' });

  await s.getCheckin('u_1');
  const c0 = calls[0];
  ok(c0.method === 'GET', 'getCheckin → GET');
  ok(c0.url === 'http://bff.local/api/rewards/checkin?userId=u_1', 'getCheckin 路径与 userId query 正确');
  ok(c0.headers.Authorization === 'Bearer jwt-abc', '带 Authorization 头');

  await s.saveCheckin('u_1', { streak: 3, lastDate: '2026-08-07', dates: ['2026-08-07'] });
  const c1 = calls[1];
  ok(c1.method === 'PUT' && c1.url === 'http://bff.local/api/rewards/checkin', 'saveCheckin → PUT /api/rewards/checkin');
  ok(c1.body.userId === 'u_1' && c1.body.streak === 3, 'saveCheckin 请求体含 userId 与签到数据');

  await s.getCoupons('u_1');
  ok(calls[2].method === 'GET' && calls[2].url.endsWith('/coupons?userId=u_1'), 'getCoupons → GET ?userId=');

  await s.addCoupon('u_1', { id: 'c_x', code: 'MYW-1', title: '通用券' });
  const c3 = calls[3];
  ok(c3.method === 'POST' && c3.url === 'http://bff.local/api/rewards/coupons', 'addCoupon → POST /api/rewards/coupons');
  ok(c3.body.coupon && c3.body.coupon.id === 'c_x', 'addCoupon 请求体含 coupon');

  await s.updateCoupon('u_1', 'c_x', { status: '已核销' });
  const c4 = calls[4];
  ok(c4.method === 'PATCH', 'updateCoupon → PATCH');
  ok(c4.url === 'http://bff.local/api/rewards/coupons/c_x', 'updateCoupon 路径含 :id');
  ok(c4.body.patch.status === '已核销', 'updateCoupon 请求体含 patch');
}

console.log('\n[A2] 错误处理与缺配置');
{
  const errTransport = async () => res(409, { error: '库存不足' });
  const s = new BffStore({ baseUrl: '/api', transport: errTransport });
  let threw = false, reason = '';
  try { await s.getCoupons('u_1'); } catch (e) { threw = true; reason = e.message; }
  ok(threw && reason === '库存不足', '非 2xx 抛错并取 body.error');

  const no204 = new BffStore({ baseUrl: '/api', transport: async () => res(204) });
  ok((await no204.getCheckin('u_1')) === null, '204 返回 null');

  let threw2 = false, msg2 = '';
  try { const t = new BffStore({}); await t.getCheckin('u_1'); }
  catch (e) { threw2 = true; msg2 = e.message; }
  ok(threw2 && msg2.includes('baseUrl'), `未配置 baseUrl 时请求抛错（${msg2}）`);

  // getToken 缺省返回 null → 无 Authorization 头
  const { calls, send } = recordingTransport();
  const s2 = new BffStore({ baseUrl: '/api', transport: send });
  await s2.getCheckin('u_1');
  ok(!calls[0].headers.Authorization, '无 getToken 时不带 Authorization 头');
}

console.log('\n[B] setActiveStore 切换 + 引擎端到端闭环');
{
  // 内存版 BFF 后端（同名 fake transport）
  const state = { checkin: {}, coupons: {} };
  const backend = async (url, opts) => {
    const p = new URL(url, 'http://x');
    const path = p.pathname;
    const uid0 = p.searchParams.get('userId');
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    if (path === '/api/rewards/checkin' && opts.method === 'GET')
      return res(200, state.checkin[uid0] || { streak: 0, lastDate: null, dates: [] });
    if (path === '/api/rewards/checkin' && opts.method === 'PUT') {
      state.checkin[body.userId] = { streak: body.streak, lastDate: body.lastDate, dates: body.dates };
      return res(200, state.checkin[body.userId]);
    }
    if (path === '/api/rewards/coupons' && opts.method === 'GET')
      return res(200, state.coupons[uid0] || []);
    if (path === '/api/rewards/coupons' && opts.method === 'POST') {
      const uu = body.userId; state.coupons[uu] = state.coupons[uu] || []; state.coupons[uu].unshift(body.coupon);
      return res(200, body.coupon);
    }
    if (opts.method === 'PATCH') {
      const m = path.match(/\/api\/rewards\/coupons\/([^/]+)$/);
      const id = m && decodeURIComponent(m[1]);
      const list = state.coupons[body.userId] || [];
      const i = list.findIndex((c) => c.id === id);
      if (i >= 0) { list[i] = { ...list[i], ...body.patch }; return res(200, list[i]); }
      return res(404, { error: '券不存在' });
    }
    return res(404, { error: '未知路由' });
  };

  // 默认是 LocalStore
  ok(getActiveStore().constructor.name === 'LocalStore', '切换前默认 LocalStore');

  setActiveStore(new BffStore({ baseUrl: '', transport: backend }));
  ok(getActiveStore().constructor.name === 'BffStore', 'setActiveStore 后切换为 BffStore');
  ok(listPlugins().some((p) => p.id === 'checkin'), '引擎已注册 checkin（契约未动）');

  const user = 'u_bff';
  const r1 = await participate('checkin', user);
  ok(r1.ok === true, '经 BffStore 签到成功');
  ok(Array.isArray(r1.coupons) && r1.coupons.length === 1, 'BffStore 下发 1 张券');

  // 券确实写入了"后端"（state.coupons）
  const stored = state.coupons[user] || [];
  ok(stored.length === 1 && stored[0].id === r1.coupons[0].id, '券已落到 BFF 后端（store.addCoupon 走网络）');

  // 经 store 读取也走 BffStore（实时绑定；用 getActiveStore 读 live binding，避免快照）
  const readBack = await getActiveStore().getCoupons(user);
  ok(Array.isArray(readBack) && readBack.length === 1, 'getCoupons 走 BffStore 返回后端数据');

  // 同日防重复仍然生效（canParticipate 读 BffStore.getCheckin，lastDate 已是今天）
  const r2 = await participate('checkin', user);
  ok(r2.ok === false && typeof r2.reason === 'string', 'BffStore 下同日重复签到仍被拒');

  // 切回 LocalStore 不影响契约
  setActiveStore(new (await import('../src/core/store.js')).LocalStore());
  ok(getActiveStore().constructor.name === 'LocalStore', '可切回 LocalStore');
}

console.log(`\nBffStore 测试： ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
