// 双轨升级判定单测（W1.2 · 2026-08-15）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldUpgrade, buildUpgradeResult } from '../src/upgrade.js';

test('关键词未命中 → 升级', () => {
  assert.equal(shouldUpgrade({ intent: '健身餐', summary: { degradation: ['未找到「健身餐」专门店；以下为最接近清淡口味…'] } }), true);
  assert.equal(shouldUpgrade({ intent: 'zzz', summary: { degradation: ['未找到含「zzz」的店铺，以下为附近人气推荐'] } }), true);
});

test('完全无匹配 → 升级', () => {
  assert.equal(shouldUpgrade({ intent: 'x', summary: { total_matched: 0, degradation: [] } }), true);
});

test('口味约束无匹配 → 升级', () => {
  assert.equal(shouldUpgrade({ intent: '清淡的健身餐', summary: { degradation: ['没有符合「清淡」口味的店铺'], total_matched: 0 } }), true);
});

test('健康饮食语义 → 升级（即使有结果）', () => {
  assert.equal(shouldUpgrade({ intent: '低脂高蛋白的店', summary: { total_matched: 5, ranked_by: 'taste', degradation: [] } }), true);
});

test('模糊表达 → 升级', () => {
  assert.equal(shouldUpgrade({ intent: '心情不好想吃点治愈系暖暖的', summary: { total_matched: 8, ranked_by: 'rating', degradation: [] } }), true);
});

test('确定性已足够（关键词命中）→ 不升级（省 LLM 成本）', () => {
  assert.equal(shouldUpgrade({ intent: '老樊城', summary: { total_matched: 2, ranked_by: 'keyword', degradation: ['已按关键词「老樊城」检索（店名优先）'] } }), false);
  assert.equal(shouldUpgrade({ intent: '南湖附近便宜的宵夜', summary: { total_matched: 8, ranked_by: 'price', degradation: [] } }), false);
});

test('buildUpgradeResult：LLM 结果 + 确定性兜底', () => {
  const r = buildUpgradeResult({ success: true, output: {} }, { success: true });
  assert.equal(r.upgrade, true);
  assert.equal(r.upgradeDriver, 'llm');
  assert.equal(r.deterministicFallback.success, true);
});
