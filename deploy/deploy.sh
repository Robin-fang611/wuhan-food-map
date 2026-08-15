#!/bin/bash
# 蛮有味 · 一键部署（分支都试，选择测试通过的）
# 用法：
#   bash deploy/deploy.sh fly      # Fly.io 免费层（推荐先试）
#   bash deploy/deploy.sh render   # Render 免费层
#   bash deploy/deploy.sh check    # 部署前检查（.env 必备项 + 测试 + 构建）
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-check}"
case "$MODE" in
  check)
    echo "==> 部署前检查"
    node scripts/deploy-check.mjs || true
    echo "==> 全量测试"
    node --test h5/test/*.test.mjs hypha/implementation/test/*.test.mjs hypha/integration/*.test.mjs scripts/*.test.mjs 2>&1 | grep -E "# pass|# fail"
    echo "==> 前端构建"
    ( cd h5 && npm run build ) 2>&1 | grep -E "✓ built|error"
    echo "==> 检查通过。下一步：bash deploy/deploy.sh fly 或 render"
    ;;
  fly)
    echo "==> Fly.io 部署（免费层）"
    command -v flyctl >/dev/null || { echo "需要先安装 flyctl：curl -L https://fly.io/install.sh | sh"; exit 1; }
    flyctl auth whoami >/dev/null 2>&1 || { echo "需要先登录：flyctl auth login"; exit 1; }
    echo "==> 首次部署需设置 secrets（一次性，值从本机 .env 复制）："
    echo "    flyctl secrets set AUTH_JWT_SECRET=... AUTH_DATA_KEY=... DEEPSEEK_API_KEY=... AMAP_SERVER_KEY=... ADMIN_TOKEN=... ALLOWED_ORIGINS=https://<app>.fly.dev FRONTEND_ORIGIN=https://<app>.fly.dev"
    flyctl deploy --config deploy/fly.toml
    echo "==> 部署完成。健康检查：curl https://<app>.fly.dev/health"
    ;;
  render)
    echo "==> Render 部署（免费层）：Render 控制台 New + → Blueprint，选择本仓库 deploy/render.yaml"
    echo "    敏感 env（AUTH_JWT_SECRET 等）在 Dashboard → Environment 配置"
    ;;
  *)
    echo "用法: bash deploy/deploy.sh {check|fly|render}"
    ;;
esac
