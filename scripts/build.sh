#!/bin/bash
# ============================================
# 江城 · 味觉地图 — 构建脚本
# 用法：./scripts/build.sh
# 依赖：node + esbuild（可选，未安装时只合并不压缩）
# ============================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
PAGES=(campus wuhan play)

echo "→ 清理 dist/"
rm -rf "$DIST" && mkdir -p "$DIST/css/pages" "$DIST/js/pages"

# ========================
# 1. CSS 构建
# ========================
echo "→ 构建 CSS..."
for page in "${PAGES[@]}"; do
  cat "$ROOT/css/common.css" \
      "$ROOT/css/components.css" \
      "$ROOT/css/pages/$page.css" \
    > "$DIST/css/$page.css.tmp"

  # 去重（移除连续相同的 selector），然后可选压缩
  if command -v csso &>/dev/null; then
    npx csso "$DIST/css/$page.css.tmp" "$DIST/css/$page.css"
    rm "$DIST/css/$page.css.tmp"
  elif command -v uglifycss &>/dev/null; then
    uglifycss "$DIST/css/$page.css.tmp" > "$DIST/css/$page.css"
    rm "$DIST/css/$page.css.tmp"
  else
    mv "$DIST/css/$page.css.tmp" "$DIST/css/$page.css"
    echo "  提示：安装 csso (npm i -g csso) 可启用 CSS 压缩"
  fi
  echo "  ✓ $page.css ($(wc -c < "$DIST/css/$page.css") bytes)"
done

# ========================
# 2. JS 构建
# ========================
echo "→ 构建 JS..."

# ES Modules — 用 esbuild 打包每个页面入口
if command -v esbuild &>/dev/null || npx --yes esbuild --version &>/dev/null 2>&1; then
  for page in "${PAGES[@]}"; do
    npx esbuild "$ROOT/js/pages/$page.js" \
      --bundle \
      --minify \
      --format=esm \
      --outfile="$DIST/js/pages/$page.js" \
      --target=es2020 \
      --external:https://webapi.amap.com/loader.js
    echo "  ✓ $page.js (esbuild bundled, $(wc -c < "$DIST/js/pages/$page.js") bytes)"
  done

  # Core JS 独立
  npx esbuild "$ROOT/js/analytics.js" \
    --bundle \
    --minify \
    --format=iife \
    --outfile="$DIST/js/analytics.js"
  echo "  ✓ analytics.js"
else
  echo "  提示：安装 esbuild (npm i -g esbuild) 可启用 JS 打包+压缩"
  echo "  使用原生 ES Modules（直接复制）"
  # 复制必需模块
  mkdir -p "$DIST/js/core" "$DIST/js/components"
  cp "$ROOT/js/analytics.js" "$DIST/js/analytics.js"
  cp "$ROOT/js/core/utils.js" "$DIST/js/core/utils.js"
  cp "$ROOT/js/core/dom.js" "$DIST/js/core/dom.js"
  cp "$ROOT/js/core/store.js" "$DIST/js/core/store.js"
  cp "$ROOT/js/core/ui.js" "$DIST/js/core/ui.js"
  cp "$ROOT/js/core/map.js" "$DIST/js/core/map.js"
  cp "$ROOT/js/components/"*.js "$DIST/js/components/"
  cp "$ROOT/js/pages/"*.js "$DIST/js/pages/"
fi

# ========================
# 3. 复制静态资源
# ========================
echo "→ 复制静态资源..."
cp "$ROOT/js/config.js" "$DIST/js/config.js"
mkdir -p "$DIST/data" && cp "$ROOT"/data/*.js "$DIST/data/"
# 复制其他静态资源（CSS、图片等）
cp -r "$ROOT/images" "$DIST/images" 2>/dev/null || true
cp "$ROOT/css/baibaoxiang.css" "$DIST/css/" 2>/dev/null || true
cp "$ROOT/index.html" "$DIST/" 2>/dev/null || true

# ========================
# 4. 生成 HTML（替换 CSS/JS 路径）
# ========================
echo "→ 生成 HTML..."
for page in "${PAGES[@]}"; do
  # 从页面获取其他 HTML (索引页等)
  if [ -f "$ROOT/$page.html" ]; then
    sed "s|css/common.css|css/$page.css|g; s|css/components.css||g; s|css/pages/$page.css||g" "$ROOT/$page.html" \
      | sed "s|type=\"module\" src=\"js/pages/$page.js\"|src=\"js/pages/$page.js\"|g" \
      > "$DIST/$page.html"
  fi
done

# 复制其他 HTML（校园信息页等，保留原有引用）
for f in "$ROOT"/*.html; do
  name="$(basename "$f")"
  if [[ ! " ${PAGES[*]} " =~ " ${name%.html} " ]] && [ "$name" != "index.html" ]; then
    cp "$f" "$DIST/$name"
  fi
done

echo ""
echo "✓ 构建完成 → $DIST"
echo "  总大小: $(du -sh "$DIST" | cut -f1)"
echo ""
echo "部署：将 dist/ 目录上传到 Netlify"
echo "  npx netlify deploy --dir=dist --prod"
