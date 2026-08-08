// 新玩法插件测试（M15：lottery / task / claim）。
// 覆盖：注册后 listPlugins 含新 id；participate 经 CouponIssuer 发券；
// 限频/防重复（§8 防刷）；引擎与券包接口未被破坏。无 DOM，node 直接跑。
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};

const { store, DEMO_USER } = await import('../src/core/store.js');
const { listPlugins, participate, getStatus } = await import('../src/core/rewardEngine.js');
await import('../src/plays/index.js'); // 注册全部玩法（含本轮新增）

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

// 1) 注册：listPlugins 含新 id，且 checkin 仍在（引擎/券包无改动）
const ids = listPlugins().map((p) => p.id);
ok(ids.includes('checkin'), 'listPlugins 含 checkin（原有玩法未受影响）');
ok(ids.includes('lottery'), 'listPlugins 含 lottery（新增玩法已注册）');
ok(ids.includes('task'), 'listPlugins 含 task（新增玩法已注册）');
ok(ids.includes('claim'), 'listPlugins 含 claim（新增玩法已注册）');

// 2) lottery：每日限频 + 经 CouponIssuer 发券 + 确定性 rng
const { lotteryPlugin } = await import('../src/plays/lottery.js');
lotteryPlugin.rng = () => 0; // 必中第一个奖品（权重最大，amount=2）
const beforeL = (await store.getCoupons(DEMO_USER)).length;
const rl = await participate('lottery', DEMO_USER);
ok(rl.ok === true, 'lottery 首次参与成功');
ok(rl.coupons.length === 1 && rl.coupons[0].play_type === 'lottery', 'lottery 发券 play_type=lottery');
ok(rl.coupons[0].code.startsWith('MYW-'), 'lottery 券码格式 MYW-****-****');
ok(rl.prize && rl.prize.amount === 2, 'lottery 确定性 rng 命中首奖(amount=2)');
ok((await store.getCoupons(DEMO_USER)).length === beforeL + 1, 'lottery 券已持久化');
const rl2 = await participate('lottery', DEMO_USER);
ok(rl2.ok === false, 'lottery 同日重复抽奖被拒（限频防刷）');
ok(typeof rl2.reason === 'string' && rl2.reason.length > 0, 'lottery 拒绝带原因');

// 3) task：一次性，不可重复
const beforeT = (await store.getCoupons(DEMO_USER)).length;
const rt = await participate('task', DEMO_USER);
ok(rt.ok === true, 'task 首次参与成功');
ok(rt.coupons[0].play_type === 'task', 'task 发券 play_type=task');
ok((await store.getCoupons(DEMO_USER)).length === beforeT + 1, 'task 券已持久化');
const rt2 = await participate('task', DEMO_USER);
ok(rt2.ok === false, 'task 重复领取被拒（一次性）');

// 4) claim：绑定商家 + 每商家限领 1 张
const mid = 'm0001';
const beforeC = (await store.getCoupons(DEMO_USER)).length;
const rc = await participate('claim', DEMO_USER, { merchantId: mid, merchantName: '测试商家', summary: '满20减5' });
ok(rc.ok === true, 'claim 首次领券成功');
ok(rc.coupons[0].play_type === 'claim', 'claim 发券 play_type=claim');
ok(rc.coupons[0].merchant_id === mid, 'claim 券绑定 merchant_id');
ok(rc.coupons[0].title.includes('测试商家'), 'claim 券标题含商家名');
ok((await store.getCoupons(DEMO_USER)).length === beforeC + 1, 'claim 券已持久化');
const rc2 = await participate('claim', DEMO_USER, { merchantId: mid });
ok(rc2.ok === false, 'claim 同商家重复领取被拒');
// 不同商家可领
const rc3 = await participate('claim', DEMO_USER, { merchantId: 'm0002', merchantName: '另一家', summary: '满30减8' });
ok(rc3.ok === true, 'claim 不同商家可再领（每商家限 1 张）');
// 缺 merchantId 被拒
const rc4 = await participate('claim', DEMO_USER, {});
ok(rc4.ok === false, 'claim 缺 merchantId 被拒');

// 5) getStatus 接口可用（UI 面板依赖）
const ls = await getStatus('lottery', DEMO_USER);
ok(ls && typeof ls.canDraw === 'boolean', 'lottery.getStatus 返回 canDraw');
const ts = await getStatus('task', DEMO_USER);
ok(ts && ts.done === true, 'task.getStatus 返回 done=true（已领）');
const cs = await getStatus('claim', DEMO_USER, { merchantId: mid });
ok(cs && cs.claimed === true, 'claim.getStatus 返回 claimed=true（已领该商家）');

console.log(`\n新玩法插件测试： ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
