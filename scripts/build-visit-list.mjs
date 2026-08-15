#!/usr/bin/env node
// 实地探店任务清单生成器（R5 准备 · 2026-08-15）
// 优先级：财大南湖周边 > estimated > 缺字段多（评分/推荐语/坐标）> 必吃/推荐标签优先。
// 用法：node scripts/build-visit-list.mjs [--limit 40] [--zone 财大南湖周边]
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const limit = flag('--limit') ? Number(flag('--limit')) : 40;
const zone = flag('--zone') || '财大南湖周边';

const { allMerchants } = await import('../h5/src/data/all-merchants.js');

// 缺失度评分：缺评分 +3 / 缺推荐语 +2 / 缺坐标 +3 / 缺口味 +1（estimated 基础分 +2）
function missingScore(m) {
  let s = m.dataConfidence === 'estimated' ? 2 : 0;
  if (!m.rating) s += 3;
  if (!m.reason && !m.editorReason) s += 2;
  if (typeof m.lng !== 'number') s += 3;
  if (!m.taste) s += 1;
  return s;
}

const candidates = allMerchants
  .filter((m) => m.zone === zone)
  .map((m) => ({ ...m, _score: missingScore(m) }))
  .sort((a, b) => b._score - a._score || (a.rating === '必吃' ? -1 : 1));

const list = candidates.slice(0, limit);

const lines = [];
lines.push(`# 实地探店任务清单（${new Date().toISOString().slice(0, 10)}）`);
lines.push('');
lines.push(`> 目标片区：${zone} · 候选 ${candidates.length} 家 · 本清单 ${list.length} 家（按「缺字段严重度」排序）`);
lines.push('> 用法：`node scripts/collect-visit.mjs template` 生成采集模板 → 实地核验 → `validate` → 合并入库（见 docs/collect-visit-guide.md）');
lines.push('');
lines.push('| # | 店名 | 分类 | 地址 | 缺评分 | 缺推荐语 | 缺坐标 | 优先级分 |');
lines.push('|---|------|------|------|--------|----------|--------|----------|');
list.forEach((m, i) => {
  lines.push(`| ${i + 1} | ${m.name} | ${m.category || '-'} | ${(m.address || '').slice(0, 24) || '-'} | ${m.rating ? '' : '✓'} | ${m.reason || m.editorReason ? '' : '✓'} | ${typeof m.lng === 'number' ? '' : '✓'} | ${m._score} |`);
});
lines.push('');
lines.push('## 建议核验点（collect-visit 模板字段）');
lines.push('- 评分：必吃 / 推荐 / 一般（rating）；推荐菜 1~3 道；人均区间；营业时间；');
lines.push('- 口味与标签：taste / tasteTags（如清淡/辣/香酥）；适合场景（单人/聚餐/约会）；');
lines.push('- 坐标：实地定位（lng/lat）——缺坐标店优先补；');
lines.push('- 拍照：门头 + 招牌菜（供 Demo 图库，多模态可辅助整理）。');
lines.push('');
lines.push('*本清单由 scripts/build-visit-list.mjs 自动生成，可随时重跑。*');

const out = resolve(ROOT, 'docs/visit-list-2026-08-15.md');
writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`清单已生成：${out}（${list.length} 家，优先级分 ${list[0] ? list[0]._score : 0}~0）`);
