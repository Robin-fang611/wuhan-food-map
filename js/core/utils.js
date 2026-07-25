/**
 * core/utils.js — 纯工具函数
 *
 * 从 common.js 提取的共享工具：分类映射、价格/距离格式化、收藏、导航等。
 * 无 DOM 依赖，可在任意环境中使用。
 */

/* === 分类颜色映射 === */
export const CATEGORY_COLORS = {
  '南湖推荐': '#B9FF66',
  '五谷杂粮': '#D4A574',
  '早餐': '#FFB400',
  '烧烤': '#FF5A5F',
  '烤肉': '#E85D3C',
  '日式烧鸟&日料': '#5B9BD5',
  '粤&闽菜&潮汕火锅': '#E89B5A',
  '西餐': '#8B5CF6',
  '自助餐': '#10B981',
  '火锅': '#EF4444',
  '苍蝇馆子': '#6B7280',
  '面包甜点': '#F472B6',
  '私房菜': '#7C3AED',
  '韩国菜': '#F59E0B',
  '泰国菜': '#84CC16',
  '湖北菜': '#DC2626',
  '其他国家菜': '#3B82F6',
};

export const CATEGORY_EMOJI = {
  '南湖推荐': '★',
  '五谷杂粮': '五',
  '早餐': '早',
  '烧烤': '烧',
  '烤肉': '烤',
  '日式烧鸟&日料': '日',
  '粤&闽菜&潮汕火锅': '粤',
  '西餐': '西',
  '自助餐': '自',
  '火锅': '锅',
  '苍蝇馆子': '苍',
  '面包甜点': '甜',
  '私房菜': '私',
  '韩国菜': '韩',
  '泰国菜': '泰',
  '湖北菜': '鄂',
  '其他国家菜': '异',
};

/* === 工具函数 === */

/** 获取分类颜色 */
export function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || '#999999';
}

/** 获取分类首字/emoji */
export function getCategoryEmoji(category) {
  return CATEGORY_EMOJI[category] || '食';
}

/** 解析人均价格 — 返回数字（取范围中值） */
export function parseAvgPrice(price) {
  if (!price || price === '') return null;
  const str = String(price).trim();
  if (str.includes('-')) {
    const parts = str.split('-').map(p => parseInt(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return Math.round((parts[0] + parts[1]) / 2);
    }
  }
  const num = parseInt(str);
  return isNaN(num) ? null : num;
}

/** 格式化价格显示 */
export function formatPrice(price) {
  if (!price || price === '') return '未知';
  return '¥' + price + '/人';
}

/** 格式化评分显示 */
export function formatRating(rating) {
  if (!rating || rating === '') return '';
  if (rating === '必吃') return '必吃';
  if (rating === '推荐') return '推荐';
  return rating;
}

/** 获取评分颜色 */
export function getRatingColor(rating) {
  if (rating === '必吃') return '#FF5A5F';
  if (rating === '推荐') return '#D4A574';
  return '#FFB400';
}

/** 格式化距离 */
export function formatDistance(km) {
  if (km === null || km === undefined) return '';
  if (km < 0) return '校内';
  if (km < 1) return Math.round(km * 1000) + 'm';
  return km.toFixed(1) + 'km';
}

/** 生成店铺图片渐变色 */
export function getShopGradient(shop) {
  const color = getCategoryColor(shop.category);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `linear-gradient(135deg, rgba(${r},${g},${b},0.9) 0%, rgba(${r},${g},${b},0.5) 100%)`;
}

/** 防抖 */
export function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/** 打开高德导航 */
export function openNavigation(lng, lat, name) {
  const url = `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(name)}&mode=walk&coordinate=gaode&callnative=1`;
  window.open(url, '_blank');
}

/** LocalStorage 收藏管理 */
export const Favorites = {
  key: 'food_map_favorites',

  get() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || '[]');
    } catch {
      return [];
    }
  },

  toggle(name) {
    const list = this.get();
    const idx = list.indexOf(name);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(name);
    }
    localStorage.setItem(this.key, JSON.stringify(list));
    return idx < 0;
  },

  has(name) {
    return this.get().includes(name);
  },
};
