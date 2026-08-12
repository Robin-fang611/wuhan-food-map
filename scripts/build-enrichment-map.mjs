// 把各 enrichment-<theme>.json（按 matchName 模糊匹配）映射到生成的 merchants 的 id，
// 合并为 assets/foodmap-data/enrichment.json（id 键），供 normalize-data.mjs 在生成时合并。
//
// 运行：node scripts/build-enrichment-map.mjs
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const assetDir = resolve(root, 'assets/foodmap-data');
const merchantsPath = resolve(root, 'h5/src/data/merchants.js');

const { merchants } = await import(pathToFileURL(merchantsPath).href);

// 归一化：转小写 + 去常见标点/空格，便于子串匹配（"蔡林记" ⇄ "蔡林记(XX店)"）。
function norm(s) {
  return String(s || '').toLowerCase().replace(/[\s（）()、，。·\-—_,.]/g, '');
}

const files = readdirSync(assetDir).filter((f) => f.startsWith('enrichment-') && f.endsWith('.json'));
const entries = [];
for (const f of files) {
  const arr = JSON.parse(readFileSync(resolve(assetDir, f), 'utf8'));
  for (const e of arr) if (e && e.matchName) entries.push(e);
}

const byId = {};
const unmatched = [];
for (const e of entries) {
  const nm = norm(e.matchName);
  if (!nm) continue;
  const matches = merchants.filter((m) => {
    const n = norm(m.name);
    return n.includes(nm) || nm.includes(n);
  });
  if (!matches.length) { unmatched.push(e.matchName); continue; }
  const fields = { ...e };
  delete fields.matchName;
  for (const m of matches) byId[m.id] = { ...byId[m.id], ...fields };
}

writeFileSync(resolve(assetDir, 'enrichment.json'), JSON.stringify(byId, null, 2) + '\n', 'utf8');
console.log('=== enrichment 映射完成 ===');
console.log('研究条目总数:', entries.length);
console.log('命中商户(按 id 去重):', Object.keys(byId).length);
console.log('未命中(真实数据暂未对应到现有商户，可作新增候选):', unmatched.length, unmatched);
console.log('输出: assets/foodmap-data/enrichment.json');
