# 江城 · 全校日常平台

中南财经政法大学民间非官方 **学业 + 生活一站式平台**（全校日常版）。
技术栈：**Next.js (App Router) + TypeScript + Tailwind CSS v4 + Supabase**。

> 本目录是「江城新生手册」的升级项目，与 `../handbook/`（旧静态站，已冻结）并列，便于对照。

## 本地开发

```bash
cd platform
npm install
cp .env.example .env.local   # 填入你的 Supabase 项目地址与 key
npm run dev                  # http://localhost:3000
```

## 连接 Supabase

1. 在 https://supabase.com 新建项目。
2. 复制 `.env.example` 为 `.env.local`，填入 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
3. 在 Supabase 控制台 SQL Editor 执行 `supabase/schema.sql` 建表（含 RLS 策略）。
4. 客户端封装见 `src/lib/supabase/`。

## 目录结构

```
src/
  app/            # 路由与页面（layout / page / providers）
  components/     # 顶栏 / 双Tab / 全局搜索 / 主题·校区切换 / 模块详情 等
  lib/
    content.ts   # 本地占位数据 + 搜索索引（接 Supabase 前先用它跑通 UI）
    supabase/    # Supabase 浏览器/服务端客户端封装
supabase/
  schema.sql     # 初始数据模型（profiles/posts/shops/canteen/secondhand/questions/...）
```

## 当前进度（P0 骨架）

- [x] 应用外壳：顶栏 + 全局搜索 + 双 Tab（学业成长中心 / 校园生活广场）
- [x] 主题切换（深/浅，localStorage 记忆）、校区切换（南湖/首义）
- [x] 模块网格 + 详情弹窗（含可勾选清单，本地持久化）
- [x] 数据模型 SQL + 环境变量样例
- [ ] 接入 Supabase 实时数据（美食点评 / 食堂评价 / 二手 / 问答）
- [ ] 学业工具箱（课表 / GPA / 体测）
- [ ] 商家投流 + 支付（Stripe）

## 技术决策记录

- 选 Next.js + Supabase：规范、可扩展，后期接 Stripe 做商家投流；SSR 利于搜索收录。
- 旧静态站保留在 `../handbook/`，已打 git tag `backup/static-v1-2026-08-02` 备份。
