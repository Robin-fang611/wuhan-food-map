# 蛮有味 · 上线运行手册（ops-runbook）

> **用途**：Robin 提供服务器（R1）/域名（R2）后，按本手册从零部署到可访问。
> **前置**：.env 已补齐生产项（见 §0 检查清单）；本手册命令均在服务器或本地执行。
> 关联：docs/design/go-live-roadmap.md W7、docs/design/launch-audit-local.md。

## 0. 生产 .env 检查清单（上线前必须）

| 变量 | 用途 | 备注 |
|------|------|------|
| AUTH_JWT_SECRET | JWT 签发密钥 | 长随机串（openssl rand -hex 32） |
| AUTH_DATA_KEY | 手机号加密密钥 | 64 位 hex（openssl rand -hex 32） |
| DEEPSEEK_API_KEY | LLM（双轨升级） | 已有 |
| AMAP_SERVER_KEY | 探店采集/高德校验 | 已有 |
| ADMIN_TOKEN | 治理接口令牌 | 长随机串 |
| ALLOWED_ORIGINS | CORS 白名单 | 生产前端域名（逗号分隔） |
| FRONTEND_ORIGIN | 微信回调/跳转 | 生产前端 URL |
| SMS_PROVIDER / TENCENT_SMS_SECRET_ID / TENCENT_SMS_SECRET_KEY | 短信网关 | 腾讯云 SMS + 签名模板备案 |
| WECHAT_APPID / WECHAT_APPSECRET / WECHAT_REDIRECT_URI | 微信登录 | 开放平台 |
| NODE_ENV=production | 错误脱敏/真实校验 | 部署时设置 |

验证：`node scripts/deploy-check.mjs` 全绿。

## 1. 服务器初始化（Ubuntu/Debian 示例）

```bash
# 系统依赖
sudo apt update && sudo apt install -y nodejs npm nginx
# Node 22（若系统包过旧）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs

# 拉代码（或 rsync 本地仓库）
git clone https://github.com/Robin-fang611/wuhan-food-map.git /opt/manyouwei
cd /opt/manyouwei

# 依赖与构建
cd h5 && npm ci && npm run build && cd ..

# .env：把本地 .env 拷到服务器并补齐生产项
# （scp .env user@server:/opt/manyouwei/.env；chmod 600 .env）
```

## 2. 后端（pm2）

```bash
sudo npm install -g pm2
cd /opt/manyouwei
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup   # 开机自启
pm2 logs manyouwei-backend   # 查看日志（含 LLM 成本 / 错误日志在 data/）
```

- 数据目录 `hypha/implementation/data/`（账号/收藏/券/上传/日志）——**定期备份**：`node scripts/backup-data.mjs`（cron 建议每日）。
- 端口：8799（默认）；nginx 反代到 443。

## 3. 前端静态托管 + 反向代理（nginx）

```nginx
# /etc/nginx/sites-available/manyouwei
server {
  listen 80;
  server_name your-domain.com;
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl;
  server_name your-domain.com;
  # ssl_certificate / ssl_certificate_key;  # 证书（Let's Encrypt: certbot --nginx）

  # 前端 SPA（h5/dist）
  root /opt/manyouwei/h5/dist;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }

  # 后端 API
  location /api/ {
    proxy_pass http://127.0.0.1:8799/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

> 注意：若前端直接用域名（非 /api 前缀），需重建前端并设 `VITE_API_BASE=https://your-domain.com/api`（h5/.env 构建期），或按上面前端 + /api 反代即可零改动。

## 4. 上线验证（D1–D10）

```bash
# 本地仓库执行（连服务器状态检查）
node scripts/deploy-check.mjs
cd hypha/implementation && node verify-loop.mjs   # 12 套单测 + 安全回归

# 服务器上
curl -s https://your-domain.com/ -o /dev/null -w '%{http_code}'          # 前端 200
curl -s -X POST https://your-domain.com/api/health -d '{}' -H 'content-type: application/json'  # 后端 ok
```

然后按 docs/design/launch-audit-local.md 剩余项（真机/短信/微信）逐项验收。

## 5. 日常运维

| 操作 | 命令 |
|------|------|
| 重启后端 | pm2 restart manyouwei-backend |
| 看错误 | tail -f hypha/implementation/data/error.log |
| 看 LLM 成本 | tail -f hypha/implementation/data/llm-cost.log |
| 备份数据 | node scripts/backup-data.mjs（建议 cron 每日） |
| 升级代码 | git pull && cd h5 && npm run build && pm2 restart manyouwei-backend |
| 治理上传 | node scripts/govern-uploads.mjs list / promote / reject |

## 6. 回滚

- 代码：git 历史回退 + rebuild + pm2 restart。
- 数据：backups/data-<时间戳>/ 恢复（stop → 替换 data/ → start）。

*本手册随 W7 实施更新；服务器到位后按 §1→§4 执行即可。*
