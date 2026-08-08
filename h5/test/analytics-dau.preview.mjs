// 预测试：验证"事件 → 可插拔 reporter → DAU 聚合"管线可用（与具体外部服务解耦）。
// 这是接入任何外部监测服务（百度统计 / Umeng / 自建 BFF）前的本地可行性验证：
// 只要 reporter 换成真实上报实现，事件流即可送达；DAU 由匿名 vid 的 APP_OPEN 去重得出。
import { LocalAnalytics, EVENTS } from '../src/core/analytics.js';

let failed = 0;
const assert = (cond, msg) => { if (!cond) { console.error('  ✗', msg); failed++; } else { console.log('  ✓', msg); } };

// 捕获型 reporter（模拟真实上报端点，本地验证用）。
function captureReporter() {
  const received = [];
  const fn = async (batch) => { received.push(...batch); };
  fn.received = received;
  return fn;
}

console.log('— 预测试：匿名访客 ID + APP_OPEN 事件→reporter→DAU —');

// 三个不同访客（各自独立 storage / vid），同一天打开 App。
const mkVisitor = (vid) => new LocalAnalytics({
  storage: (() => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; })(),
  vid,
  reporter: captureReporter(),
  now: () => new Date('2026-08-08T10:00:00').getTime(),
});

const v1 = mkVisitor('vid-1');
const v2 = mkVisitor('vid-2');
const v3 = mkVisitor('vid-3');

await v1.track(EVENTS.APP_OPEN);
await v2.track(EVENTS.APP_OPEN);
await v2.track(EVENTS.DETAIL_VIEW, { id: 'm1', zone: '首义' });
await v3.track(EVENTS.APP_OPEN);

// flush 把所有缓冲交给 reporter（外部服务的接入点）。
await v1.flush(); await v2.flush(); await v3.flush();

// 聚合：把三个访客收到的事件合并，按 vid 去重统计当日 APP_OPEN。
const all = [...v1.reporter.received, ...v2.reporter.received, ...v3.reporter.received];
assert(all.length === 4, `reporter 共收到 4 个事件（实际 ${all.length}）`);
assert(all.every((e) => typeof e.vid === 'string' && e.vid), '每个事件都带有匿名 vid');

const openedVids = new Set(all.filter((e) => e.name === EVENTS.APP_OPEN).map((e) => e.vid));
assert(openedVids.size === 3, `当日 DAU = 3（实际 ${openedVids.size}）`);

// 验证 dau() 助手：用"未 flush 的实例"或"直接基于已上报事件"去重。
// 注意 flush() 会清空本地缓冲，故对已 flush 实例改用 received 事件聚合验证。
const dauFrom = (events) => new Set(events.filter((e) => e.name === EVENTS.APP_OPEN).map((e) => e.vid)).size;
assert(dauFrom(v1.reporter.received) === 1, 'v1 当日 DAU = 1');
assert(dauFrom(v2.reporter.received) === 1, 'v2 当日 DAU = 1');
assert(dauFrom(v3.reporter.received) === 1, 'v3 当日 DAU = 1');

// dau() 方法在前端内存态（未 flush）场景下同样可用：新建一个未 flush 实例验证。
const v4 = new LocalAnalytics({ vid: 'vid-4', now: () => new Date('2026-08-08T12:00:00').getTime() });
await v4.track(EVENTS.APP_OPEN);
await v4.track(EVENTS.APP_OPEN); // 同日同访客重复打开，DAU 仍记为 1
assert(v4.dau() === 1, 'v4 同日重复打开 DAU 仍为 1');

console.log(failed === 0 ? '\n预测试通过 ✅' : `\n预测试失败 ❌（${failed} 项）`);
process.exit(failed === 0 ? 0 : 1);
