// 增长看板指标聚合测试（无 DOM，node 直接跑，供自动开发循环验收）。
// 覆盖：空缓冲、今日/历史 APP_OPEN 分流、SEARCH 聚合、DAU 去重、漏斗累计、dayKeyOf 口径。
const { growthMetrics, dayKeyOf } = await import('../src/ui/growth-dashboard.js');
const { EVENTS } = await import('../src/core/analytics.js');

// 固定"现在"为本地 2026-08-13 10:00，避免时区漂移。
const NOW = new Date(2026, 7, 13, 10, 0, 0).getTime();
const YESTERDAY = new Date(2026, 7, 12, 10, 0, 0).getTime();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

const ev = (name, ts, vid, props = {}) => ({ name, ts, vid, props });

// 1) 空缓冲
const e1 = growthMetrics([], { now: NOW });
ok(e1.sessionsToday === 0 && e1.queriesToday === 0 && e1.dauToday === 0, '空缓冲全零');
ok(e1.todayKey === '2026-8-13', 'todayKey 口径正确');
ok(e1.topSearch.length === 0, '空缓冲无搜索词');
ok(Object.keys(e1.funnel).length === 0, '空缓冲无漏斗');

// 2) 今日 vs 历史 APP_OPEN 分流
const buf2 = [
  ev(EVENTS.APP_OPEN, NOW, 'v1'),
  ev(EVENTS.APP_OPEN, NOW, 'v2'),
  ev(EVENTS.APP_OPEN, YESTERDAY, 'v1') // 历史日，不计入今日
];
const e2 = growthMetrics(buf2, { now: NOW });
ok(e2.sessionsToday === 2, '今日 APP_OPEN=2（历史日不计）');
ok(e2.dauToday === 2, 'DAU=2（今日不同 vid）');
ok(e2.funnel[EVENTS.APP_OPEN] === 3, '漏斗累计 APP_OPEN=3（含历史）');

// 3) SEARCH 聚合到 topSearch + 今日计数
const buf3 = [
  ev(EVENTS.SEARCH, NOW, 'v1', { term: '热干面' }),
  ev(EVENTS.SEARCH, NOW, 'v1', { term: '热干面' }),
  ev(EVENTS.SEARCH, NOW, 'v2', { term: '烧烤' }),
  ev(EVENTS.SEARCH, YESTERDAY, 'v1', { term: '热干面' }) // 历史日不计今日
];
const e3 = growthMetrics(buf3, { now: NOW });
ok(e3.queriesToday === 3, '今日 SEARCH=3（历史日不计）');
ok(e3.topSearch.length === 2, '搜索词去重=2');
// topSearch 为全量热词（更利于看板趋势），故 热干面=3（今日2+历史1）；今日查询数单独由 queriesToday 给出。
ok(e3.topSearch[0].term === '热干面' && e3.topSearch[0].count === 3, 'Top1=热干面(3, 含历史)');
ok(e3.topSearch[1].term === '烧烤' && e3.topSearch[1].count === 1, 'Top2=烧烤(1)');

// 4) dayKeyOf 同 analytics 口径（本地年-月-日）
ok(dayKeyOf(NOW, NOW) === '2026-8-13', 'dayKeyOf 今日');
ok(dayKeyOf(YESTERDAY, NOW) === '2026-8-12', 'dayKeyOf 昨日');

// 5) 脏数据容忍（缺 name / 非对象）
const e5 = growthMetrics([null, { ts: NOW }, ev(EVENTS.FAVORITE, NOW, 'v1', { id: 'm1' })], { now: NOW });
ok(e5.funnel[EVENTS.FAVORITE] === 1, '脏数据跳过、有效事件仍计数');

console.log(`\n增长看板测试： ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
