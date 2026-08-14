#!/bin/bash
# 蛮有味·本地开发一键启动
# 用法: 在终端执行  bash start-dev.sh   （或 chmod +x 后 ./start-dev.sh）
# 启动: h5 前端预览 :5180  +  :8799 推荐/记忆后端(fallback 无 Key 模式)
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE="$HOME/.workbuddy/binaries/node/versions/22.22.2/bin/node"
VITE="$ROOT/h5/node_modules/vite/bin/vite.js"

echo "==> 构建 h5 (dist)"
( cd "$ROOT/h5" && "$NODE" "$VITE" build >/tmp/myw-build.log 2>&1 ) && echo "    build OK" || { echo "    build 失败,看 /tmp/myw-build.log"; exit 1; }

start() {  # name port workdir cmd...
  local name="$1" port="$2" workdir="$3"; shift 3
  if lsof -iTCP:"$port" -sTCP:LISTEN -P -n >/dev/null 2>&1; then
    echo "==> $name 已在 :$port 监听,跳过"
  else
    echo "==> 启动 $name :$port"
    ( cd "$workdir" && "$@" >"/tmp/myw-$name.log" 2>&1 & )
    echo "    started (log /tmp/myw-$name.log)"
  fi
}

# preview 必须在 h5/ 下运行（vite preview 默认找 cwd/dist）
start preview 5180 "$ROOT/h5" "$NODE" "$VITE" preview --port 5180 --host 127.0.0.1
# 后端默认接真实武汉数据集（wuhan 数据源：590 真实商户，两类分区）。
# 仅想跑演示合成数据时可临时：MYWO_DATASOURCE=sample bash start-dev.sh
start backend 8799 "$ROOT" env MYWO_PORT=8799 MYWO_DATASOURCE=wuhan "$NODE" --env-file="$ROOT/.env" "$ROOT/hypha/implementation/src/httpServer.js"

sleep 2
echo "==> 健康检查:"
curl -s -o /dev/null -w "    前端 :5180 -> %{http_code}\n" -m 5 http://127.0.0.1:5180/ || true
curl -s -m 6 -X POST http://127.0.0.1:8799/health -H 'content-type: application/json' -d '{}' | head -c 120; echo
echo "==> 打开 http://127.0.0.1:5180"
