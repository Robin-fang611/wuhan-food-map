// 蛮有味 · 探店采集工具（V2.4）
// -------------------------------------------------------------
// 半自动采集模板 + 人工核验流程：把 needsEnrichment 商户（estimated）升级为 verified。
// 设计红线（严守）：
//  - 绝不编造数据：采集须真实；落库前必须有 attest='yes' 实地核验声明，否则该条被拒（不静默降级为 estimated）。
//  - 字段名避 phone/token/user_id（用 tel）；不导出 lng/lat（坐标沿用 base 商户，绝不伪造坐标）。
//  - 本脚本只产出 enrichment-collect-<batch>.json，不直接改写 merchants.js；真正应用由 Robin 跑
//    `build-enrichment-map.mjs` + `normalize-data.mjs`（已在现有合并管线支持）。
//
// 用法：
//  node scripts/collect-visit.mjs template [--batch N=20] [--zone <zone>] [--out <file>]
//  node scripts/collect-visit.mjs validate --in <filled.json> [--dry-run] [--batch <name>]
//
// 纯函数（buildEntry / validateRecord / makeTemplate）已导出，供 collect-visit.test.mjs 确定性测试，
// 不依赖 merchants.js，无需真实数据即可验证链路。

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const assetDir = resolve(root, 'assets/foodmap-data');
const merchantsPath = resolve(root, 'h5/src/data/merchants.js');

// 实地核验时必须声明的关键词（反伪造门禁）
const ATTEST_OK = new Set(['yes', true, 'YES', 'true', '是', '已探店']);

// 允许出现在 enrichment 里的字段（白名单，防御性剔除 phone/token/user_id 等红线字段）
const ALLOWED_FIELDS = new Set([
  'matchName', 'taste', 'tasteTags', 'avgPrice', 'environment',
  'occasions', 'signatureDishes', 'tel', 'dataConfidence', 'source', 'provenance',
]);

// 取 needsEnrichment 商户（懒加载，仅 template 命令需要）
async function loadNeedsEnrichment() {
  const mod = await import(pathToFileURL(merchantsPath).href);
  const list = (mod.merchants || []).filter((m) => m && m.needsEnrichment === true);
  return list;
}

// 生成一条待填模板记录（半自动：预填身份字段，人工只填观测字段）
export function makeTemplateRecord(m) {
  return {
    id: m.id || '',
    matchName: m.name || '',
    zone: m.zone || '',
    category: m.category || '',
    // —— 以下为人工探店须填字段（留空，由 Robin 实地填写）——
    taste: '',
    tasteTags: [],
    avgPrice: null,
    environment: '',
    occasions: [],
    signatureDishes: '',
    tel: '',
    attest: '' // 填 'yes' 表示已实地探店且以上信息真实
  };
}

// 生成整批模板
export function makeTemplate(merchants, { batch = 'batch', limit = 20, zone = '' } = {}) {
  let list = merchants;
  if (zone) list = list.filter((m) => m.zone === zone);
  list = list.slice(0, limit);
  return {
    batch,
    generatedAt: new Date().toISOString().slice(0, 10),
    instructions:
      '填写 taste/avgPrice/environment 等观测项；完成后把 attest 改为 "yes" 表示已实地探店且信息真实。' +
      'attest 非 yes 的记录不会被升级。tel 可留空；不要填 lng/lat（坐标沿用系统已有值）。',
    records: list.map(makeTemplateRecord),
  };
}

// 单条校验 + 构建 enrichment 条目（纯函数）
export function validateRecord(rec, { batch = 'batch', collectedAt = new Date().toISOString().slice(0, 10) } = {}) {
  const errors = [];
  if (!rec || typeof rec !== 'object') return { ok: false, errors: ['记录为空或非对象'] };
  if (!rec.id && !rec.matchName) errors.push('缺少 id 或 matchName（无法定位商户）');
  if (!ATTEST_OK.has(rec.attest)) errors.push('attest 未声明为 yes（未实地核验，拒绝升级）');
  const hasObservation = [rec.taste, rec.avgPrice, rec.environment, rec.signatureDishes]
    .some((v) => v !== undefined && v !== null && String(v).trim() !== '');
  if (!hasObservation) errors.push('无任何观测字段（taste/avgPrice/environment/signatureDishes 至少填一项）');
  if (errors.length) return { ok: false, errors };

  // 仅保留白名单字段，防御性剔除红线字段（phone/token/user_id/lng/lat 等）
  const entry = { matchName: rec.matchName };
  for (const k of ['taste', 'tasteTags', 'avgPrice', 'environment', 'occasions', 'signatureDishes', 'tel']) {
    if (rec[k] !== undefined) entry[k] = rec[k];
  }
  for (const bad of ['phone', 'token', 'user_id', 'lng', 'lat']) {
    if (bad in entry) delete entry[bad];
  }
  entry.dataConfidence = 'verified';
  entry.source = 'field-visit';
  entry.provenance = { method: 'field-visit', collectedAt, batch, note: '人工实地探店核验' };
  return { ok: true, entry };
}

