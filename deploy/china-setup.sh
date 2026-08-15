#!/bin/bash
# 蛮有味 · 国内服务器一键部署（免备案：IP+非标准端口）
# 用法（服务器 Ubuntu/Debian）：
#   git clone https://github.com/Robin-fang611/wuhan-food-map.git /opt/manyouwei && cd /opt/manyouwei
#   bash deploy/china-setup.sh
# 效果：后端 :8799 + 前端静态 :8080（均非 80/443 → 免备案）
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "你的公网IP")
echo "==> 蛮有味国内部署（IP: $IP）"

echo "==> 1/5 安装 Node 22（国内镜像）"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://npmmirror.com/mirrors/node/v22.11.0/node-v22.11.0-linux-x64.tar.xz -o /tmp/node.tar.xz || {
    echo "镜像下载失败，改用 nodesource（备用）";
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs;
  }
  [ -f /tmp/node.tar.xz ] && { mkdir -p /usr/local/lib/nodejs && tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs --strip-components=1 && ln -sf /usr/local/lib/nodejs/bin/* /usr/local/bin/; rm -f /tmp/node.tar.xz; }
fi
node --version || (echo "Node 安装失败，请手动安装"; exit 1)

echo "==> 2/5 安装 pm2"
npm i -g pm2 --registry=https://registry.npmmirror.com 2>/dev/null || npm i -g pm2

echo "==> 3/5 准备 .env（从 .env.example 复制，请先补齐密钥）"
[ -f "$ROOT/.env" ] || { cp "$ROOT/.env.example" "$ROOT/.env"; echo "  ⚠️ 请编辑 $ROOT/.env 补齐 AUTH_JWT_SECRET / AUTH_DATA_KEY / DEEPSEEK_API_KEY / AMAP_SERVER_KEY / ADMIN_TOKEN"; }

echo "==> 4/5 构建前端 + 启动后端"
cd "$ROOT"
pm2 start deploy/ecosystem.config.cjs 2>/dev/null || pm2 start deploy/ecosystem.config.cjs --update-env
pm2 save

echo "==> 5/5 前端静态服务（:8080，免备案端口）"
if ! command -v nginx >/dev/null 2>&1; then apt-get install -y nginx >/dev/null 2>&1 || true; fi
mkdir -p /var/www/manyouwei
cp -r "$ROOT/h5/dist"/* /var/www/manyouwei/ 2>/dev/null || { cd "$ROOT/h5" && npm i --registry=https://registry.npmmirror.com 2>/dev/null; npm run build; cp -r dist/* /var/www/manyouwei/; }
cat > /etc/nginx/sites-available/manyouwei << EOF
server {
  listen 8080;
  root /var/www/manyouwei;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
  location /api/ { proxy_pass http://127.0.0.1:8799/; proxy_set_header Host $host; }
}
EOF
ln -sf /etc/nginx/sites-available/manyouwei /etc/nginx/sites-enabled/ 2>/dev/null || true
nginx -t && (systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true)

echo "=============================================="
echo "✅ 部署完成！访问：http://$IP:8080"
echo "   后端健康检查：curl http://$IP:8799/health -X POST -d {} -H content-type:application/json"
echo "   注意：服务器安全组/防火墙需放行 8080 与 8799 端口"
echo "=============================================="
