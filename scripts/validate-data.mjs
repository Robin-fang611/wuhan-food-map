// 数据治理 · 校验脚本（M5）
// -------------------------------------------------------------
// 校验 h5/src/data/merchants.js 与 places.js：
//  - ERROR：分类越界(不在白名单) / 坐标越界(武汉经纬度范围) / 伪分类残留 / 必填缺失 / 重复 id
//  - WARNING：可容忍告警（rating/avgPrice/mealTime 空缺、坐标边界附近）
//
// 退出码：有 ERROR 则 1，否则 0（供 CI / 自动循环判定）。
// 运行：node scripts/validate-data.mjs
// 依赖 normalize-data.mjs 已生成数据模块。

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const data = (f) => resolve(root, 'h5/src/data', f);

const { merchants } = await import(data('merchants.js'));
const { places } = await import(data('places.js'));

// 复用归一化的白名单，保证"生成=校验"口径一致
const { CATEGORY_WHITELIST } = await import(resolve(root, 'scripts/normalize-data.mjs'));
const WHITELIST = new Set(CATEGORY_WHITELIST);

// 武汉经纬度范围（GCJ-02 合理边界，留余量）
const BOUNDS = { lngMin: 113.9, lngMax: 115.1, latMin: 29.9, latMax: 31.4 };
const PSEUDO = new Set(['五谷杂粮', '南湖推荐']);

let errors = 0, warnings = 0;
const err = (m) => { errors++; console.log('  ERROR  ', m); };
const warn = (m) => { warnings++; console.log('  WARN   ', m); };

// ---------- merchants ----------
const seen = new Map();
for (const m of merchants) {
  if (!m.id) err('商户缺 id');
  else if (seen.has(m.id)) err(`重复 id: ${m.id}`);
  else seen.set(m.id, true);

  if (!m.name) err(`商户(${m.id}) 缺 name`);

  if (!WHITELIST.has(m.category)) {
    err(`商户(${m.id} ${m.name}) 分类越界: "${m.category}"（不在白名单）`);
  }
  if (PSEUDO.has(m.category)) {
    err(`商户(${m.id} ${m.name}) 伪分类残留: "${m.category}"（应已消解）`);
  }

  const lng = Number(m.lng), lat = Number(m.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    err(`商户(${m.id} ${m.name}) 坐标非法/缺失`);
  } else if (lng < BOUNDS.lngMin || lng > BOUNDS.lngMax || lat < BOUNDS.latMin || lat > BOUNDS.latMax) {
    err(`商户(${m.id} ${m.name}) 坐标越界: (${lng},${lat}) 超出武汉范围`);
  } else if (lng < BOUNDS.lngMin + 0.05 || lng > BOUNDS.lngMax - 0.05 || lat < BOUNDS.latMin + 0.05 || lat > BOUNDS.latMax - 0.05) {
    warn(`商户(${m.id} ${m.name}) 坐标接近边界: (${lng},${lat})`);
  }

  if (m.rating && !['必吃', '推荐'].includes(m.rating)) {
    err(`商户(${m.id} ${m.name}) rating 非法值: "${m.rating}"`);
  }
  if (!m.rating) warn(`商户(${m.id} ${m.name}) rating 空缺`);
  if (!m.avgPrice) warn(`商户(${m.id} ${m.name}) avgPrice 空缺`);
  if (!m.mealTime || !m.mealTime.length) warn(`商户(${m.id} ${m.name}) mealTime 空缺`);
  if (!m.zone || !['首义', '南湖', '全城'].includes(m.zone)) {
    err(`商户(${m.id} ${m.name}) zone 非法: "${m.zone}"`);
  }
}

// ---------- places ----------
const seenP = new Map();
for (const p of places) {
  if (!p.id) err('景点缺 id');
  else if (seenP.has(p.id)) err(`重复 id: ${p.id}`);
  else seenP.set(p.id, true);
  if (!p.name) err(`景点(${p.id}) 缺 name`);
  const lng = Number(p.lng), lat = Number(p.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) err(`景点(${p.id} ${p.name}) 坐标非法/缺失`);
  else if (lng < BOUNDS.lngMin || lng > BOUNDS.lngMax || lat < BOUNDS.latMin || lat > BOUNDS.latMax) {
    err(`景点(${p.id} ${p.name}) 坐标越界`);
  }
}

console.log('\n=== 校验结果 ===');
const errCat = merchants.filter((m) => !WHITELIST.has(m.category) || PSEUDO.has(m.category)).length;
console.log(`merchants: ${merchants.length}, places: ${places.length}`);
console.log(`分类越界/伪分类残留: ${errCat}`);
console.log(`ERROR: ${errors}  WARNING: ${warnings}`);
console.log(errors === 0
  ? '✅ 0 个 ERROR，数据通过校验（WARNING 可容忍）。'
  : `❌ 存在 ${errors} 个 ERROR，需人工修复后再发布。`);

process.exit(errors === 0 ? 0 : 1);
