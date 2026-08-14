#!/usr/bin/env node
// 待核验上传治理 CLI（S5 · 2026-08-15）
// 用法：
//   node scripts/govern-uploads.mjs list [--limit N]
//   node scripts/govern-uploads.mjs promote <uploadId> [--note "人工核验通过"] [--dry-run] [--by admin]
//   node scripts/govern-uploads.mjs reject <uploadId> [--note "重复/信息不足"] [--dry-run] [--by admin]
// 说明：promote = 人工确认收录（进 verified，带 governance 标记）；reject = 驳回（进 rejected，保留轨迹，不硬删）。
import { listPendingUploads, governUpload } from '../hypha/implementation/src/upload.js';

const args = process.argv.slice(2);
const [cmd, ...rest] = args;

function flag(name) {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}
function hasFlag(name) {
  return rest.includes(name);
}

async function main() {
  if (cmd === 'list') {
    const limit = flag('--limit') ? Number(flag('--limit')) : undefined;
    const r = await listPendingUploads({ limit });
    if (!r.ok) { console.error('失败:', r.error); process.exit(1); }
    console.log(`待核验 ${r.total} 条（展示 ${r.count} 条）`);
    for (const it of r.items) {
      console.log(`  [${it.uploadId}] ${it.name || '(无名)'} | ${it.category || '未分类'} | ${it.address || '无地址'} | ${it.reason} | ${it.receivedAt}`);
      if (it.description) console.log(`       描述: ${it.description}`);
    }
    return;
  }

  if (cmd === 'promote' || cmd === 'reject') {
    const uploadId = rest[0];
    if (!uploadId) { console.error('用法: node scripts/govern-uploads.mjs ' + cmd + ' <uploadId> [--note x] [--dry-run]'); process.exit(1); }
    const r = await governUpload({
      uploadId,
      action: cmd,
      dryRun: hasFlag('--dry-run'),
      by: flag('--by') || 'admin-cli',
      note: flag('--note') || '',
    });
    if (!r.ok) { console.error('失败:', r.error); process.exit(1); }
    if (r.dryRun) console.log(`[dry-run] 将执行 ${r.would}：${uploadId}（未落盘）`);
    else console.log(`已 ${r.action} ${uploadId}（by ${r.by}）剩余待核验 ${r.pendingTotal} 条，审计已记录`);
    return;
  }

  console.error('用法: list | promote <id> | reject <id>（--dry-run / --note / --by 可选项）');
  process.exit(1);
}

main().catch((err) => { console.error('错误:', err && err.message || err); process.exit(1); });
