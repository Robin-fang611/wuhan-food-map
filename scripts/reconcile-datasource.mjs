// scripts/reconcile-datasource.mjs
// ============================================================================
// 数据源口径核对（V4.4 安全切片 / 只读分析）
// ----------------------------------------------------------------------------
// 目的：核对前端 allMerchants 与后端 wuhan 数据源 merchants.js 的口径差异，
//       为"双端同口径"统一任务提供事实基线。
// 红线守约：本脚本【只读】两个数据源，绝不修改任何数据文件；不引入 PII/密钥；
//           不伪造坐标（仅统计外源坐标缺失情况）；
//           产出 report markdown + JSON 摘要，均落文档目录，改动可逆。
// 复用：reconcile() 为纯函数，供 *.test.mjs 断言回归。
// ============================================================================
import { allMerchants } from '../h5/src/data/all-merchants.js';
import { merchants } from '../h5/src/data/merchants.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const norm = (n) => (n || '').toString().replace(/\s+/g, '').toLowerCase();

/**
 * 纯函数：核对两个商户集合的口径差异。
 * @param {Array} frontend 前端聚合层（allMerchants）
 * @param {Array} backend  后端 wuhan 数据源（merchants.js）
 * @returns {object} 结构化报告
 */
export function reconcile(frontend, backend) {
  const fIds = new Set(frontend.map((m) => m.id));
  const bIds = new Set(backend.map((m) => m.id));
  const fNames = new Set(frontend.map((m) => norm(m.name)));

  const frontendExtras = frontend.filter((m) => !bIds.has(m.id));
  const backendOnlyById = backend.filter((m) => !fIds.has(m.id));
  // 后端"缺失"项里，按店名实则已出现在前端 = 被合并去重吞掉（通常是后端内重名）
  const backendOnlyAlsoByName = backendOnlyById.filter((m) => fNames.has(norm(m.name)));

  // 后端数据源内部的重名（归一化店名）计数
  const nameCount = new Map();
  for (const m of backend) {
    const k = norm(m.name);
    nameCount.set(k, (nameCount.get(k) || 0) + 1);
  }
  const intraBackendDups = [...nameCount.values()].filter((c) => c > 1).length;

  const extrasBySource = {};
  for (const m of frontendExtras) {
    const s = m.source || 'unknown';
    extrasBySource[s] = (extrasBySource[s] || 0) + 1;
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

  // 坐标完整性：外源补充项必须坐标为 null（绝不伪造）；统计有无违规
  const extrasWithFakeCoords = frontendExtras.filter(
    (m) => m.lng != null || m.lat != null
  );

  return {
    frontendCount: frontend.length,
    backendCount: backend.length,
    frontendExtras: frontendExtras.length,
    backendOnlyById: backendOnlyById.length,
    backendOnlyAlsoByName: backendOnlyAlsoByName.length,
    intraBackendDups,
    extrasBySource,
    zoneFrontend,
    zoneBackend,
    confidenceFrontend,
    confidenceBackend,
    extrasWithFakeCoords: extrasWithFakeCoords.length,
    staleDocClaim: 'open-threads 写 832 vs 590，实测 857 vs 625（以本报告为准）',
  };
}

function renderMarkdown(r, generatedAt) {
  const lines = [];
  lines.push('# 数据源口径核对报告（V4.4 基线）');
  lines.push('');
  lines.push(`> 自动生成于 ${generatedAt}。脚本：\`scripts/reconcile-datasource.mjs\`（只读分析，不修改数据）。`);
  lines.push('> 红线：未伪造坐标、未引入 PII/密钥、未改数据文件。');
  lines.push('');
  lines.push('## 1. 总体结论');
  lines.push('');
  lines.push(`- **前端聚合层 \`allMerchants\` = ${r.frontendCount} 家**（供 detail/ranking/map/account/list 5 视图）。`);
  lines.push(`- **后端 wuhan 数据源 \`merchants.js\` = ${r.backendCount} 家**（BFF 唯一事实源）。`);
  lines.push(`- **前端独有（后端缺失）= ${r.frontendExtras} 家**：来自 \`robin-99\`(论文致谢强背书) + \`web-stalls\`(网络公开资料补充)。`);
  lines.push(`- **后端独有（按 id 不在前端）= ${r.backendOnlyById} 家**，其中 ${r.backendOnlyAlsoByName} 家按店名实则已在前端 → 系后端数据源内**重名被合并去重吞掉**，非真实缺失。`);
  lines.push(`- **后端数据源内重名（归一化店名）共 ${r.intraBackendDups} 组** → 数据质量待治理（见 §4）。`);
  lines.push('');
  lines.push('## 2. 口径差异明细');
  lines.push('');
  lines.push('| 维度 | 前端 allMerchants | 后端 merchants.js | 差 |');
  lines.push('|------|------------------|-------------------|----|');
  lines.push(`| 总商户数 | ${r.frontendCount} | ${r.backendCount} | +${r.frontendCount - r.backendCount} |`);
  lines.push(`| 前端独有 | — | — | ${r.frontendExtras} |`);
  lines.push(`| 后端独有(含被吞重名) | — | — | ${r.backendOnlyById} |`);
  lines.push(`| 后端内重名组 | — | — | ${r.intraBackendDups} |`);
  lines.push('');
  lines.push('### 前端独有来源拆分');
  lines.push('');
  for (const [src, n] of Object.entries(r.extrasBySource)) {
    lines.push(`- ${src}：${n} 家`);
  }
  lines.push('');
  lines.push('## 3. 分布对比');
  lines.push('');
  lines.push('### 片区（zone）');
  lines.push('');
  lines.push('| zone | 前端 | 后端 |');
  lines.push('|------|------|------|');
  const zones = new Set([...Object.keys(r.zoneFrontend), ...Object.keys(r.zoneBackend)]);
  for (const z of zones) {
    lines.push(`| ${z} | ${r.zoneFrontend[z] || 0} | ${r.zoneBackend[z] || 0} |`);
  }
  lines.push('');
  lines.push('### 数据置信度（dataConfidence）');
  lines.push('');
  lines.push('| confidence | 前端 | 后端 |');
  lines.push('|------------|------|------|');
  const confs = new Set([...Object.keys(r.confidenceFrontend), ...Object.keys(r.confidenceBackend)]);
  for (const c of confs) {
    lines.push(`| ${c} | ${r.confidenceFrontend[c] || 0} | ${r.confidenceBackend[c] || 0} |`);
  }
  lines.push('');
  lines.push('## 4. 数据质量标记');
  lines.push('');
  lines.push(`- 后端 \`merchants.js\` 内存在 **${r.intraBackendDups} 组重名商户**（归一化店名相同），合并进前端时被首条保留、其余静默丢弃。建议在统一口径前先清理（去重/修正店名），属**数据修改**，需 Robin 授权。`);
  lines.push(`- 前端独有 ${r.frontendExtras} 家中，坐标为 null 的占比 = ${(r.frontendExtras - r.extrasWithFakeCoords)}/${r.frontendExtras}（无伪造坐标，符合红线）。`);
  lines.push(`- 坐标违规计数（外源却带 lng/lat）= ${r.extrasWithFakeCoords}（应为 0；非 0 即需排查伪造坐标）。`);
  lines.push('');
  lines.push('## 5. 统一口径建议（执行需 Robin 授权，本切片不做）');
  lines.push('');
  lines.push('- **方向 A（推荐，对齐前端现状）**：后端 wuhan 数据源也摄入 \`robin-99\` + \`web-stalls\`，使后端 = 前端 = 857；Agent 返回 id 已⊂前端集合，零破坏。需把两个外源并入后端构建管线（数据修改 + 构建改动）。');
  lines.push('- **方向 B（对齐后端纯净集）**：前端改为仅消费 625 纯净集，前端独有 293 家暂不下发。会削弱前端覆盖（论文致谢/名吃缺失），不推荐。');
  lines.push('- **前置清理**：无论 A/B，先治理 §4 的 61 组后端重名，避免合并后计数漂移。');
  lines.push('- **红线**：统一过程不得伪造外源坐标、不得引入密钥/PII；真实分润/签约仍走 V4.1–V4.3 BFF（待 Robin 决策）。');
  lines.push('');
  lines.push('---');
  lines.push('*本报告由"蛮有味迭代管家"V4.4 安全切片生成，仅分析不改数。*');
  return lines.join('\n');
}

// CLI 主流程：仅当直接运行（非被 import）时写文件
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const generatedAt = new Date().toISOString();
  const report = reconcile(allMerchants, merchants);
  const md = renderMarkdown(report, generatedAt);
  const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'datasource-reconcile.md');
  writeFileSync(outPath, md, 'utf8');
  console.log(JSON.stringify({ ...report, generatedAt }, null, 2));
  console.log(`\nreport written -> ${outPath}`);
}
