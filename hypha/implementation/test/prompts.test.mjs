// 测试：4 个 prompt.food.* 模板 + 本地确定性编排器的 guidance/provenance 注入。
// 运行：node hypha/implementation/test/prompts.test.mjs
import { loadPrompts, buildGuidance, PROMPT_IDS } from '../src/prompts.js';
import { runFoodDiscovery } from '../src/orchestrator.js';
import { PROCESS_HASH, FSM_PATH, PROMPT_REFS } from '../src/provenance.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.log('FAIL', msg); failures += 1; }
  else console.log('PASS', msg);
}

// 1) 4 个模板齐全、非空
const prompts = loadPrompts();
for (const id of PROMPT_IDS) {
  assert(typeof prompts[id] === 'string' && prompts[id].trim().length > 0, `prompt ${id} 存在且非空`);
}

// 2) 红线：模板不得含密钥/PII 明文（守 key.expose / data.export-pii）
const blob = JSON.stringify(prompts).toLowerCase();
assert(!/appsecret/.test(blob), '模板不含 AppSecret');
assert(!/webapi\.amap\.com[^"']*key=/.test(blob), '模板不含 amap?key= 明文密钥');
assert(!/\buser_id\b/.test(blob), '模板不含 user_id 回显占位');
assert(!/jsapi.*key\s*=/.test(blob), '模板不含高德 JS Key 赋值');

// 3) buildGuidance 产出品牌化导览
const g = buildGuidance({ zone: '财大南湖周边', maxPrice: 50, mealTime: ['夜宵'] }, {
  total_matched: 1, ranked_by: 'price', nearest: { name: '老樊城', distanceKm: 2.76 },
});
assert(typeof g === 'string' && g.includes('南湖') && g.includes('1 家'), 'buildGuidance 含片区与总数');
assert(g.includes('不编造'), 'buildGuidance 含品牌红线声明');

// 4) 编排器输出 summary 含 guidance + provenance
const r = await runFoodDiscovery({ intent: '南湖附近便宜的宵夜' });
assert(r.success, 'runFoodDiscovery 成功');
const s = r.output.summary;
assert(typeof s.guidance === 'string' && s.guidance.length > 0, 'summary.guidance 非空');
assert(s.provenance && s.provenance.driver === 'hypha-fsm', 'provenance.driver = hypha-fsm');
assert(s.provenance.processHash === PROCESS_HASH, 'provenance.processHash 与编译指纹一致');
assert(Array.isArray(s.provenance.fsm) && s.provenance.fsm.length === FSM_PATH.length, 'provenance.fsm 路径完整');
assert(Array.isArray(s.provenance.prompts) && s.provenance.prompts.length === PROMPT_REFS.length, 'provenance.prompts 含 4 个');
assert(s.provenance.deterministic === true, 'provenance.deterministic = true');

// 5) 契约约束：summary 仅含 output.food-recommendation 声明的字段（additionalProperties:false）
//    + Phase 5 决策契约扩展字段（decision = 1 主推 + 理由 + 备选）。
const ALLOWED = new Set([
  'query', 'total_matched', 'ranked_by', 'nearest', 'coupon_hint',
  'degradation', 'guidance', 'provenance', 'dataSource', 'decision',
]);
const extra = Object.keys(s).filter((k) => !ALLOWED.has(k));
assert(extra.length === 0, `summary 无越界字段（越界=${JSON.stringify(extra)}）`);

// 6) 多意图回归：guidance 随参数变化
const r2 = await runFoodDiscovery({ intent: '财大南湖周边必吃' });
assert(r2.output.summary.guidance.includes('财大南湖周边'), '财大南湖周边意图 guidance 含片区');
assert(r2.output.summary.provenance.processHash === PROCESS_HASH, '多意图 provenance 指纹一致');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
