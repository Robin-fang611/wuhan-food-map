// skill.discovery-engine：组合 discover.filter / discover.rank / discover.geo 生成候选集，
// 产出满足 output.food-recommendation 契约的推荐（含降级说明）。纯函数、无 DOM、复用真实适配器。
// 数据来源：FoodDataSource（默认 sample，非真实数据集；真实 wuhan 数据集需显式切换）。
import discoverFilter from './tools/filter.js';
import discoverRank from './tools/rank.js';
import discoverGeo from './tools/geo.js';
import { searchMerchants } from '../../../../wuhan-food-map/h5/src/core/query.js';
import { parsePrice, ratingRank } from './runtime.js';
import { explainRecommendation } from './explain.js';
import { getDataSource } from './datasource/index.js';

// 取最近一家（geo 已按距离升序，首元素即最近；缺坐标排后，distanceKm=null 不计）。
function pickNearest(merchants) {
  const withDist = merchants.filter((m) => typeof m.distanceKm === 'number');
  if (!withDist.length) return null;
  return { id: withDist[0].id, name: withDist[0].name, distanceKm: withDist[0].distanceKm };
}

// 最终排序（与 query.js:sortMerchants 口径一致）：price 升序 / rating 降序(次按人均升序)。
function sortBy(list, sort) {
  const arr = list.slice();
  if (sort === 'price') {
    arr.sort((a, b) => (parsePrice(a.avgPrice) ?? Infinity) - (parsePrice(b.avgPrice) ?? Infinity));
  } else {
    arr.sort((a, b) => ratingRank(b.rating) - ratingRank(a.rating)
      || (parsePrice(a.avgPrice) ?? Infinity) - (parsePrice(b.avgPrice) ?? Infinity));
  }
  return arr;
}

// 数据缺口降级说明（对齐 ARCHITECTURE §6.1：缺字段显式缺省 + 不编造）。
function buildDegradation(total, rated, withReason, missingCoords, couponCount) {
  const notes = [];
  if (rated < total) notes.push(`${total - rated} 家暂未评级（不编造评分）`);
  if (withReason < total) notes.push(`${total - withReason} 家缺推荐理由，待探店补充`);
  if (missingCoords > 0) notes.push(`${missingCoords} 家缺坐标，已排后且不编造距离`);
  if (couponCount === 0) notes.push('当前数据暂无在售券，领券玩法待 BFF 接入');
  return notes;
}