// 批量校验
export function validateBatch(template, opts = {}) {
  const records = (template && template.records) || [];
  const accepted = [];
  const rejected = [];
  for (const rec of records) {
    const r = validateRecord(rec, opts);
    if (r.ok) accepted.push(r.entry);
    else rejected.push({ id: rec && rec.id, matchName: rec && rec.matchName, errors: r.errors });
  }
  return { accepted, rejected, total: records.length };
}

function arg(name, argv, def) {
  const i = argv.indexOf(name);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  return def;
}
function hasFlag(name, argv) { return argv.includes(name); }

async function cmdTemplate(argv) {
  const limit = parseInt(arg('--batch', argv, '20'), 10) || 20;
  const zone = arg('--zone', argv, '');
  const out = arg('--out', argv, resolve(assetDir, `collect-template-${new Date().toISOString().slice(0, 10)}.json`));
  const batchName = arg('--batch-name', argv, `visit-${new Date().toISOString().slice(0, 10)}`);
  const needs = await loadNeedsEnrichment();
  const tpl = makeTemplate(needs, { batch: batchName, limit, zone });
  writeFileSync(out, JSON.stringify(tpl, null, 2) + '\n', 'utf8');
  console.log(`=== 探店采集模板已生成 ===`);
  console.log(`待采集商户(needsEnrichment): 全仓 ${needs.length} 家`);
  console.log(`本批模板条数: ${tpl.records.length}${zone ? ` (zone=${zone})` : ''}`);
  console.log(`输出: ${out}`);
  console.log(`下一步: 实地探店后填写观测字段并把 attest 改为 "yes"，再运行 validate。`);
  return out;
}

async function cmdValidate(argv) {
  const inFile = arg('--in', argv, '');
  if (!inFile || !existsSync(inFile)) {
    console.error('[validate] 缺少 --in <filled.json> 或文件不存在');
    process.exitCode = 2; return;
  }
  const dryRun = hasFlag('--dry-run', argv);
  const batchName = arg('--batch', argv, 'visit-' + new Date().toISOString().slice(0, 10));
  const template = JSON.parse(readFileSync(inFile, 'utf8'));
  const result = validateBatch(template, { batch: batchName });
  console.log(`=== 探店核验结果 ===`);
  console.log(`总条数: ${result.total} | 接受(升级 verified): ${result.accepted.length} | 拒绝: ${result.rejected.length}`);
  for (const r of result.rejected) {
    console.log(`  ✗ 拒绝 [${r.id || '-'}] ${r.matchName || '(无名)'}: ${r.errors.join('; ')}`);
  }
  if (dryRun) {
    console.log('[dry-run] 未写入任何文件。');
    return;
  }
  if (!result.accepted.length) {
    console.log('无接受条目，未写入。');
    return;
  }
  const out = resolve(assetDir, `enrichment-collect-${batchName}.json`);
  writeFileSync(out, JSON.stringify(result.accepted, null, 2) + '\n', 'utf8');
  console.log(`已写入: ${out}`);
  console.log(`应用升级: 运行  node scripts/build-enrichment-map.mjs && node scripts/normalize-data.mjs`);
  console.log(`（应用会重写 h5/src/data/merchants.js，将对应商户 dataConfidence→verified、needsEnrichment→false）`);
}

async function main() {
  const [cmd, ...argv] = process.argv.slice(2);
  if (cmd === 'template') await cmdTemplate(argv);
  else if (cmd === 'validate') await cmdValidate(argv);
  else {
    console.log('用法:');
    console.log('  node scripts/collect-visit.mjs template [--batch N] [--zone <zone>] [--out <file>]');
    console.log('  node scripts/collect-visit.mjs validate --in <filled.json> [--dry-run] [--batch <name>]');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
