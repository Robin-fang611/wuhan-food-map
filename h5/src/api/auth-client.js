// 账号体系前端客户端（L3）：封装后端 :8799 的 6 个账号端点，纯 fetch、无 DOM、无 innerHTML。
// 安全红线：前端永不持有 JWT 密钥 / 微信 AppSecret / 短信密钥；只收发「登录态 token（JWT）」。
// token 仅存 localStorage 作为会话凭证；完整手机号永不从后端下发（隐私最小化）。

const CONFIG = globalThis.__MANYOUWEI_CONFIG__ || {};
const API = CONFIG.apiBase || 'http://127.0.0.1:8799';
const TOKEN_KEY = 'myw:auth:token';

const FETCH_TIMEOUT_MS = 15000;

async function postJSON(path, body = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return res.json().catch(() => null);
  } finally {
    clearTimeout(t);
  }
}
async function getJSON(path) {
  const res = await fetch(`${API}${path}`, { method: 'GET' });
  return res.json().catch(() => null);
}

// 图形验证码（人机验证）：返回 { token, svg }
export async function requestCaptcha() { return postJSON('/auth/captcha', {}); }

// 发送短信验证码：{ phone, captchaToken, captchaInput, scene }
export async function sendSmsCode(payload) { return postJSON('/auth/sms/send', payload); }

// 手机登录 / 注册：{ phone, smsCode, scene } -> { ok, token, user }
export async function loginWithPhone(payload) { return postJSON('/auth/login', payload); }

// 微信授权页 URL：GET /auth/wechat/url?state=
export async function requestWechatUrl(state) { return getJSON('/auth/wechat/url?state=' + encodeURIComponent(state || '')); }

// 凭 token 取当前用户：GET /auth/me（Authorization: Bearer）
export async function getMe(token) {
  const res = await fetch(`${API}/auth/me`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  return res.json().catch(() => null);
}

// —— W4 会话与账号管理 ——
export async function logout(token) {
  const res = await fetch(`${API}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  return res.json().catch(() => null);
}
export async function updateProfile(token, nickname) {
  const res = await fetch(`${API}/auth/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nickname }),
  });
  return res.json().catch(() => null);
}
export async function deleteAccount(token) {
  const res = await fetch(`${API}/auth/delete`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  return res.json().catch(() => null);
}

// token 本地存取（会话凭证，不含密钥）。
export function getStoredToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function setStoredToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
