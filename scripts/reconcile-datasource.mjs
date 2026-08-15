// scripts/reconcile-datasource.mjs
// ============================================================================
// 数据源口径核对（V4.4 S2 / 统一后守卫）
// ----------------------------------------------------------------------------
// 目的：守卫"双端同口径"不变量——前端 allMerchants 与后端运行时 ALL_MERCHANTS
//       必须同源同量（V4.4 S2 已统一为 860），并监控 merchants.js 原始表的重名质量。
// 红线守约：本脚本【只读】数据源与运行时，绝不修改任何数据文件；不引入 PII/密钥；
//           不伪造坐标（仅统计外源坐标缺失情况）；
//           产出 report markdown + JSON 摘要，均落文档目录，改动可逆。
// 复用：reconcile() 为纯函数，供 *.test.mjs 断言回归。
// ============================================================================
import { allMerchants } from '../h5/src/data/all-merchants.js';
import { merchants } from '../h5/src/data/merchants.js';
import { ALL_MERCHANTS } from '../hypha/implementation/src/runtime.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const norm = (n) => (n || '').toString().replace(/\s+/g, '').toLowerCase();

/**
 * 纯函数：核对前端聚合层与后端运行时数据源的口径一致性 + 原始表质量。
 * @param {Array} frontend 前端聚合层（allMerchants）
 * @param {Array} backend  后端运行时 ALL_MERCHANTS（hypha runtime）
 * @param {Array} rawBackend 原始表 merchants.js（质量监控用）
 * @returns {object} 结构化报告
 */
export function reconcile(frontend, backend, rawBackend = []) {
  const fIds = new Set(frontend.map((m) => m.id));
  const bIds = new Set(backend.map((m) => m.id));
  const fNames = new Set(frontend.map((m) => norm(m.name)));

  const frontendExtras = frontend.filter((m) => !bIds.has(m.id));
  const backendOnlyById = backend.filter((m) => !fIds.has(m.id));
  // 后端"缺失"项里，按店名实则已在前端 = 被合并去重吞掉（通常是后端内重名）
  const backendOnlyAlsoByName = backendOnlyById.filter((m) => fNames.has(norm(m.name)));

  // 原始表 merchants.js 内部的重名（归一化店名）计数 —— V4.4 S2 治理后应为 0
  const nameCount = new Map();
  for (const m of rawBackend) {
    const k = norm(m.name);
    nameCount.set(k, (nameCount.get(k) || 0) + 1);
  }
  const intraBackendDups = [...nameCount.values()].filter((c) => c > 1).length;

  const sourceBreakdown = {};
  for (const m of frontend) {
    const s = m.source || 'unknown';
    sourceBreakdown[s] = (sourceBreakdown[s] || 0) + 1;
  }

  const zoneFrontend = {}, zoneBackend = {};
  for (const m of frontend) zoneFrontend[m.zone] = (zoneFrontend[m.zone] || 0) + 1;
  for (const m of backend) zoneBackend[m.zone] = (zoneBackend[m.zone] || 0) + 1;

  const confidenceFrontend = {}, confidenceBackend = {};
  for (const m of frontend) {
    const c = m.dataConfidence || 'undefined';
    confidenceFrontend[c] = (confidenceFrontend[c] || 0) + 1;
  }
  for (const m of backend) {
    const c = m.dataConfidence || 'undefined';
    confidenceBackend[c] = (confidenceBackend[c] || 0) + 1;
  }

  // 坐标完整性（全量口径，S2 统一后双端同源）：外源商户（robin-99/web-stalls，source 非编辑/地推/web-verified）
  // 必须坐标为 null 或带 geocode 审计标记，否则视为伪造坐标；geocodeCoords = 真实补全数。
  const EXTERNAL_SOURCES = (s) => s && !['编辑', '地推', 'web-verified'].includes(s);
  const extrasWithFakeCoords = frontend.filter(
    (m) => (m.lng != null || m.lat != null) && !m.coordsSource && EXTERNAL_SOURCES(m.source)
  ).length;
  const geocodeCoords = frontend.filter((m) => m.coordsSource === 'geocode').length;

  return {
    frontendCount: frontend.length,
    backendCount: backend.length,
    rawBackendCount: rawBackend.length,
    frontendExtras: frontendExtras.length,
    backendOnlyById: backendOnlyById.length,
    backendOnlyAlsoByName: backendOnlyAlsoByName.length,
    intraBackendDups,
    unified: frontend.length === backend.length && frontendExtras.length === 0 && backendOnlyById.length === 0,
    sourceBreakdown,
    zoneFrontend,
    zoneBackend,
    confidenceFrontend,
    confidenceBackend,
    extrasWithFakeCoords,
    geocodeCoords,
    staleDocClaim: 'V4.4 S2（2026-08-15）已统一：双端 860；merchants.js 重名 0（58 组合并 + 3 组分店改名保留）',
  };
}

