// scripts/reconcile-datasource.test.mjs
// 回归守卫：锁定 V4.4 数据源口径基线的关键不变量，数据漂移即告警。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from './reconcile-datasource.mjs';
import { allMerchants } from '../h5/src/data/all-merchants.js';
import { merchants } from '../h5/src/data/merchants.js';

test('reconcile 返回结构化报告且关键计数正确', () => {
  const r = reconcile(allMerchants, merchants);
  assert.equal(r.frontendCount, allMerchants.length);
  assert.equal(r.backendCount, merchants.length);
  // 实测基线（2026-08-13）：前端 857 / 后端 625
  assert.equal(r.frontendCount, 857);
  assert.equal(r.backendCount, 625);
  // 前端独有 = 293，且全部来自 robin-99 + web-stalls
  assert.equal(r.frontendExtras, 293);
  const extraTotal = Object.values(r.extrasBySource).reduce((a, b) => a + b, 0);
  assert.equal(extraTotal, r.frontendExtras);
  // 后端独有(按 id) == 后端内重名组数（证明"缺失"是去重吞掉，非真缺失）
  assert.equal(r.backendOnlyById, 61);
  assert.equal(r.intraBackendDups, 61);
  assert.equal(r.backendOnlyAlsoByName, 61);
  // 外源坐标红线：不得有伪造坐标
  assert.equal(r.extrasWithFakeCoords, 0);
  // 外源置信度未标注（undefined）
  assert.ok((r.confidenceFrontend.undefined || 0) >= 293);
});

test('reconcile 纯函数：相同输入幂等', () => {
  const a = reconcile(allMerchants, merchants);
  const b = reconcile(allMerchants, merchants);
  assert.deepEqual(a, b);
});
