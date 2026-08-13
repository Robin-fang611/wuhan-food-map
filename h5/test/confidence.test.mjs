// V2.2 真实性标注单元测试 —— 覆盖 confidenceInfo 纯函数（不依赖 DOM）。
import assert from 'node:assert/strict';
import { confidenceInfo } from '../src/ui/confidence.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ✓', name); }

test('verified → 绿 / 无需待核验提示', () => {
  const ci = confidenceInfo({ dataConfidence: 'verified' });
  assert.equal(ci.level, 'verified');
  assert.equal(ci.label, '已核验');
  assert.equal(ci.pending, false);
});

test('partial → 金 / 待核验提示', () => {
  const ci = confidenceInfo({ dataConfidence: 'partial' });
  assert.equal(ci.level, 'partial');
  assert.equal(ci.label, '部分核验');
  assert.equal(ci.pending, true);
});

test('estimated → 灰 / 待核验提示', () => {
  const ci = confidenceInfo({ dataConfidence: 'estimated' });
  assert.equal(ci.level, 'estimated');
  assert.equal(ci.label, '待核验');
  assert.equal(ci.pending, true);
});

test('缺字段一律按 estimated（诚实，不编造核验）', () => {
  assert.equal(confidenceInfo({}).level, 'estimated');
  assert.equal(confidenceInfo(null).level, 'estimated');
  assert.equal(confidenceInfo(undefined).level, 'estimated');
});

test('非法值回落 estimated（防注入/脏数据）', () => {
  assert.equal(confidenceInfo({ dataConfidence: 'HACKED' }).level, 'estimated');
  assert.equal(confidenceInfo({ dataConfidence: '' }).level, 'estimated');
});

console.log(`\nV2.2 confidence.test: ${passed} passed, 0 failed`);
