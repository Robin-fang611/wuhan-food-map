#!/usr/bin/env node
// 数据备份（W7 · 2026-08-15）：把运行态数据（data/ 目录）打包到 backups/ 带时间戳（gitignored）。
// 用法：node scripts/backup-data.mjs [--keep N]   （默认保留最近 10 份）
// 覆盖：auth-users.json（账号，含加密手机号）/ favorites.json（收藏）/ merchant-uploads.json（上传+审计）/ llm-cost.log
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_DIR = resolve(ROOT, 'hypha/implementation/data');
const BACKUP_DIR = resolve(ROOT, 'backups');
const KEEP = 10;

function main() {
  if (!existsSync(DATA_DIR)) { console.log('无数据目录，跳过备份'); return; }
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = join(BACKUP_DIR, 'data-' + stamp);
  mkdirSync(target, { recursive: true });
  let n = 0;
  for (const f of readdirSync(DATA_DIR)) {
    const src = join(DATA_DIR, f);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(target, f));
    n++;
  }
  // 轮转：保留最近 KEEP 份
  const dirs = readdirSync(BACKUP_DIR)
    .filter((d) => d.startsWith('data-'))
    .sort()
    .reverse();
  for (const d of dirs.slice(KEEP)) rmSync(join(BACKUP_DIR, d), { recursive: true, force: true });
  console.log(`备份完成：${n} 个文件 → backups/${target.split('/').pop()}（保留最近 ${KEEP} 份）`);
}

main();
