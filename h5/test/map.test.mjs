// M9 地图视图单元测试：纯函数（bbox / 投影 / 标记数 / 排序）+ 无 Key 泄露。
// 运行：/Users/onebilion/.workbuddy/binaries/node/versions/22.22.2/bin/node test/map.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeBBox, projectPoint, markersForZone, getAmapKey } from '../src/ui/map.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let pass = 0;
function ok(name, fn) { fn(); pass++; console.log(`  ✓ ${name}`); }

// 受控夹具：含坐标/缺坐标/不同校区/不同评分
const fix = [
  { id: 'a', name: 'A', zone: '首义', lng: 114.30, lat: 30.54, rating: '必吃' },
  { id: 'b', name: 'B', zone: '首义', lng: 114.31, lat: 30.55, rating: '推荐' },
  { id: 'c', name: 'C', zone: '首义', lng: 114.32, lat: 30.53 },
  { id: 'd', name: 'D', zone: '南湖', lng: 114.37, lat: 30.48, rating: '必吃' },
  { id: 'e', name: 'E', zone: '首义', lng: 114.29, lat: 30.56 },
  { id: 'f', name: 'F', zone: '首义' } // 缺坐标，应被排除
];

const bboxAB = computeBBox([fix[0], fix[1], fix[2]]); // a,b,c

ok('computeBBox 取经纬度极值', () => {
  assert.deepStrictEqual(bboxAB, { minLng: 114.30, maxLng: 114.32, minLat: 30.53, maxLat: 30.55 });
});

ok('computeBBox 全部缺坐标返回 null', () => {
  assert.strictEqual(computeBBox([fix[5]]), null);
});

ok('projectPoint 左下角点映射到留白边 (minLng,minLat)', () => {
  const p = projectPoint(fix[0], bboxAB); // a=minLng,mid lat
  assert.strictEqual(p.xPct, 8);
  assert.strictEqual(p.yPct, 50);
});

ok('projectPoint 顶部点 (maxLat) 映射到上边', () => {
  const p = projectPoint(fix[1], bboxAB); // b 为 maxLat
  assert.strictEqual(p.xPct, 50);
  assert.strictEqual(p.yPct, 8);
});

ok('projectPoint 右下角点 (maxLng,minLat) 映射到右下', () => {
  const p = projectPoint(fix[2], bboxAB); // c
  assert.strictEqual(p.xPct, 92);
  assert.strictEqual(p.yPct, 92);
});

ok('projectPoint 退化包围盒(单点) 居中 50,50', () => {
  const p = projectPoint(fix[0], computeBBox([fix[0]]));
  assert.deepStrictEqual(p, { xPct: 50, yPct: 50 });
});

ok('projectPoint 越界坐标被夹紧到 [8,92]', () => {
  const p = projectPoint({ lng: 0, lat: 0 }, bboxAB);
  assert.ok(p.xPct >= 8 && p.xPct <= 92 && p.yPct >= 8 && p.yPct <= 92);
});

ok('markersForZone 首义：标记数=有坐标的 4 家（f 缺坐标被排除）', () => {
  const ms = markersForZone(fix, '首义');
  assert.strictEqual(ms.length, 4);
  for (const m of ms) {
    assert.ok(typeof m.xPct === 'number' && m.xPct >= 8 && m.xPct <= 92);
    assert.ok(typeof m.yPct === 'number' && m.yPct >= 8 && m.yPct <= 92);
  }
});

ok('markersForZone 南湖：仅 d 有坐标 → 1 个标记', () => {
  assert.strictEqual(markersForZone(fix, '南湖').length, 1);
});

ok('markersForZone 按评分权重降序（必吃>推荐>其他）', () => {
  const ms = markersForZone(fix, '首义');
  assert.strictEqual(ms[0].id, 'a'); // 必吃
  assert.strictEqual(ms[1].id, 'b'); // 推荐
});

ok('markersForZone 不修改原数组', () => {
  const before = markersForZone(fix, '首义').length;
  markersForZone(fix, '首义');
  assert.strictEqual(markersForZone(fix, '首义').length, before);
});

ok('getAmapKey 默认返回 null（无 Key 泄露）', () => {
  assert.strictEqual(getAmapKey(), null);
});

ok('源码无硬编码高德 Key（32 位 hex / 明文 key 赋值）', () => {
  const src = readFileSync(join(__dirname, '../src/ui/map.js'), 'utf8');
  // 高德 JS Key 常见为 32 位十六进制；源码不允许出现字面量
  assert.ok(!/[a-f0-9]{32}/i.test(src), '源码含疑似高德 Key 字面量');
  assert.ok(!/amapJsKey\s*=\s*['"][^'"]+['"]/.test(src), '源码含硬编码 amapJsKey 值');
});

console.log(`\nmap.test: ${pass} 个用例全部通过 ✅`);

// W8.3 流动摊判定
import { test } from 'node:test';
import { isStallMerchant } from '../src/ui/map.js';
test('isStallMerchant：web-stalls 源识别为流动摊', () => {
  assert.equal(isStallMerchant({ source: '网络公开资料(文旅/腾讯地图/大众点评公开页/校周边攻略) 2026-08' }), true);
  assert.equal(isStallMerchant({ source: '地推' }), false);
  assert.equal(isStallMerchant({ source: '编辑' }), false);
  assert.equal(isStallMerchant(null), false);
});
