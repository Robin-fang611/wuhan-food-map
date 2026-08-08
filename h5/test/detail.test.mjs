// M8 验收：高德导航 URL 构造（公开 URI，无需 Key，符合 §8）。
// 纯函数 buildAmapUrl 不依赖 DOM，可直接在 node 运行。
import assert from 'node:assert/strict';
import { buildAmapUrl } from '../src/ui/detail.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ✓', name); }

test('构造高德公开 URI，主机为 uri.amap.com', () => {
  const url = buildAmapUrl({ name: '兰精灵饺子馆', lng: 114.301, lat: 30.548 });
  assert.ok(url.startsWith('https://uri.amap.com/marker?'), '主机应为 uri.amap.com');
});

test('URL 携带 GCJ-02 坐标', () => {
  const url = buildAmapUrl({ name: 'x', lng: 114.301, lat: 30.548 });
  assert.ok(url.includes('114.301') && url.includes('30.548'), '应包含经纬度');
  assert.ok(url.includes('coordinate=gaode'), '坐标体系应为 gaode(GCJ-02)');
});

test('URL 不得含任何密钥', () => {
  const url = buildAmapUrl({ name: 'x', lng: 114.3, lat: 30.5 });
  assert.ok(!/key=|ak=|secret|amap_key|security/i.test(url), 'URL 不得泄露密钥');
});

test('店名做 URI 编码（防注入/特殊字符）', () => {
  const url = buildAmapUrl({ name: '湘妹湖南菜馆（自力店）', lng: 114.2, lat: 30.5 });
  assert.ok(url.includes('name='), '应包含 name 参数');
  assert.ok(!url.includes('（'), '全角括号应被编码');
});

test('缺坐标返回 null（不渲染导航）', () => {
  assert.equal(buildAmapUrl({ name: 'x' }), null);
  assert.equal(buildAmapUrl(null), null);
  assert.equal(buildAmapUrl({}), null);
});

console.log(`\nM8 detail.test: ${passed} passed, 0 failed`);
