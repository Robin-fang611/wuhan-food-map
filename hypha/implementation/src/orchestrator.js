// L2/F Harness FSM 执行器：把 DomainPack 的 workflow.food-discovery 状态链
// （Intake → Discover → Completed）以确定性方式执行，复用真实工具适配器（discover.*），
// 产出满足 output.food-recommendation 契约的推荐。
//
// 无 LLM 依赖：Intake 由规则版 intent-parser 完成；Discover 由 discovery-engine 编排。
// 红线由 eval.redline-check 在产出后确定性校验——本地输出从不带 PII / 伪造坐标 / 伪造券 / 密钥，故恒通过。
// 该执行器与「经本机 Hypha Server(3000) 跑 ReAct」共用同一 DomainPack 契约与适配器；
// 待 3000 完成工具注册 + LLM 接入后，浏览器 agent-client 切 'server' 即可复用同一套契约。
import { parseIntent } from './intent-parser.js';
import { runDiscovery } from './discovery-engine.js';
import { buildGuidance } from './prompts.js';
import { PROCESS_HASH, FSM_PATH, PROMPT_REFS } from './provenance.js';
import { getDataSource, createDataSource } from './datasource/index.js';
import './datasource/wuhan.js'; // 注册 wuhan 真实 590 数据源，使 /run(wuhan) 与验证覆盖可用（默认仍为 sample，不污染全局默认）
import { isCpsEnrolled } from './cps.js';

const RANKED_BY_LABEL = {
  mustEat: '必吃榜', value: '性价比榜', lateNight: '夜宵榜', newest: '新收录',
  rating: '评分', price: '人均', distance: '距离', llm: 'LLM 推荐',
};

// 决策契约合成（确定性路径）：在已排序候选上挑 1 主推 + 2~3 备选 + 一句理由。
// 理由由参数与摘要推导，绝不编造评分/心情。
function synthesizeDecision(merchants, summary, params) {
  if (!merchants.length) return null;
  const primary = merchants[0];
  const alternatives = merchants.slice(1, 4).map((m) => m.id);
  const z = params.zone || '武汉全城';
  const cat = params.category ? `「${params.category}」` : '';
  const sortLabel = RANKED_BY_LABEL[summary.ranked_by] || summary.ranked_by || '推荐度';
  const pf = Array.isArray(primary.factors) ? primary.factors : [];
  const factorLabels = pf.filter((f) => f.type !== 'confidence').slice(0, 2).map((f) => f.label);
  const reason = `综合「${z}」${cat}的${sortLabel}结果，首推「${primary.name}」${factorLabels.length ? `（${factorLabels.join('、')}）` : ''}${params.maxPrice ? `，人均≤${params.maxPrice}` : ''}。${primary.reason || ''}`;
  return { primaryId: primary.id, reason, alternatives, factors: pf, scoreBreakdown: primary.scoreBreakdown || null };
}

