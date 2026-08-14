// scripts/normalize-data.test.mjs
// 重名治理（V4.4 S2）纯函数回归：真重复合并 + 分店改名保留 + 唯一性保证。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDuplicateNames } from './normalize-data.mjs';

const shop = (id, name, address, lng = 114.3, lat = 30.5, extra = {}) => ({
  id, name, address, lng, lat, ...extra,
});

test('真重复（同址同坐标）：保留首条、丢弃其余', () => {
  const list = [
    shop('m0001', '老樊城襄阳牛肉面', '民族大道888号', 114.38, 30.47, { rating: '必吃' }),
    shop('m0100', '老樊城襄阳牛肉面', '民族大道888号', 114.38, 30.47, { rating: '' }),
  ];
  const { merchants: out, merged, renamed } = resolveDuplicateNames(list);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'm0001');
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].dropped, ['m0100']);
  assert.equal(renamed.length, 0);
});

test('同名不同址（分店）：改名保留，两店都在', () => {
  const list = [
    shop('m0345', '阿德鱼湾', '火炬路14附1', 114.30061, 30.552153),
    shop('m0449', '阿德鱼湾', '二七北路28附16', 114.218193, 30.582621),
  ];
  const { merchants: out, merged, renamed } = resolveDuplicateNames(list);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, '阿德鱼湾');
  assert.equal(out[1].name, '阿德鱼湾（二七北路28附16）');
  assert.equal(merged.length, 0);
  assert.equal(renamed.length, 1);
  assert.equal(renamed[0].id, 'm0449');
});

test('空地址分店：用 zone 作区分的兜底改名', () => {
  const list = [
    shop('m0001', '某店', '', 114.3, 30.5),
    shop('m0002', '某店', '', 114.4, 30.6, { zone: '财大南湖周边' }),
  ];
  const { merchants: out } = resolveDuplicateNames(list);
  assert.equal(out.length, 2);
  assert.equal(out[1].name, '某店（财大南湖周边）');
});

test('去重后名称全局唯一（与前端 all-merchants.js 同口径：去空白+小写）', () => {
  const list = [
    shop('m0001', '老樊城 襄阳牛肉面', 'A 路', 114.3, 30.5),
    shop('m0002', '老樊城襄阳牛肉面', 'A 路', 114.3, 30.5),
    shop('m0003', '巴依家 手抓饭（二中店）', 'B 路', 114.3, 30.5),
    shop('m0004', '巴依家手抓饭（二中店）', 'B 路', 114.3, 30.5),
  ];
  const { merchants: out } = resolveDuplicateNames(list);
  const key = (n) => (n || '').replace(/\s+/g, '').toLowerCase();
  const seen = new Set();
  for (const m of out) {
    const k = key(m.name);
    assert.ok(!seen.has(k), '存在重复名称: ' + m.name);
    seen.add(k);
  }
  assert.equal(out.length, 2);
});
