// 埋点模块测试（无 DOM，node 直接跑，供自动开发循环验收）。
// 覆盖：事件入队 / 本地持久化 / 采样保留与丢弃 / PII 剥离 / 缓冲上限 / 搜索 Top / stats / flush 上报。
function makeStorage() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
  };
}
const { LocalAnalytics, EVENTS } = await import('../src/core/analytics.js');

const NOW = 1700000000000;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

// 1) 事件入队 + 持久化字段
const s1 = makeStorage();
const a1 = new LocalAnalytics({ storage: s1, now: () => NOW, rng: () => 0 });
const r1 = await a1.track('detail_view', { id: 'm1', zone: '首义' });
ok(r1.queued === true && r1.sampled === false, '事件入队成功');
ok(a1.getQueue().length === 1, '队列长度=1');
ok(a1.getQueue()[0].name === 'detail_view', '事件名写入正确');
ok(a1.getQueue()[0].ts === NOW, '时间戳写入正确');

// 2) 重载后从 localStorage 恢复
const a1b = new LocalAnalytics({ storage: s1, now: () => NOW, rng: () => 0 });
ok(a1b.getQueue().length === 1, '重载后从 localStorage 恢复队列');

// 3) 采样保留（rng=0 <= sampleRate 0.5）
const a2 = new LocalAnalytics({ storage: makeStorage(), now: () => NOW, rng: () => 0, sampleRate: 0.5 });
await a2.track('x', {});
ok(a2.getQueue().length === 1, '采样保留（rng=0<=0.5）');

// 4) 采样丢弃（rng=0.99 > sampleRate 0.5）
const a3 = new LocalAnalytics({ storage: makeStorage(), now: () => NOW, rng: () => 0.99, sampleRate: 0.5 });
const r3 = await a3.track('x', {});
ok(r3.queued === false && r3.sampled === true, '采样丢弃（rng=0.99>0.5）');
ok(a3.getQueue().length === 0, '丢弃事件不入队');

// 5) PII 字段剥离
const a4 = new LocalAnalytics({ storage: makeStorage(), now: () => NOW, rng: () => 0 });
await a4.track('detail_view', { id: 'm1', userId: 'u1', phone: '13800000000', email: 'a@b.c', keepOk: 'yes' });
const p4 = a4.getQueue()[0].props;
ok(!('userId' in p4) && !('phone' in p4) && !('email' in p4), 'PII 字段被剥离（userId/phone/email）');
ok(p4.id === 'm1' && p4.keepOk === 'yes', '非 PII 字段保留');

// 6) 嵌套对象不入库存（防意外携带敏感结构）
await a4.track('x', { term: '面', meta: { userId: 'u2' } });
const last4 = a4.getQueue().slice(-1)[0];
ok(!('meta' in last4.props), '嵌套对象不入库（防误带敏感结构）');

// 7) 缓冲上限截断（保留最新）
const a5 = new LocalAnalytics({ storage: makeStorage(), now: () => NOW, rng: () => 0, maxBuffer: 3 });
for (let i = 0; i < 5; i++) await a5.track('e', { i });
ok(a5.getQueue().length === 3, '缓冲上限截断（5→3）');
ok(a5.getQueue()[0].props.i === 2, '丢弃最旧、保留最新');

// 8) 搜索词 Top（§9 搜索词 Top）
const a6 = new LocalAnalytics({ storage: makeStorage(), now: () => NOW, rng: () => 0 });
await a6.track(EVENTS.SEARCH, { term: '热干面', zone: '首义' });
await a6.track(EVENTS.SEARCH, { term: '热干面' });
await a6.track(EVENTS.SEARCH, { term: '烧烤' });
const top = a6.topSearch();
ok(top.length === 2, '搜索词去重计数=2');
ok(top[0].term === '热干面' && top[0].count === 2, 'Top1=热干面(2)');
ok(top[1].term === '烧烤' && top[1].count === 1, 'Top2=烧烤(1)');

// 9) stats 按事件名计数
const st = a6.stats();
ok(st.search === 3 && st.detail_view === undefined, 'stats 按事件名计数');

// 10) flush 上报（BFF 接入点）
let reported = null;
const a7 = new LocalAnalytics({
  storage: makeStorage(), now: () => NOW, rng: () => 0,
  reporter: async (b) => { reported = b; }
});
await a7.track('checkin', { streak: 1 });
await a7.track('checkin', { streak: 2 });
const fr = await a7.flush();
ok(fr.sent === 2, 'flush 上报 2 条');
ok(Array.isArray(reported) && reported.length === 2, 'reporter 收到批次');
ok(a7.getQueue().length === 0, 'flush 后缓冲清空');
ok(reported[0].name === 'checkin' && reported[0].props.streak === 1, '上报批次内容正确');

// 11) 空事件名不入队（防脏数据）
const a8 = new LocalAnalytics({ storage: makeStorage(), now: () => NOW, rng: () => 0 });
const r8 = await a8.track('', { id: 'x' });
ok(r8.queued === false, '空事件名不入队');

console.log(`\n埋点测试： ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
