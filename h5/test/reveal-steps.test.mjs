// 统一推演阶段映射单测（W1.4）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRevealSteps, REVEAL_STAGES } from '../src/ui/revealSteps.js';

test('REVEAL_STAGES：五阶段顺序固定', () => {
  assert.deepEqual(REVEAL_STAGES.map((s) => s.key), ['intake', 'search', 'match', 'rank', 'decide']);
});

test('确定性 trace → 五阶段映射（含 detail）', () => {
  const steps = buildRevealSteps({
    steps: [
      { kind: 'intake', title: '理解你的意图', detail: '片区：武汉全城 · 搜索词：老樊城' },
      { kind: 'filter', title: '从数据集筛选候选', detail: '命中 2 家（排序口径：关键词）' },
      { kind: 'rank', title: '排序与权衡', detail: '按口径排序' },
      { kind: 'decide', title: '给出主推', detail: '首推老樊城襄阳牛肉面' },
      { kind: 'why', title: '为什么推荐这家', factors: [] },
    ],
  });
  assert.deepEqual(steps.map((s) => s.key), ['intake', 'search', 'rank', 'decide']);
  assert.ok(steps[1].detail.includes('2 家'));
});

test('LLM trace → 工具动作映射为同款阶段（无来源痕迹）', () => {
  const steps = buildRevealSteps({
    steps: [
      { kind: 'tool', thinking: '用户想要健身餐', actions: [{ tool: 'search_merchants', summary: '找到 8 家候选（按 评分）' }] },
      { kind: 'tool', thinking: '', actions: [{ tool: 'filter', summary: '按 清淡 收窄至 3 家' }] },
      { kind: 'tool', thinking: '', actions: [{ tool: 'get_merchant_detail', summary: '查看「随园美食」详情' }] },
      { kind: 'finalize', thinking: '', reason: '这家最贴合清淡需求', decision: {} },
    ],
  });
  assert.deepEqual(steps.map((s) => s.key), ['search', 'match', 'decide']); // rank 无对应动作，跳过不硬造
  assert.equal(steps[0].title, '检索数据库');
  assert.equal(steps[2].detail, '这家最贴合清淡需求');
});

test('question 步骤 → 澄清阶段（不被当作失败）', () => {
  const steps = buildRevealSteps({ steps: [{ kind: 'question', thinking: '请问你想吃哪个片区？' }] });
  assert.equal(steps[0].key, 'match');
  assert.ok(steps[0].detail.length > 0);
});

test('空 trace → 空阶段（骨架直接完成）', () => {
  assert.deepEqual(buildRevealSteps(null), []);
  assert.deepEqual(buildRevealSteps({ steps: [] }), []);
});
