// scripts/reconcile-datasource.test.mjs
// 回归守卫：锁定 V4.4 S2 统一后数据源口径的关键不变量，数据漂移即告警。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from './reconcile-datasource.mjs';
import { allMerchants } from '../h5/src/data/all-merchants.js';
import { merchants } from '../h5/src/data/merchants.js';
import { ALL_MERCHANTS } from '../hypha/implementation/src/runtime.js';

test('reconcile 返回结构化报告且关键计数正确（V4.4 S2 统一基线）', () => {
  const r = reconcile(allMerchants, ALL_MERCHANTS, merchants);
  assert.equal(r.frontendCount, allMerchants.length);
  assert.equal(r.backendCount, ALL_MERCHANTS.length);
  // 实测基线（2026-08-15 S2 统一后）：前端 = 后端 = 860；原始表 merchants.js = 567
  assert.equal(r.frontendCount, 860);
  assert.equal(r.backendCount, 860);
  assert.equal(r.rawBackendCount, 567);
  // 双端同源：无前端独有 / 无后端独有
  assert.equal(r.frontendExtras, 0);
  assert.equal(r.backendOnlyById, 0);
  assert.equal(r.backendOnlyAlsoByName, 0);
  // 原始表重名治理完成：61 组 → 0 组
  assert.equal(r.intraBackendDups, 0);
  assert.equal(r.unified, true);
  // 外源坐标红线：不得有伪造坐标
  assert.equal(r.extrasWithFakeCoords, 0);
  // robin-99 / web-stalls 行置信度未标注（undefined，诚实不编造）
  assert.ok((r.confidenceFrontend.undefined || 0) >= 293);
  // 统一集置信度 = 41 verified + 1 partial + 525 estimated + 293 undefined = 860
  assert.equal(r.confidenceFrontend.verified, 41);
  assert.equal(r.confidenceFrontend.estimated, 525);
});

test('reconcile 纯函数：相同输入幂等', () => {
  const a = reconcile(allMerchants, ALL_MERCHANTS, merchants);
  const b = reconcile(allMerchants, ALL_MERCHANTS, merchants);
  assert.deepEqual(a, b);
});
