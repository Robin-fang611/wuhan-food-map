// 本地口味记忆：辣度 / 预算 / 忌口，存 localStorage，不注册也能用。
// 让 Agent「越用越懂你」——新会话默认带入预算约束（后端可过滤）；
// 辣度/忌口当前仅作记录（后端暂无对应过滤字段，未来智能体采集数据时一并补齐）。
const KEY = 'myw:taste';

export const SPICE = ['不吃辣', '微辣', '中辣', '重辣'];
export const DISLIKES = ['香菜', '葱', '蒜', '海鲜', '内脏', '辣'];
export const BUDGETS = [
  { label: '不限', v: null },
  { label: '≤30', v: 30 },
  { label: '≤50', v: 50 },
  { label: '≤80', v: 80 },
];

export function loadTaste() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY));
    return t && typeof t === 'object' ? t : {};
  } catch {
    return {};
  }
}

export function saveTaste(t) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* 隐私模式等场景忽略写入失败 */
  }
}

// 把口味转成 discovery params（目前仅预算可直过滤；其余作记录）。
export function tasteToParams(taste) {
  const p = {};
  if (typeof taste.maxPrice === 'number') p.maxPrice = taste.maxPrice;
  return p;
}
