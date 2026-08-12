// 冒烟测试：runFoodDiscovery 对多种意图产出满足 output.food-recommendation 契约的结果。
// 运行：node hypha/implementation/test/orchestrator.test.mjs
import { runFoodDiscovery } from '../src/orchestrator.js';
import { parseIntent } from '../src/intent-parser.js';

const CASES = [
  { label: '南湖附近便宜的宵夜', input: { intent: '南湖附近便宜的宵夜' } },
  { label: '首义必吃', input: { intent: '首义必吃' } },
  { label: '全城性价比', input: { intent: '全城性价比高的' } },
  { label: '结构化：财大南湖周边+夜宵+≤50', input: { zone: '财大南湖周边', mealTime: ['夜宵'], maxPrice: 50 } },
  { label: '带朋友吃湖北菜人均不过百', input: { intent: '带朋友吃湖北菜，人均不过百' } },
  { label: '新店', input: { intent: '南湖新开的店' } },
];

let failures = 0;
for (const c of CASES) {
  const r = await runFoodDiscovery(c.input);
  const ok = r.success && Array.isArray(r.output.merchants) && r.output.summary && typeof r.output.summary.total_matched === 'number';
  const rankedBy = r.output?.summary?.ranked_by;
  const total = r.output?.summary?.total_matched;
  const nearest = r.output?.summary?.nearest;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${c.label} → total=${total} ranked_by=${rankedBy} nearest=${nearest ? nearest.name + '(' + nearest.distanceKm + 'km)' : 'null'} degrade=${(r.output?.summary?.degradation || []).length}`);
  if (!ok) failures += 1;
}

// 契约断言：merchants 为空数组也合法；非空时第一条须含必需字段
const sample = await runFoodDiscovery({ intent: '南湖附近便宜的宵夜' });
if (!Array.isArray(sample.output.merchants)) { console.log('FAIL merchants 非数组'); failures += 1; }
else if (sample.output.merchants.length > 0) {
  const m0 = sample.output.merchants[0];
  const requiredMerchantFields = ['id', 'name', 'zone', 'category'];
  const missingFields = requiredMerchantFields.filter((f) => !(f in m0));
  if (missingFields.length) { console.log('FAIL 商户缺字段:', missingFields); failures += 1; }
}

// intent-parser 归一化正确性（「宵夜/便宜」驱动场景/价格筛选，不强制榜单）
const p = parseIntent({ intent: '南湖附近便宜的宵夜' });
console.log('parseIntent(南湖附近便宜的宵夜) =', JSON.stringify(p));
const pExpected = p.zone === '财大南湖周边' && p.mealTime.includes('夜宵') && p.maxPrice === 50
  && p.sort === 'price' && p.board === null && p.category === null;
if (!pExpected) { console.log('FAIL intent-parser 归一化不符合预期'); failures += 1; }

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
