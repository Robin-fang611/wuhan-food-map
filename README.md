# 江城 · 财大项目工作区

本工作区包含两个并列项目，便于对照演进：

| 目录 | 项目 | 状态 | 技术栈 |
|------|------|------|--------|
| `handbook/` | 江城 · 新生手册（V1 静态版） | 已冻结保留 | 纯静态 HTML + CSS + JS（Netlify） |
| `platform/` | 江城 · 全校日常平台（V2 升级） | 开发中 | Next.js + TypeScript + Tailwind + Supabase |

## 说明

- 旧静态手册已整体迁入 `handbook/`，git 历史通过 `git mv` 保留；备份标签：`backup/static-v1-2026-08-02`，另存 zip 副本于上级目录。
- 新平台从零搭建，目标是从「新生手册」升级为「全校日常平台」（学业 + 生活 + 社交 + 交易）。
- 详见 `platform/README.md`。