export async function runDiscovery(params, dataSource) {
  const {
    zone = '武汉全城', mealTime = [], category = null, maxPrice = null,
    sort = null, board = null, limit = 20, query = '', keyword = '',
    taste = [],
  } = params;
  const tasteTags = Array.isArray(taste) ? taste.filter(Boolean) : [];

  // 口味约束筛选（W1 · 实事求是）：tasteTags 任一命中即入选；0 命中 → 诚实说没有，绝不硬凑。
  function applyTaste(list) {
    if (!tasteTags.length) return list;
    const t = tasteTags.map((x) => String(x).toLowerCase());
    return list.filter((m) => {
      const tags = Array.isArray(m.tasteTags) ? m.tasteTags.map((x) => String(x).toLowerCase()) : [];
      const tasteStr = String(m.taste || '').toLowerCase();
      return t.some((x) => tags.includes(x) || tasteStr.includes(x));
    });
  }

  // 数据来自数据源（默认 sample），不在框架内硬编码具体数据集。
  const ds = dataSource || getDataSource();
  const all = await ds.listMerchants();

  let merchants;
  let ranked_by;
  let keywordMiss = false;
  let missingCoords = 0;

  // —— 关键词优先检索（W1）：店名包含 > 模糊 > 按口味约束回落 > 通用推荐 ——
  const kw = String(keyword || '').trim();
  if (kw) {
    const k = kw.toLowerCase();
    let hits = all.filter((m) => String(m.name || '').toLowerCase().includes(k));
    if (!hits.length) hits = searchMerchants(all, k);
    if (hits.length) {
      hits = applyTaste(hits); // 关键词命中后仍过口味约束（如「健身餐」命中沙拉店再按清淡筛）
    }
    if (hits.length) {
      merchants = hits;
      ranked_by = 'keyword';
      if (zone === '财大南湖周边') {
        const g = await discoverGeo({ merchants, fromZone: zone });
        merchants = g.output.merchants; // 就近优先（关键词命中多家分店/同名店时）
      } else {
        merchants = sortBy(merchants, 'rating'); // 评分优先（同店多分店时口碑在前）
      }
    } else if (tasteTags.length) {
      // 关键词未命中但有口味约束（如「健身餐/清淡」）：给最接近的真实选项并诚实标注非专门店
      const tasteHits = applyTaste(all);
      if (tasteHits.length) {
        merchants = sortBy(tasteHits, 'rating').slice(0, 20);
        ranked_by = 'taste';
        keywordMiss = true;
      } else {
        keywordMiss = true;
      }
    } else {
      keywordMiss = true; // 未命中且无口味约束：回落结构化通用推荐，并显式降级说明
    }
  }

  // 只有「完全未命中」（merchants 未赋值）才走结构化通用回落；taste 回落已给结果时不再覆盖。
  if (merchants === undefined) {
  if (board) {
    // 先按结构化条件收窄，再在子集上排榜（榜内自带评级/场景过滤，更贴合校区范围）。
    const f = await discoverFilter({ merchants: all, zone, categories: category ? [category] : [], mealTime, maxPrice });
    const r = await discoverRank({ merchants: f.output.merchants, board, limit: 0 });
    merchants = r.output.merchants;
    ranked_by = r.output.ranked_by;
  } else {
    const f = await discoverFilter({ merchants: all, zone, categories: category ? [category] : [], mealTime, maxPrice });
    merchants = f.output.merchants;
    ranked_by = sort || 'rating';
  }

  // 就近距离计算（仅对财大南湖周边有意义）；标注缺坐标，不编造距离。
  if (zone === '财大南湖周边') {
    const g = await discoverGeo({ merchants, fromZone: zone });
    merchants = g.output.merchants; // 已附注 distanceKm，并按距离升序
    missingCoords = g.output.missingCoords || 0;
    if (sort === 'distance') ranked_by = 'distance';
    else if (!board) {
      // 非距离排序：按 sort 重新排（price/rating），geo 仅用于附注距离。
      merchants = sortBy(merchants, sort || 'rating');
    }
    // board 场景：保持榜单顺序（ranked_by 已为 board），geo 仅附注距离。
  } else if (!board) {
    merchants = sortBy(merchants, sort || 'rating');
  }
  } // 结束 keywordMiss 回落分支（keyword 命中时已直接赋值 merchants，跳过结构化筛选）

  // 多轮追问：排除已展示过的商户（「换一家」），仅在本轮候选集内剔除，不污染数据源。
  if (Array.isArray(params.exclude) && params.exclude.length) {
    merchants = merchants.filter((m) => !params.exclude.includes(m.id));
  }

  // 关键词未命中：显式降级说明（不假装找到，守诚实红线）。
  if (keywordMiss && !kw) keywordMiss = false;
  

  const limited = (limit && limit > 0) ? merchants.slice(0, limit) : merchants;

  const total = limited.length;
  const rated = limited.filter((m) => m.rating).length;
  const withReason = limited.filter((m) => m.reason).length;
  const couponCount = limited.filter((m) => m.has_coupon).length;

  const degradation = buildDegradation(total, rated, withReason, missingCoords, couponCount);
  if (keywordMiss && kw) {
    if (tasteTags.length && total > 0) {
      degradation.unshift(`未找到「${kw}」专门店；以下为数据库中最接近「${tasteTags.join('/')}」口味的真实店铺（非专门店，请以实际菜单为准）`);
    } else if (tasteTags.length) {
      degradation.unshift(`未找到「${kw}」专门店，且数据库没有符合「${tasteTags.join('/')}」口味的店铺——不硬凑，请试试其他需求`);
    } else {
      degradation.unshift(`未找到含「${kw}」的店铺，以下为附近人气推荐`);
    }
  }
  if (kw && !keywordMiss) {
    degradation.unshift(`已按关键词「${kw}」检索（店名优先${tasteTags.length ? `，口味约束「${tasteTags.join('/')}」` : ''}）`);
  }

  const summary = {
    query: kw || query,
    total_matched: total,
    ranked_by,
    nearest: pickNearest(limited),
    coupon_hint: couponCount > 0 ? `其中 ${couponCount} 家可领券` : '当前数据暂无在售券，领券玩法待 BFF 接入',
    degradation,
  };

  // —— 逐店可解释：为每位候选生成推荐理由 + 因子（确定性，不污染全局数据源对象）——
  const explained = limited.map((m, i) => {
    const ex = explainRecommendation(m, { params, rankIndex: i, totalMatched: total });
    return {
      ...m,
      editorReason: m.editorReason || m.reason || '',
      reason: ex.reason,
      factors: ex.factors,
      scoreBreakdown: ex.scoreBreakdown,
      confidence: ex.confidence,
    };
  });

  return { merchants: explained, summary };
}