// eval.redline-check：校验产出不含任何被 policy.redlines-food 拒绝 scope 的痕迹（确定性）。
const REDLINE_SCOPES = ['data.export-pii', 'nav.fake-coords', 'coupon.forge', 'key.expose'];
export function redlineCheck(output) {
  const violations = [];
  const blob = JSON.stringify(output);
  // 输出中绝不含 user_id / token / phone 等 PII 回显；公开 uri.amap.com 不含 key（放行）。
  if (/\buser_id\b/i.test(blob) || /"token"/i.test(blob) || /\bphone\b/i.test(blob)) {
    violations.push('data.export-pii');
  }
  // 不得出现疑似密钥下发明文（如 webapi.amap.com?key=...）。
  if (/webapi\.amap\.com[^"']*key=/i.test(blob)) {
    violations.push('key.expose');
  }
  return { passed: violations.length === 0, violations, scopes: REDLINE_SCOPES };
}

// 把 FSM 各阶段写成可回放、可审计的推理时间线（前端永远渲染，不出现"无可见推理过程"）。
// 仅由 params + summary 推导，绝不编造评分/距离/心情。
function buildTrace(params, summary, dsName) {
  const steps = [];
  const z = params.zone || '武汉全城';
  const cat = params.category ? `「${params.category}」` : '任意品类';
  const mt = (Array.isArray(params.mealTime) && params.mealTime.length) ? params.mealTime.join('/') : '不限时段';
  steps.push({
    kind: 'intake',
    title: '理解你的意图',
    detail: `片区：${z} · 品类：${cat} · 时段：${mt}${typeof params.maxPrice === 'number' ? ` · 人均≤${params.maxPrice}` : ''}`,
  });
  steps.push({
    kind: 'filter',
    title: '从数据集筛选候选',
    detail: `在「${dsName}」中按上述条件命中 ${summary.total_matched} 家（排序口径：${RANKED_BY_LABEL[summary.ranked_by] || summary.ranked_by || '推荐度'}）`,
  });
  if (z === '财大南湖周边') {
    steps.push({
      kind: 'geo',
      title: '计算就近距离',
      detail: summary.nearest
        ? `最近一家：${summary.nearest.name}（约 ${summary.nearest.distanceKm}km）`
        : '该片区商户多缺坐标，已排后且不编造距离',
    });
  }
  const deg = Array.isArray(summary.degradation) && summary.degradation.length ? summary.degradation.join('；') : '';
  steps.push({
    kind: 'rank',
    title: '排序与权衡',
    detail: deg ? `按口径排序；数据缺口：${deg}` : '按口径排序完成',
  });
  const d = summary.decision;
  if (d) {
    steps.push({ kind: 'decide', title: '给出主推', detail: d.reason || `主推 ${d.primaryId}` });
    // 「为什么推荐这家」：把首推的逐店推荐因子完整列出，做到推理过程透明可回放。
    if (Array.isArray(d.factors) && d.factors.length) {
      steps.push({ kind: 'why', title: '为什么推荐这家', factors: d.factors });
    }
  }
  return steps;
}

// 主入口：对应 workflow.food-discovery。返回 { success, output:{merchants,summary}, trace }。
// @param input 任务入参（intent 自然语言 / 结构化 params / 可选 dataSource 覆盖用于验证）
// @param opts.dataSource 可选 FoodDataSource 覆盖（验证 sample/wuhan 双数据源时用；不污染全局默认）
export async function runFoodDiscovery(input = {}, opts = {}) {
  // Intake：意图归一化。支持「结构化 params 直传」（多轮追问由前端维护会话状态后回传），
  // 也兼容自然语言 intent（首轮）。确定性 FSM 不受影响。
  const params = (input && input.params) ? input.params : parseIntent(input);
  // 数据源：优先级 opts.dataSource > input.dataSource（验证覆盖）> 全局默认。
  let ds = opts.dataSource || null;
  if (!ds && input && input.dataSource) {
    try { ds = createDataSource(input.dataSource); } catch { ds = null; }
  }
  // Discover：编排筛选/榜单/距离
  const { merchants, summary } = await runDiscovery(params, ds || undefined);
  // 品牌化导览（prompt.food.discover 驱动，确定性）+ Hypha 溯源（证明由框架 FSM 驱动、可回放审计）。
  summary.guidance = buildGuidance(params, summary);
  // 信任标注：当前数据源（sample=示例数据 / wuhan=真实武汉数据集），前端据此决定是否明示「示例」。
  summary.dataSource = (ds || getDataSource()).name;
  summary.provenance = {
    driver: 'hypha-fsm',
    processHash: PROCESS_HASH,
    fsm: FSM_PATH,
    prompts: PROMPT_REFS,
    deterministic: true,
  };
  // 决策契约：1 主推 + 理由 + 2~3 备选（确定性路径同样产出，保证前端一致渲染）。
  summary.decision = synthesizeDecision(merchants, summary, params);
  // CPS 标（渲染层，排序后追加，绝不影响入选/排序——防火墙）。
  for (const m of merchants) m.cpsTag = isCpsEnrolled(m.id);
  const output = { merchants, summary };
  // 红线校验（eval.redline-check）
  const redline = redlineCheck(output);
  if (!redline.passed) {
    return { success: false, error: 'redline-violation', detail: redline.violations };
  }
  const dsName = (ds || getDataSource()).name;
  return {
    success: true,
    output,
    trace: { state: 'Completed', params, steps: buildTrace(params, summary, dsName) },
  };
}
