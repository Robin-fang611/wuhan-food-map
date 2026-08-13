// explain.js —— 确定性「逐店推荐理由引擎」（无 LLM 依赖）。
//
// 职责：为单个候选商户生成可解释的推荐结论，把「为什么推荐这家」讲清楚、可回放：
//   reason         一句话推荐理由（落到具体事实，绝不编造评分/价格/心情）
//   factors[]      推荐因子（{type,label,detail}），前端逐条展示
//   scoreBreakdown 因子权重拆解（确定性，仅作可解释展示，不参与真实排序）
//   confidence     数据置信度（verified/estimated），前端据其实名标注「待核验」
//
// 红线：全部内容仅由 params + 商户真实字段推导；缺字段显式「待核验」，不编造。
// 与 §8「数据不编造」一致：estimated 商户的口味/环境是算法按品类推导，引擎如实标注。
import { parsePrice } from './runtime.js';

// 评分档 → 文案（与 ranking 口径一致，仅用于展示）
const RATING_TEXT = { '必吃': '必吃', '推荐': '推荐', '还行': '还行' };

// 取人均数值：优先 avgPriceNum，否则解析 avgPrice 字符串（兼容旧字段）
function priceNum(m) {
  if (typeof m.avgPriceNum === 'number') return m.avgPriceNum;
  return parsePrice(m.avgPrice);
}

