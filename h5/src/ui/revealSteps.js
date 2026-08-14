// 统一推演阶段（W1.4 · 2026-08-15）
// 前端只呈现一套 Agent 推演：理解意图 → 检索数据库 → 匹配条件 → 排序权衡 → 生成推荐。
// 双路径映射（无来源标签，用户无感）：
//  确定性 /run trace：intake → intake；filter → search；geo/rank → rank；decide → decide；
//  LLM /agent trace：search_merchants → search；filter/rank → match/rank；detail → match；finalize → decide；question → 澄清。
// 纯函数，供 h5/test/reveal-steps.test.mjs 断言。
export const REVEAL_STAGES = [
  { key: 'intake', title: '理解你的意图' },
  { key: 'search', title: '检索数据库' },
  { key: 'match', title: '匹配你的条件' },
  { key: 'rank', title: '排序与权衡' },
  { key: 'decide', title: '生成推荐' },
];
const TITLES = Object.fromEntries(REVEAL_STAGES.map((s) => [s.key, s.title]));

export function buildRevealSteps(trace) {
  const steps = Array.isArray(trace && trace.steps) ? trace.steps : [];
  const out = [];
  const seen = new Set();
  const push = (key, detail) => {
    if (!seen.has(key)) { seen.add(key); out.push({ key, title: TITLES[key] || key, detail: detail || '' }); }
  };
  for (const s of steps) {
    if (!s || typeof s !== 'object') continue;
    if (s.kind === 'intake') push('intake', s.detail || '');
    else if (s.kind === 'filter') push('search', s.detail || '');
    else if (s.kind === 'geo' || s.kind === 'rank') push('rank', s.detail || '');
    else if (s.kind === 'decide') push('decide', s.detail || '');
    else if (s.kind === 'why') { /* 因子在推荐卡内渲染 */ }
    else if (s.kind === 'tool' && Array.isArray(s.actions) && s.actions.length) {
      const t = s.actions[0].tool || '';
      const sum = s.actions[0].summary || '';
      if (t === 'search_merchants') push('search', sum || '检索候选');
      else if (t === 'filter') push('match', sum || '按条件收窄');
      else if (t === 'rank') push('rank', sum || '按口径排序');
      else if (t === 'get_merchant_detail') push('match', sum || '核对门店详情');
      else push('match', sum || '执行步骤');
    }
    else if (s.kind === 'finalize') push('decide', s.reason || '已给出主推与备选');
    else if (s.kind === 'question') push('match', String(s.thinking || '需要澄清').slice(0, 40));
  }
  return out;
}
