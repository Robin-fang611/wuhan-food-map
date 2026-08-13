// 增长看板（V3.4）：把"今天吃啥"频次与转化漏斗从本地 analytics 缓冲聚合展示。
//
// 安全约束（红线 §8/§9）：
//   - 纯前端、只读本地缓冲（analytics.getQueue()），reporter 默认 no-op，不向任何外部上报。
//   - DOM 一律 h() 构建（无 innerHTML，防 XSS）；视觉只用 tokens.css 变量。
//   - 不新增任何 PII 字段；今天吃啥频次 = 今日 APP_OPEN（决策时刻）+ 今日 SEARCH（主动查询）。
//
// 度量口径与 analytics.js 对齐：本地日 key = 年-月-日（本地时区），与 LocalAnalytics.dau 一致。

import { h } from './dom.js';
import { analytics, EVENTS } from '../core/analytics.js';

// 本地日 key（与 analytics.dau 同口径）。
export function dayKeyOf(ts, now = Date.now()) {
  const d = new Date(typeof ts === 'number' ? ts : now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 漏斗展示顺序（行为语义，见 §9 事件清单）。
const FUNNEL_ORDER = [
  [EVENTS.APP_OPEN, '启动/会话'],
  [EVENTS.SEARCH, '今天吃啥查询'],
  [EVENTS.DETAIL_VIEW, '商户详情浏览'],
  [EVENTS.NAV_CLICK, '导航到店'],
  [EVENTS.FAVORITE, '收藏'],
  [EVENTS.CLAIM, '领券'],
  [EVENTS.COUPON_ISSUED, '得券'],
  [EVENTS.COUPON_REDEEMED, '核销'],
  [EVENTS.CHECKIN, '签到'],
  [EVENTS.RANK_CLICK, '榜单点击']
];

// 纯函数：从事件缓冲聚合增长指标。无 DOM、可单测。
// buffer: Array<{name, props, ts, vid}>
export function growthMetrics(buffer = [], opts = {}) {
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const todayKey = dayKeyOf(now, now);
  let sessionsToday = 0;   // APP_OPEN 今日 = 今天吃啥决策时刻数
  let queriesToday = 0;    // SEARCH 今日 = 主动决策查询数
  const vidSeen = new Set();
  const funnel = {};
  const searchCounts = {};

  for (const e of buffer) {
    if (!e || typeof e.name !== 'string') continue;
    funnel[e.name] = (funnel[e.name] || 0) + 1;
    const eDay = dayKeyOf(e.ts, now);
    if (e.name === EVENTS.APP_OPEN) {
      if (eDay === todayKey) sessionsToday++;
      if (eDay === todayKey && e.vid) vidSeen.add(e.vid);
    } else if (e.name === EVENTS.SEARCH) {
      if (eDay === todayKey) queriesToday++;
      const t = e.props && typeof e.props.term === 'string' ? e.props.term.trim() : '';
      if (t) searchCounts[t] = (searchCounts[t] || 0) + 1;
    }
  }

  const topSearch = Object.entries(searchCounts)
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, 10);

  return { todayKey, sessionsToday, queriesToday, dauToday: vidSeen.size, funnel, topSearch };
}

function metricItem(label, value, sub) {
  return h('div', { class: 'gd-metric' }, [
    h('div', { class: 'gd-metric-v', text: String(value) }),
    h('div', { class: 'gd-metric-l', text: label }),
    sub ? h('div', { class: 'gd-metric-s muted', text: sub }) : null
  ]);
}

function funnelRows(funnel) {
  const rows = [];
  for (const [name, label] of FUNNEL_ORDER) {
    const count = funnel[name] || 0;
    rows.push(h('div', { class: 'gd-frow' }, [
      h('span', { class: 'gd-flabel', text: label }),
      h('span', { class: 'gd-fcount', text: String(count) })
    ]));
  }
  return rows;
}

function topSearchRows(topSearch) {
  if (!topSearch.length) {
    return [h('div', { class: 'muted', text: '暂无搜索数据（先用起来就会产生）' })];
  }
  return topSearch.map((x) =>
    h('div', { class: 'gd-frow' }, [
      h('span', { class: 'gd-flabel', text: x.term }),
      h('span', { class: 'gd-fcount', text: String(x.count) })
    ])
  );
}

// 看板视图（内部工具）：只读本地埋点，不向外部上报。
export async function GrowthDashboard({ onBack }) {
  const root = h('div');
  const m = growthMetrics(analytics.getQueue());

  root.appendChild(h('div', { class: 'detail-top' }, [
    h('button', { class: 'nav-btn', type: 'button', text: '返回', onclick: onBack }),
    h('span', { class: 'detail-top-title', text: '增长看板 · 内部' })
  ]));

  // 核心指标：今天吃啥频次（今日）
  root.appendChild(h('div', { class: 'section' }, [
    h('h2', { text: '今天吃啥频次（今日）' }),
    h('div', { class: 'card gd-metrics' }, [
      metricItem('决策时刻', m.sessionsToday, 'APP_OPEN 今日'),
      metricItem('主动查询', m.queriesToday, 'SEARCH 今日'),
      metricItem('日活', m.dauToday, '不同访客')
    ])
  ]));

  // 转化漏斗（累计）
  root.appendChild(h('div', { class: 'section' }, [
    h('h2', { text: '转化漏斗（累计）' }),
    h('div', { class: 'card' }, funnelRows(m.funnel))
  ]));

  // 搜索热词 Top
  root.appendChild(h('div', { class: 'section' }, [
    h('h2', { text: '搜索热词 Top' }),
    h('div', { class: 'card' }, topSearchRows(m.topSearch))
  ]));

  root.appendChild(h('div', { class: 'footnote', text: `数据日期 ${m.todayKey} · 来自本机埋点缓冲，仅本机可见，未向任何外部上报。上线后由 BFF 聚合脱敏。` }));
  return root;
}