// 把招牌菜/推荐菜字段（字符串或数组）拆成干净数组（最多 4 条）
function splitDishes(s) {
  if (Array.isArray(s)) return s.filter(Boolean);
  if (typeof s !== 'string' || !s) return [];
  return s.split(/[、,，/]/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
}

// 因子权重（确定性，仅用于 scoreBreakdown 展示，绝不影响入选/排序）
const WEIGHTS = {
  category: 0.20, taste: 0.18, price: 0.16, rating: 0.16,
  distance: 0.12, trust: 0.10, dish: 0.08, occasion: 0.06, coupon: 0.04,
};

// 主入口：为单个商户生成可解释推荐结论。
// @param m   商户对象（真实字段：category/tasteTags/taste/avgPrice/rating/distanceKm/dataConfidence/occasions/recommendDishes/...）
// @param ctx { params, rankIndex=0, totalMatched=0 }
// @returns { reason, factors[], scoreBreakdown, confidence }
export function explainRecommendation(m, ctx = {}) {
  const params = ctx.params || {};
  const factors = [];

  // 1) 品类对味
  if (params.category && m.category === params.category) {
    factors.push({ type: 'category', label: '品类对味', detail: `正好是你点的「${params.category}」` });
  }

  // 2) 口味 / 心情合拍（软信号；缺则降级为「口味参考」，不编造匹配）
  const wantTaste = []
    .concat(Array.isArray(params.taste) ? params.taste : [])
    .concat(params.mood ? [params.mood] : [])
    .filter(Boolean);
  const haveTaste = []
    .concat(Array.isArray(m.tasteTags) ? m.tasteTags : [])
    .concat(m.taste ? [m.taste] : [])
    .filter(Boolean);
  if (wantTaste.length && haveTaste.length) {
    const hit = wantTaste.filter((w) => haveTaste.some((h) => h.includes(w) || w.includes(h)));
    if (hit.length) {
      factors.push({ type: 'taste', label: '口味合拍', detail: `主打「${haveTaste.slice(0, 3).join('/')}」，正中你「${hit.join('/')}」的偏好` });
    } else {
      factors.push({ type: 'taste', label: '口味参考', detail: `它家口味是「${haveTaste.slice(0, 3).join('/')}」` });
    }
  }

  // 3) 预算内 / 平价
  const p = priceNum(m);
  if (typeof params.maxPrice === 'number' && typeof p === 'number' && p <= params.maxPrice) {
    factors.push({ type: 'price', label: '预算内', detail: `人均 ¥${p} ≤ 你的 ¥${params.maxPrice} 预算` });
  } else if (typeof p === 'number' && p <= 30) {
    factors.push({ type: 'price', label: '平价', detail: `人均 ¥${p}，钱包无压力` });
  }

  // 4) 口碑
  if (m.rating === '必吃') {
    factors.push({ type: 'rating', label: '高分口碑', detail: `口碑「必吃」，本地人反复打卡` });
  } else if (m.rating === '推荐') {
    factors.push({ type: 'rating', label: '口碑不错', detail: `口碑「推荐」，踩雷概率低` });
  }

  // 5) 离你近（仅财大南湖周边等计算过距离的片区有意义）
  if (typeof m.distanceKm === 'number') {
    factors.push({ type: 'distance', label: '离你近', detail: `距你约 ${m.distanceKm}km` });
  }

  // 6) 真实核验（信任信号；重要：这是「反广告」内核——排序从不出卖，核验只增信不增权重特权）
  if (m.dataConfidence === 'verified' || (m.source && String(m.source).includes('verified'))) {
    factors.push({ type: 'trust', label: '真实核验', detail: `已联网核验的武汉真实名店，信息可靠` });
  }

  // 7) 招牌硬菜
  const dishes = splitDishes(m.recommendDishes).concat(splitDishes(m.signatureDishes));
  if (dishes.length) {
    factors.push({ type: 'dish', label: '招牌硬菜', detail: `必点：${dishes.slice(0, 3).join('、')}` });
  }

  // 8) 可领券（纯 CPS 透明，不影响排序/入选——防火墙）
  if (m.has_coupon) {
    factors.push({ type: 'coupon', label: '可领券', detail: `有在售券，到店核销更划算（CPS 透明，不影响排序）` });
  }

  // 9) 场景合适（用餐时段 ↔ 适配场景）
  if (Array.isArray(m.occasions) && m.occasions.length && Array.isArray(params.mealTime) && params.mealTime.length) {
    const hit = m.occasions.filter((o) => params.mealTime.includes(o));
    if (hit.length) factors.push({ type: 'occasion', label: '场景合适', detail: `适合「${hit.join('/')}」` });
  }

  const confidence = m.dataConfidence || 'estimated';

  // 10) 诚实标注置信度（非 verified 一律显式「待核验」，不夸大）
  if (confidence !== 'verified') {
    factors.push({
      type: 'confidence', label: '资料待核验',
      detail: `多维信息由算法按品类推导并已标注「待核验」，建议到店亲自验真`,
    });
  }

  // 一句话理由：取权重最高的 1~2 个非置信因子组合；极端缺字段给兜底说明
  const realFactors = factors.filter((f) => f.type !== 'confidence');
  let reason;
  if (!realFactors.length) {
    reason = `在「${params.zone || '武汉全城'}」${params.category ? `的「${params.category}」` : ''}里它进入了候选，但当前资料较少，建议到店亲自验真。`;
  } else {
    const top = [...realFactors].sort((a, b) => (WEIGHTS[b.type] || 0) - (WEIGHTS[a.type] || 0)).slice(0, 2);
    reason = `因为它${top.map((f) => f.label).join('、')}——${top.map((f) => f.detail).join('；')}`;
  }

  const score = Math.min(1, factors.reduce((s, f) => s + (WEIGHTS[f.type] || 0), 0));

  return {
    reason,
    // V2.1 因子权重可视化：把确定性 WEIGHTS 挂到每个因子，供前端画「占比条形」。
    // 注意：weight 仅作可解释展示，绝不参与真实排序/入选（防火墙，见 §8）。
    factors: factors.map((f) => ({
      type: f.type, label: f.label, detail: f.detail,
      weight: Number((WEIGHTS[f.type] || 0).toFixed(2)),
    })),
    scoreBreakdown: {
      score: Number(score.toFixed(2)),
      weights: factors.map((f) => ({ type: f.type, label: f.label, weight: Number((WEIGHTS[f.type] || 0).toFixed(2)) })),
    },
    confidence,
  };
}
