// 榜单 —— 纯函数（无 DOM、无副作用，可在 node 直接测试，见 test/ranking.test.mjs）。
// 依赖 core/query.js 的 ratingRank / parsePrice，保持评分权重与价格解析口径与列表页一致。
// 所有函数对入参数组不修改、返回新数组。

import { ratingRank, parsePrice } from './query.js';

// 必吃榜：仅 rating=必吃，按评分降序（恒为必吃）、人均升序、店名字典序稳定排序。
export function rankMustEat(list, opts = {}) {
  const { limit = 0 } = opts;
  const arr = list
    .filter((m) => m.rating === '必吃')
    .map((m) => ({ m, w: ratingRank(m.rating), p: parsePrice(m.avgPrice) ?? Infinity }))
    .sort((a, b) => b.w - a.w || a.p - b.p || (a.m.name || '').localeCompare(b.m.name || ''))
    .map((x) => x.m);
  return limit > 0 ? arr.slice(0, limit) : arr;
}

// 性价比榜：有评级(必吃/推荐)且有均价，按 评分权重/人均 降序（越高越"值"），次按人均升序。
export function rankValue(list, opts = {}) {
  const { limit = 0 } = opts;
  const arr = list
    .filter((m) => (m.rating === '必吃' || m.rating === '推荐') && parsePrice(m.avgPrice) != null)
    .map((m) => {
      const p = parsePrice(m.avgPrice);
      return { m, score: ratingRank(m.rating) / p, p };
    })
    .sort((a, b) => b.score - a.score || a.p - b.p || (a.m.name || '').localeCompare(b.m.name || ''))
    .map((x) => x.m);
  return limit > 0 ? arr.slice(0, limit) : arr;
}

// 夜宵榜：mealTime 含「夜宵」，按评分降序、人均升序、店名字典序。
export function rankLateNight(list, opts = {}) {
  const { limit = 0 } = opts;
  const arr = list
    .filter((m) => Array.isArray(m.mealTime) && m.mealTime.includes('夜宵'))
    .map((m) => ({ m, w: ratingRank(m.rating), p: parsePrice(m.avgPrice) ?? Infinity }))
    .sort((a, b) => b.w - a.w || a.p - b.p || (a.m.name || '').localeCompare(b.m.name || ''))
    .map((x) => x.m);
  return limit > 0 ? arr.slice(0, limit) : arr;
}

// 新收录：数据暂无 created_at，以 source=地推（地推新录入）视为新收录，按 id 倒序（越靠后越新）。
export function rankNew(list, opts = {}) {
  const { limit = 0 } = opts;
  const idNum = (id) => parseInt(String(id || '').replace(/\D/g, ''), 10) || 0;
  const arr = list
    .filter((m) => m.source === '地推')
    .slice()
    .sort((a, b) => idNum(b.id) - idNum(a.id) || (a.name || '').localeCompare(b.name || ''));
  return limit > 0 ? arr.slice(0, limit) : arr;
}

// 一次性构建全部榜单，便于 UI 调用；limit 控制每榜条数（默认 10，0=不限）。
export function buildRankings(list, opts = {}) {
  const limit = opts.limit ?? 10;
  return {
    mustEat: rankMustEat(list, { limit }),
    value: rankValue(list, { limit }),
    lateNight: rankLateNight(list, { limit }),
    newest: rankNew(list, { limit })
  };
}
