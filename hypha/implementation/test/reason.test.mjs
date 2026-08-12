// 算法层可解释性测试：逐店推荐理由引擎 explain.js + runFoodDiscovery 全链路。
// 运行：node hypha/implementation/test/reason.test.mjs
import { explainRecommendation } from '../src/explain.js';
import { runFoodDiscovery } from '../src/orchestrator.js';
import { parseIntent } from '../src/intent-parser.js';

let failures = 0;
function check(cond, label) {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${label}`);
  if (!cond) failures += 1;
}

// —— 1) explainRecommendation：基于真实字段生成理由 + 因子 + 权重 ——
const fake = {
  id: 'x1', name: '测试湖北菜馆', category: '湖北菜', avgPrice: '60', avgPriceNum: 60,
  rating: '必吃', tasteTags: ['鲜', '咸'], taste: '鲜香醇厚',
  recommendDishes: '排骨藕汤、清蒸武昌鱼', signatureDishes: '莲藕排骨汤',
  dataConfidence: 'estimated', occasions: ['午', '晚'], source: 'local', has_coupon: false,
};
const ex = explainRecommendation(fake, {
  params: { zone: '武汉全城', category: '湖北菜', mealTime: ['午', '晚'], maxPrice: 80, mood: '请客', taste: ['鲜'] },
});
check(typeof ex.reason === 'string' && ex.reason.length > 0, 'explain.reason 非空');
check(Array.isArray(ex.factors) && ex.factors.length > 0, 'explain.factors 为非空数组');
check(ex.factors.every((f) => f.type && f.label && f.detail), '每个 factor 含 type/label/detail');
check(ex.confidence === 'estimated', 'confidence 透传 estimated');
check(typeof ex.scoreBreakdown.score === 'number' && ex.scoreBreakdown.score >= 0 && ex.scoreBreakdown.score <= 1, 'scoreBreakdown.score 在 [0,1]');
const types = new Set(ex.factors.map((f) => f.type));
check(types.has('category'), '因子含「品类对味」（params.category 命中）');
check(types.has('taste'), '因子含「口味合拍」（mood/taste 命中）');
check(types.has('price'), '因子含「预算内」（人均≤maxPrice）');
check(types.has('rating'), '因子含「高分口碑」（必吃）');
check(!types.has('trust'), 'estimated 商户不含「真实核验」因子');
check(types.has('confidence'), 'estimated 商户含「资料待核验」诚实标注');

// —— 2) 极端缺字段：不编造，给兜底说明 ——
const bare = { id: 'x2', name: '资料极少店', category: '其他', avgPrice: '', rating: '' };
const exBare = explainRecommendation(bare, { params: { zone: '武汉全城' } });
check(/验真|待补/.test(exBare.reason), '缺字段时理由给出兜底说明而非编造');

// —— 3) runFoodDiscovery（默认 sample 数据源）：商户带 reason + factors ——
const r1 = await runFoodDiscovery({ intent: '南湖附近便宜的宵夜' });
check(r1.success && r1.output.merchants.length > 0, 'runFoodDiscovery(sample) 有结果');
const m1 = r1.output.merchants[0];
check(typeof m1.reason === 'string' && m1.reason.length > 0, 'sample 主推 reason 非空');
check(Array.isArray(m1.factors) && m1.factors.length > 0, 'sample 主推 factors 非空');

// —— 4) runFoodDiscovery（wuhan 真实数据集）：完整推理过程 + 为什么推荐这家 ——
const r2 = await runFoodDiscovery({ intent: '带朋友吃湖北菜，人均不过百', dataSource: 'wuhan' });
check(r2.success, 'runFoodDiscovery(wuhan) success');
check(r2.output.merchants.length > 0, 'wuhan 候选非空');
const m2 = r2.output.merchants[0];
check(typeof m2.reason === 'string' && m2.reason.length > 0, 'wuhan 主推 reason 非空');
check(Array.isArray(m2.factors) && m2.factors.length > 0, 'wuhan 主推 factors 非空');
check(Array.isArray(r2.output.summary.decision.factors) && r2.output.summary.decision.factors.length > 0, 'decision.factors 非空（供时间线「为什么」）');
const whyStep = (r2.trace.steps || []).find((s) => s.kind === 'why');
check(!!whyStep && Array.isArray(whyStep.factors) && whyStep.factors.length > 0, 'trace 含「为什么推荐这家」步骤且带 factors');

// —— 5) 红线：输出不含 PII / 密钥回显 ——
const blob = JSON.stringify(r2.output);
check(!/\buser_id\b/i.test(blob) && !/"token"/i.test(blob) && !/\bphone\b/i.test(blob), '红线：输出不含 user_id/token/phone');
check(!/webapi\.amap\.com[^"']*key=/i.test(blob), '红线：输出不含高德 key');

// —— 6) intent-parser：新增 mood/taste ——
const p = parseIntent({ intent: '心情不好想吃点治愈系暖暖的' });
check(p.mood === '治愈', 'parseIntent 抽取 mood=治愈');
const p2 = parseIntent({ intent: '想吃辣的，来顿火锅' });
check(Array.isArray(p2.taste) && p2.taste.includes('辣'), 'parseIntent 抽取 taste 含 辣');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
