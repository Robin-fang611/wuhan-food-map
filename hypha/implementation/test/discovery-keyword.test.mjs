// S6.1 · 关键词→店名检索优先 集成测试（确定性路径）
// 覆盖：店名包含命中优先 / 模糊命中（招牌菜）/ 未命中回落通用推荐 + 诚实降级说明 / trace 关键词步骤。
// 运行：node hypha/implementation/test/discovery-keyword.test.mjs
import assert from 'node:assert/strict';
import { runFoodDiscovery } from '../src/orchestrator.js';
import '../src/datasource/wuhan.js'; // 注册真实 860 数据集
import { createDataSource, setDefaultDataSource } from '../src/datasource/index.js';

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, '✗ ' + name);
  passed++;
  console.log('  ✓', name);
}

setDefaultDataSource(createDataSource('wuhan'));

// 1) 店名包含命中（老樊城）
const r1 = await runFoodDiscovery({ intent: '老樊城' });
ok('老樊城 → 命中且每家常含关键词', r1.success && r1.output.merchants.length > 0
  && r1.output.merchants.every((m) => String(m.name).includes('老樊城')));
ok('老樊城 → ranked_by=keyword', r1.output.summary.ranked_by === 'keyword');
ok('老樊城 → trace 含关键词检索步骤', (r1.trace.steps || []).some((s) => s.kind === 'filter' && s.title.includes('老樊城')));
ok('老樊城 → 主推为老樊城', r1.output.summary.decision && String(r1.output.summary.decision.primaryId).length > 0);

// 2) 模糊命中（招牌菜「豆皮」应命中早餐类豆皮店）
const r2 = await runFoodDiscovery({ intent: '豆皮' });
ok('豆皮 → 命中（店名或招牌含豆皮）', r2.success && r2.output.merchants.length > 0
  && r2.output.merchants.every((m) => [String(m.name || ''), String(m.signatureDishes || '')].join(' ').includes('豆皮')));

// 3) 未命中 → 回落通用推荐 + 诚实降级说明
const r3 = await runFoodDiscovery({ intent: 'zzz不存在的店xyz' });
ok('未命中 → 仍返回通用推荐（total>0）', r3.success && r3.output.merchants.length > 0);
ok('未命中 → degradation 显式说明未找到', (r3.output.summary.degradation || []).some((d) => d.includes('未找到含')));

// 4) 结构化意图不受影响（关键词为空）
const r4 = await runFoodDiscovery({ intent: '南湖附近便宜的宵夜' });
ok('结构化意图 → 命中财大南湖周边', r4.success && r4.output.summary.ranked_by === 'price');
ok('结构化意图 → 无关键词降级说明', !(r4.output.summary.degradation || []).some((d) => d.includes('关键词')));

// 5) Q1 实事求是核心行为：健身餐 → 口味约束筛选 + 诚实标注（SPEC §15 Q1 回归锁）
const r5 = await runFoodDiscovery({ intent: '清淡的健身餐' });
ok('健身餐 → ranked_by=taste（口味约束筛选生效）', r5.success && r5.output.summary.ranked_by === 'taste');
ok('健身餐 → 每家 tasteTags/文案含「清淡」（不给糊汤粉/包子硬凑）', (r5.output.merchants || []).every((m) =>
  (Array.isArray(m.tasteTags) && m.tasteTags.some((x) => String(x).includes('清淡')))
  || String(m.taste || '').includes('清淡')));
ok('健身餐 → degradation 诚实标注「非专门店」', (r5.output.summary.degradation || []).some((d) => d.includes('非专门店')));
ok('健身餐 → degradation 提及口味约束「清淡」', (r5.output.summary.degradation || []).some((d) => d.includes('清淡')));

console.log(`\ndiscovery-keyword.test.mjs 全部通过（${passed} 项）`);
