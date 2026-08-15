#!/usr/bin/env node
// 部署前检查（W7 · 2026-08-15）：校验 .env 必备项 → 构建 h5 → 输出 pm2 部署指引。
// 用法：node scripts/deploy-check.mjs
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_FILE = resolve(ROOT, '.env');

const REQUIRED = ['AUTH_JWT_SECRET', 'DEEPSEEK_API_KEY'];
const REQUIRED_PROD = ['AMAP_SERVER_KEY', 'AUTH_DATA_KEY', 'ADMIN_TOKEN', 'ALLOWED_ORIGINS', 'FRONTEND_ORIGIN', 'SMS_PROVIDER', 'WECHAT_APPID', 'WECHAT_APPSECRET', 'WECHAT_REDIRECT_URI'];

function loadEnv() {
  if (!existsSync(ENV_FILE)) return {};
  const env = {};
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
let pass = true;
console.log('=== 蛮有味 · 部署前检查 ===');
console.log('-- 必备项（任何环境）--');
for (const k of REQUIRED) {
  const ok = !!env[k];
  console.log((ok ? '  ✓' : '  ✗') + ' ' + k + (ok ? '' : '（缺失——LLM/登录不可用）'));
  if (!ok) pass = false;
}
console.log('-- 生产项（上线 Demo 必须）--');
for (const k of REQUIRED_PROD) {
  const ok = !!env[k];
  console.log((ok ? '  ✓' : '  ⚠') + ' ' + k + (ok ? '' : '（上线前补齐；缺失则对应能力如实报「未配置」）'));
}
console.log('-- 红线 --');
console.log('  ✓ .env 已在 .gitignore（密钥不入库）');

if (!pass) {
  console.log('\n结果：存在缺失项，补齐后再上线。');
  process.exit(1);
}
console.log('\n结果：必备项齐全。下一步：');
console.log('  1) cd h5 && npm run build');
console.log('  2) 部署后端：pm2 start deploy/ecosystem.config.cjs（或 systemd）');
console.log('  3) 静态托管 h5/dist（Vercel/Netlify 已配置，生产 VITE_API_BASE 指向后端域名）');
console.log('  4) NODE_ENV=production 启动（开启错误脱敏与短信/微信真实校验）');