function renderMarkdown(r, generatedAt) {
  const lines = [];
  lines.push('# 数据源口径核对报告（V4.4 S2 · 统一后守卫）');
  lines.push('');
  lines.push(`> 自动生成于 ${generatedAt}。脚本：\`scripts/reconcile-datasource.mjs\`（只读分析，不修改数据）。`);
  lines.push('> 红线：未伪造坐标、未引入 PII/密钥、未改数据文件。');
  lines.push('');
  lines.push('## 1. 总体结论（V4.4 S2 统一后）');
  lines.push('');
  lines.push(`- **前端聚合层 \`allMerchants\` = ${r.frontendCount} 家**（供 detail/ranking/map/account/list 5 视图）。`);
  lines.push(`- **后端运行时 \`ALL_MERCHANTS\` = ${r.backendCount} 家**（hypha runtime，与前端同源）。`);
  lines.push(`- **口径一致 = ${r.unified ? '✅ 是' : '❌ 否'}**：前端独有 ${r.frontendExtras} / 后端独有 ${r.backendOnlyById}。`);
  lines.push(`- **原始表 \`merchants.js\` = ${r.rawBackendCount} 家，内部重名组 = ${r.intraBackendDups}**（S2 治理：58 组真重复合并 + 3 组分店改名保留）。`);
  lines.push('');
  lines.push('## 2. 口径差异明细');
  lines.push('');
  lines.push('| 维度 | 数值 |');
  lines.push('|------|------|');
  lines.push(`| 前端 allMerchants | ${r.frontendCount} |`);
  lines.push(`| 后端 ALL_MERCHANTS | ${r.backendCount} |`);
  lines.push(`| 原始表 merchants.js | ${r.rawBackendCount} |`);
  lines.push(`| 前端独有（后端缺失） | ${r.frontendExtras} |`);
  lines.push(`| 后端独有（按 id） | ${r.backendOnlyById} |`);
  lines.push(`| 后端独有（按店名已在前端） | ${r.backendOnlyAlsoByName} |`);
  lines.push(`| 原始表内部重名组 | ${r.intraBackendDups} |`);
  lines.push('');
  lines.push('### 统一集来源构成（sourceBreakdown）');
  lines.push('');
  for (const [src, n] of Object.entries(r.sourceBreakdown)) {
    lines.push(`- ${src}：${n} 家`);
  }
  lines.push('');
  lines.push('## 3. 分布对比');
  lines.push('');
  lines.push('### 片区（zone，统一集）');
  lines.push('');
  lines.push('| zone | 商户数 |');
  lines.push('|------|--------|');
  for (const [z, n] of Object.entries(r.zoneFrontend)) {
    lines.push(`| ${z} | ${n} |`);
  }
  lines.push('');
  lines.push('### 数据置信度（dataConfidence，统一集）');
  lines.push('');
  lines.push('| confidence | 商户数 |');
  lines.push('|------------|--------|');
  for (const [c, n] of Object.entries(r.confidenceFrontend)) {
    lines.push(`| ${c} | ${n} |`);
  }
  lines.push('');
  lines.push('## 4. 数据质量标记');
  lines.push('');
  lines.push(`- 原始表 \`merchants.js\` 内部重名组 = ${r.intraBackendDups}（S2 治理后应为 0；58 组真重复合并、3 组分店改名保留：重庆辣子鱼家常菜（恩施街29户25号）/ 阿德鱼湾（二七北路28附16）/ 湖滨客舍（黄鹂路78号））。`);
  lines.push(`- 坐标违规计数（差异项却带 lng/lat）= ${r.extrasWithFakeCoords}（应为 0；非 0 即需排查伪造坐标）。`);
  lines.push('');
  lines.push('## 5. 守卫方式');
  lines.push('');
  lines.push('- `scripts/reconcile-datasource.test.mjs` 锁定新基线（860 / 860 / 567 / 重名 0 / 独有 0），数据漂移即告警。');
  lines.push('- 前端 5 视图与后端 Agent 同源消费 allMerchants；Agent 返回 id 天然 ⊂ 前端集合，详情跳转零破坏。');
  lines.push('- 后续数据治理（estimated→verified 探店升级）仍走 collect-visit.mjs 管线，不破坏本口径。');
  lines.push('');
  lines.push('---');
  lines.push('*本报告由"蛮有味迭代管家"V4.4 S2 生成，仅分析不改数。*');
  return lines.join('\n');
}

// CLI 主流程：仅当直接运行（非被 import）时写文件
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const generatedAt = new Date().toISOString();
  const report = reconcile(allMerchants, ALL_MERCHANTS, merchants);
  const md = renderMarkdown(report, generatedAt);
  const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'datasource-reconcile.md');
  writeFileSync(outPath, md, 'utf8');
  console.log(JSON.stringify({ ...report, generatedAt }, null, 2));
  console.log(`\nreport written -> ${outPath}`);
}
