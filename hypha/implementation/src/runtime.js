// 适配层运行时：内存 localStorage 兜底 + 复用 h5 真实纯函数/数据。
// 约束：纯函数、无 DOM；ui/detail.js 含 h()/DOM，这里不 import，仅抽取其 buildAmapUrl 纯函数逻辑。
import { CAMPUS_COORDS, WUHAN_CENTER, distKm, parsePrice, filterMerchants, listCategories, ratingRank } from '../../../../wuhan-food-map/h5/src/core/query.js';
import { rankMustEat, rankValue, rankLateNight, rankNew } from '../../../../wuhan-food-map/h5/src/core/ranking.js';
import { allMerchants } from '../../../../wuhan-food-map/h5/src/data/all-merchants.js';
import { LocalAuthProvider } from '../../../../wuhan-food-map/h5/src/core/auth.js';
import { store } from '../../../../wuhan-food-map/h5/src/core/store.js';
import { LocalAnalytics, EVENTS } from '../../../../wuhan-food-map/h5/src/core/analytics.js';
import { checkinPlugin } from '../../../../wuhan-food-map/h5/src/plays/checkin.js';
import { claimPlugin } from '../../../../wuhan-food-map/h5/src/plays/claim.js';

// —— 内存 localStorage 兜底（仅本进程；store.js 直接用全局 localStorage，无 memoryFallback）——
const _mem = new Map();
const memStorage = {
  getItem: (k) => (_mem.has(k) ? _mem.get(k) : null),
  setItem: (k, v) => _mem.set(k, String(v)),
  removeItem: (k) => _mem.delete(k),
};
if (typeof globalThis.localStorage === 'undefined' || globalThis.localStorage == null) {
  globalThis.localStorage = memStorage;
}

// 商户全量（用于详情按 id 查找；filter/rank/geo 的入参由调用方传 merchants 数组）。
// V4.4 S2（2026-08-15）：统一口径 = allMerchants（merchants 567 + robin-99 87 + web-stalls 206 = 860），
// 与前端 5 视图同源，Agent 返回 id 天然 ⊂ 前端集合。
export const ALL_MERCHANTS = allMerchants;

export {
  CAMPUS_COORDS, WUHAN_CENTER, distKm, parsePrice, filterMerchants, listCategories, ratingRank,
  rankMustEat, rankValue, rankLateNight, rankNew,
  LocalAuthProvider, store, LocalAnalytics, EVENTS, checkinPlugin, claimPlugin,
};

// 抽取 ui/detail.js 的 buildAmapUrl 纯函数（公开 uri.amap.com，无 Key；缺坐标返回 null）。
// 不复用含 DOM 的 ui 模块，仅复制其纯逻辑，行为与原实现一致。
export function buildAmapUrl(m) {
  if (!m || typeof m.lng !== 'number' || typeof m.lat !== 'number') return null;
  const params = new URLSearchParams({
    position: `${m.lng},${m.lat}`,
    name: m.name || '',
    src: 'manyouwei',
    coordinate: 'gaode',
    callnative: '1',
  });
  return `https://uri.amap.com/marker?${params.toString()}`;
}

// 按 userId 复用 LocalAuthProvider（注入该用户的会话，使收藏按本人隔离且进程内可续）。
const _authCache = new Map();
export function authForUser(userId) {
  if (_authCache.has(userId)) return _authCache.get(userId);
  const base = new Map();
  base.set('myw:auth:session', JSON.stringify({ id: userId, nickname: String(userId), created_at: Date.now() }));
  const stub = {
    getItem: (k) => (base.has(k) ? base.get(k) : null),
    setItem: (k, v) => base.set(k, String(v)),
    removeItem: (k) => base.delete(k),
  };
  const a = new LocalAuthProvider({ storage: stub });
  _authCache.set(userId, a);
  return a;
}

// 单例 analytics（匿名 vid，PII 已剥离）
let _analytics = null;
export function getAnalytics() {
  if (!_analytics) _analytics = new LocalAnalytics();
  return _analytics;
}

// 把商户对象投射为 output.food-recommendation.merchants 的字段（缺字段显式缺省，不编造）。
// 数据层增强后透传丰富字段 + 逐店推荐理由（reason/factors/scoreBreakdown/confidence），
// 使 discover.* 工具、LLM 路径与「财大南湖」geo 路径（均经本投影）也能带出可解释信息。
export function projectMerchant(m, { distanceKm } = {}) {
  return {
    id: m.id ?? null,
    name: m.name ?? null,
    zone: m.zone ?? null,
    category: m.category ?? null,
    cuisine: m.cuisine ?? null,
    mealTime: Array.isArray(m.mealTime) ? m.mealTime : null,
    avgPrice: typeof m.avgPrice === 'string' ? m.avgPrice : (m.avgPrice == null ? null : String(m.avgPrice)),
    avgPriceNum: typeof m.avgPriceNum === 'number' ? m.avgPriceNum : null,
    rating: m.rating ?? null,
    signatureDishes: m.signatureDishes ?? null,
    recommendDishes: m.recommendDishes ?? null,
    taste: m.taste ?? null,
    tasteTags: Array.isArray(m.tasteTags) ? m.tasteTags : null,
    environment: m.environment ?? null,
    environmentRating: typeof m.environmentRating === 'number' ? m.environmentRating : null,
    serviceRating: typeof m.serviceRating === 'number' ? m.serviceRating : null,
    occasions: Array.isArray(m.occasions) ? m.occasions : null,
    tags: Array.isArray(m.tags) ? m.tags : null,
    imageEmoji: m.imageEmoji ?? null,
    reason: m.reason ?? null,
    editorReason: m.editorReason ?? null,
    factors: Array.isArray(m.factors) ? m.factors : null,
    scoreBreakdown: m.scoreBreakdown ?? null,
    confidence: m.dataConfidence ?? m.confidence ?? null,
    address: m.address ?? null,
    lng: typeof m.lng === 'number' ? m.lng : null,
    lat: typeof m.lat === 'number' ? m.lat : null,
    distanceKm: typeof distanceKm === 'number' ? Number(distanceKm.toFixed(2)) : null,
    has_coupon: m.has_coupon === true,
    coupon_summary: m.coupon_summary ?? '',
  };
}
