// 发现/列表/搜索/筛选 —— 纯函数（无 DOM、无副作用，可在 node 直接测试，见 test/query.test.mjs）。
// 操作对象：统一商户表（schema 见 §5）。所有函数对入参数组不修改、返回新数组。
// 设计要点：筛选/搜索/排序三者解耦，UI 层按需组合；均价解析、评分权重、距离计算都在此集中。

// 片区参考坐标（GCJ-02，近似值，仅用于同片区内的「距离」排序，非精确导航）。
export const CAMPUS_COORDS = {
  '财大南湖周边': { lng: 114.370, lat: 30.480 },
  '武汉全城': { lng: 114.3055, lat: 30.5928 }
};
export const WUHAN_CENTER = { lng: 114.3055, lat: 30.5928 };

// 评分权重：必吃 > 推荐 > 其他/空缺。排序时按此降序。
export function ratingRank(r) {
  if (r === '必吃') return 3;
  if (r === '推荐') return 2;
  if (typeof r === 'number' && r > 0) return 1;   // 数值型评级兜底（数据中暂未出现）
  return 0;
}

// 均价解析：数据里 avgPrice 是字符串，可能为空。返回 number 或 null。
export function parsePrice(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

// 两点球面距离（km）。a/b 需含 lng、lat 字段（商户或参考坐标都行）。
export function distKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 模糊搜索：店名 / 招牌菜 / 细分口味(cuisine) / 理由(reason) 任一含关键词即命中（大小写不敏感）。
export function searchMerchants(list, keyword) {
  const k = (keyword || '').trim().toLowerCase();
  if (!k) return list.slice();
  return list.filter((m) => {
    const hay = [m.name, m.signatureDishes, m.cuisine, m.reason]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(k);
  });
}

/**
 * 组合筛选。
 * @param {Array} list 商户数组
 * @param {object} opts
 *   zone         {string}         片区：财大南湖周边/武汉全城（缺省或 '' 不过滤）
 *   categories   {string[]}       分类多选（空数组=不限）
 *   mealTime     {string[]}       场景多选 早/午/晚/夜宵（空=不限）
 *   maxPrice     {number|null}    人均上限（null=不限；均价空缺的店在设上限时被排除）
 *   keyword      {string}         模糊关键词（店名+招牌菜等）
 */
export function filterMerchants(list, opts = {}) {
  const { zone = '', categories = [], mealTime = [], maxPrice = null, keyword = '' } = opts;
  let out = list;
  if (zone) out = out.filter((m) => m.zone === zone);
  if (categories && categories.length) out = out.filter((m) => categories.includes(m.category));
  if (mealTime && mealTime.length) {
    out = out.filter((m) => Array.isArray(m.mealTime) && m.mealTime.some((t) => mealTime.includes(t)));
  }
  if (maxPrice != null) {
    out = out.filter((m) => {
      const p = parsePrice(m.avgPrice);
      return p != null && p <= maxPrice;
    });
  }
  if (keyword && keyword.trim()) out = searchMerchants(out, keyword);
  return out;
}

/**
 * 排序。
 * @param {Array} list
 * @param {object} o
 *   sort       'rating' | 'price' | 'distance'（默认 rating）
 *   fromCoord  距离排序的参考点 {lng,lat}（如校区坐标）
 */
export function sortMerchants(list, o = {}) {
  const { sort = 'rating', fromCoord = null } = o;
  const arr = list.slice();
  if (sort === 'price') {
    arr.sort((a, b) => (parsePrice(a.avgPrice) ?? Infinity) - (parsePrice(b.avgPrice) ?? Infinity));
  } else if (sort === 'distance' && fromCoord) {
    arr.sort((a, b) => distKm(a, fromCoord) - distKm(b, fromCoord));
  } else {
    // 评分降序；同分按人均升序做稳定次级排序
    arr.sort((a, b) => ratingRank(b.rating) - ratingRank(a.rating)
      || (parsePrice(a.avgPrice) ?? Infinity) - (parsePrice(b.avgPrice) ?? Infinity));
  }
  return arr;
}

// 便捷：从数据派生可选分类（去重、按出现频次降序，供筛选 chips 渲染）。
export function listCategories(list) {
  const freq = new Map();
  for (const m of list) freq.set(m.category, (freq.get(m.category) || 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
