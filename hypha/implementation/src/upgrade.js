// 双轨升级判定（W1.2 · 2026-08-15）
// 原则：脚本（确定性）解决不了的 → 自动升级 LLM（DeepSeek）深度分析；LLM 不可用/失败 → 回落确定性结果。
// 触发条件（可审计、纯函数）：
//  1. 关键词 0 命中（未找到含「x」的店铺 / 未找到「x」专门店）
//  2. 完全无匹配（total_matched === 0）
//  3. 口味约束无匹配（没有符合「清淡」口味的店铺）
//  4. 输入含健康饮食语义（健身/减脂/低脂/高蛋白——确定性引擎缺该领域标签数据）
//  5. 纯模糊表达（无结构化信号且关键词未命中）——LLM 情境理解是强项（PRD H1 已证）
// 满足任一即应升级；否则确定性结果已足够，不浪费 LLM 调用（成本护栏）。

const FIT_HINT = /健身|减脂|低脂|高蛋白|轻食|沙拉|增肌|水煮/;
const FUZZY_HINT = /心情|治愈|暖暖|今天|随便|不知道|想吃点|来点|有点/;

export function shouldUpgrade({ intent = '', summary = null, params = null } = {}) {
  if (!summary) return false;
  const degradation = Array.isArray(summary.degradation) ? summary.degradation.join(' ') : '';
  // 1) 关键词/专门店未命中（含口味约束无匹配的诚实文案）
  if (degradation.includes('未找到含') || degradation.includes('未找到「') || degradation.includes('没有符合')) return true;
  // 2) 完全无匹配
  if (typeof summary.total_matched === 'number' && summary.total_matched === 0) return true;
  // 3) 口味约束存在但未在关键词路径消化（候选是通用集）
  if (params && Array.isArray(params.taste) && params.taste.length && summary.ranked_by !== 'taste' && summary.ranked_by !== 'keyword') return true;
  // 4) 健康饮食语义
  if (intent && FIT_HINT.test(intent)) return true;
  // 5) 纯模糊表达（无信号且非关键词命中）
  if (intent && FUZZY_HINT.test(intent) && summary.ranked_by !== 'keyword' && summary.ranked_by !== 'taste') return true;
  return false;
}

// 升级路径包装：LLM 结果 + 确定性兜底，供前端展示与回退。
export function buildUpgradeResult(agentResult, deterministic) {
  return {
    ...agentResult,
    upgrade: true,
    upgradeDriver: 'llm',
    deterministicFallback: deterministic, // 保险：LLM 输出异常时前端可回退
  };
}
