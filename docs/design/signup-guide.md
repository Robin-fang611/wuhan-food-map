# 蛮有味 · 部署平台注册指引（Fly.io + Render 备选）

> **目标**：注册一个免费部署平台，把后端跑起来（前端 Vercel 稍后）。
> **推荐**：先注册 **Fly.io**（免费、无需信用卡、支持香港/新加坡区域、一键脚本已备）；**Render** 作为备选。
> **注册后**：回来告诉我「已注册」，我安装 CLI 并完成后续部署（创建 app / 配置密钥 / 部署 / 健康检查）。

---

## 方案一：Fly.io（推荐先试）

### 第 1 步：注册账号（约 3 分钟）
1. 打开 **https://fly.io/app/sign-up**
2. 点 **Continue with GitHub**（你有 GitHub 账号，项目就在 GitHub 上）——或填邮箱注册 + 邮件验证
3. 注册**免费**，**不需要信用卡**
4. 如果页面提示选组织/套餐：选默认 **Hobby / Free** 即可（个人免费档）

### 第 2 步：注册完成后，在你的终端执行以下命令块（约 5 分钟）

```bash
# 1) 安装 flyctl
curl -L https://fly.io/install.sh | sh

# 2) 登录（浏览器弹出后点 Allow）
~/.fly/bin/flyctl auth login

# 3) 进项目目录并创建 app（香港区域，免备案）
cd ~/One\ Billion/当前项目/美食地图/wuhan-food-map
~/.fly/bin/flyctl apps create manyouwei-wuhan --region hkg

# 4) 配置密钥（自动从 .env 读取，不会打印）
~/.fly/bin/flyctl secrets set \
  AUTH_JWT_SECRET="$(grep '^AUTH_JWT_SECRET=' .env | cut -d= -f2-)" \
  AUTH_DATA_KEY="$(grep '^AUTH_DATA_KEY=' .env | cut -d= -f2-)" \
  DEEPSEEK_API_KEY="$(grep '^DEEPSEEK_API_KEY=' .env | cut -d= -f2-)" \
  AMAP_SERVER_KEY="$(grep '^AMAP_SERVER_KEY=' .env | cut -d= -f2-)" \
  ADMIN_TOKEN="$(grep '^ADMIN_TOKEN=' .env | cut -d= -f2-)" \
  ALLOWED_ORIGINS="https://manyouwei-wuhan.fly.dev" \
  FRONTEND_ORIGIN="https://manyouwei-wuhan.fly.dev"

# 5) 部署（Fly 远程构建 Dockerfile，本机无需 Docker）
~/.fly/bin/flyctl deploy

# 6) 健康检查
curl -s -X POST https://manyouwei-wuhan.fly.dev/health -d '{}' -H 'content-type: application/json'
```

> 如果 apps create manyouwei-wuhan 提示名字被占用，换一个（如 manyouwei-wuhan-2026），并把 ALLOWED_ORIGINS 同步改。
> ⚠️ flyctl auth login 会弹出浏览器授权页，点 Allow 即可。

## 方案二：Render（备选）

### 第 1 步：注册账号（约 3 分钟）
1. 打开 **https://dashboard.render.com/register**
2. 点 **Continue with GitHub**（推荐）或邮箱注册
3. 免费账号即可；**免费 Web Service 不需要信用卡**
4. 区域选 **Singapore（新加坡）**（对国内访问延迟最友好）

### 第 2 步：告诉我「Render 已注册」
我用你的仓库走 Blueprint（`deploy/render.yaml`）一键创建服务，或你在 Dashboard 里 New + → Blueprint 选择本仓库。

---

## 方案三：Vercel（前端，免费，随时可发）

前端静态托管已配好（`vercel.json`），注册 **https://vercel.com/signup**（GitHub 登录）后告诉我，我执行：
```bash
npm i -g vercel && vercel login && vercel --prod
```
（同样需要你在浏览器授权一次）

---

## 注册后我需要你提供的信息（3 选 1）

| 你说 | 我做什么 |
|------|----------|
| 「Fly 已注册」 | 安装 flyctl → 你授权 → 创建 app（hkg 区域）→ secrets（从 .env 复制）→ deploy → 健康检查 |
| 「Render 已注册」 | 指引 Blueprint 部署 → secrets 配置 → 健康检查 |
| 「Vercel 已注册」 | 前端上线 → 给你可分享链接 |

## 常见问题

- **需要信用卡吗**：三个平台免费档都不需要。
- **国内能访问吗**：Fly 香港/法兰克福、Render 新加坡对国内延迟 100-300ms（Demo 够用）；后续要更快再迁国内服务器。
- **会不会产生费用**：免费档额度内 0 元；Fly 免费 3 台共享实例（我们只起 1 台）、Render 750h/月（1 个实例常开够用）。
- **忘记密码/换账号**：随时可换平台，配置都已备好。

---
*本指引配合 docs/design/ops-runbook.md 使用；注册完成即进入 W7 部署。*
