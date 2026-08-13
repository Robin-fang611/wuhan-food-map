// V2.2 真实性标注 —— 纯函数 + 徽章（无 innerHTML，复用 h()，防 XSS §8）。
// 数据源口径：merchants.js 的 dataConfidence ∈ {verified, partial, estimated}；
// allMerchants 合并 robin-99 / web-stalls 时该字段缺省 → 一律按 estimated（诚实，不编造核验）。
import { h } from './dom.js';

// 纯函数：把商户数据置信度翻译成展示语义。任何非法/缺省值都落到 estimated（不夸大）。
// 不依赖 DOM，可在 node 直接单测。
export function confidenceInfo(m) {
  const conf = (m && m.dataConfidence) || 'estimated';
  let level, label;
  if (conf === 'verified') { level = 'verified'; label = '已核验'; }
  else if (conf === 'partial') { level = 'partial'; label = '部分核验'; }
  else { level = 'estimated'; label = '待核验'; }
  // 仅 verified 视为已充分核验；其余都需要探店核验提示（partial/estimated 一律提示待核验）。
  const pending = level !== 'verified';
  return { level, label, pending };
}

// DOM 徽章（列表卡 / 详情复用）。level → 颜色类名（verified 绿 / partial 金 / estimated 灰）。
export function ConfidenceBadge(m) {
  const { level, label } = confidenceInfo(m);
  return h('span', { class: `m-confidence m-confidence-${level}`, text: label });
}
