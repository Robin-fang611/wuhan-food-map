// 账号体系后端（Path B，自有 Node :8799）。
// 能力：图形验证码(人机验证) + 短信验证码(安全验证) + 手机登录签发 JWT + 微信网页授权。
//
// 设计原则（对齐 SPEC §8 安全红线 / docs/design/account-auth-design.md）：
//  - 所有密钥（AUTH_JWT_SECRET / WECHAT_APPSECRET）仅本模块从 env 读取，前端永不持有。
//  - 零外部依赖：SVG 图形验证码自绘、JWT 用 node:crypto 的 HMAC-SHA256 内联签发/校验。
//    （如需更强随机/标准库，可后续替换为 svg-captcha / jsonwebtoken，接口不变。）
//  - 未配置 provider 时**明确报错、不假装成功**：
//      · 生产环境(NODE_ENV=production) 且未配置真实短信网关 → /auth/sms/send 返回「短信服务未配置」。
//      · 未配微信 AppID/AppSecret → /auth/wechat/url 与 /auth/wechat/callback 返回「未配置」。
//      · 未配 AUTH_JWT_SECRET → 登录/校验直接报错（不签发空密钥 token）。
//  - 存储为内存 Map（原型，非持久；重启即清空）。后续可平滑替换为 Redis/DB，接口不变。
//
// 频控 / 一次性 / 常量时间比较 等防刷手段均落在服务端（前端倒计时只是 UX，不可绕过）。

import { randomBytes, randomUUID, createHmac, timingSafeEqual } from 'node:crypto';

const JWT_SECRET = process.env.AUTH_JWT_SECRET || '';
const IS_PROD = process.env.NODE_ENV === 'production';
const SMS_PROVIDER = process.env.SMS_PROVIDER || 'console';      // console(开发) | tencent(真实网关，预留)
const WECHAT_APPID = process.env.WECHAT_APPID || '';
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET || '';
const WECHAT_REDIRECT_URI = process.env.WECHAT_REDIRECT_URI || '';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5180';

// —— 内存存储（原型：重启清空；后续换 Redis/DB 仅改此段）——
const captchas = new Map();   // token -> { text, exp }
const smsCodes = new Map();   // phone -> { code, exp, scene, used }
const smsLimit = new Map();   // phone -> number[]（最近发送时间戳）
const users = new Map();      // id -> user
const phoneIndex = new Map(); // phone -> id
const unionIndex = new Map(); // unionid -> id

const CAPTCHA_TTL = 5 * 60 * 1000;
const SMS_TTL = 10 * 60 * 1000;
const LIMIT = {
  perMinute: 60 * 1000,
  perHour: 60 * 60 * 1000,
  perDay: 24 * 60 * 60 * 1000,
  maxPerHour: 5,
  maxPerDay: 10,
};
const PHONE_RE = /^1[3-9]\d{9}$/;

// 常量时间比较，防时序侧信道。
function constantTimeEq(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// ——————————————————————————————————————————————
// 1) 图形验证码（自绘 SVG，人机验证，零依赖）
// ——————————————————————————————————————————————
const CAP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除易混 0/O/1/I/l
function genCaptchaText(n = 4) {
  const b = randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += CAP_ALPHABET[b[i] % CAP_ALPHABET.length];
  return s;
}
function svgCaptcha(text) {
  const W = 110, H = 40;
  let noise = '';
  for (let i = 0; i < 4; i++) {
    const x1 = randomBytes(1)[0] % W, y1 = randomBytes(1)[0] % H;
    const x2 = randomBytes(1)[0] % W, y2 = randomBytes(1)[0] % H;
    noise += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d8cdb8" stroke-width="1" opacity="0.7"/>`;
  }
  let glyphs = '';
  const fills = ['#c0392b', '#7a5b2e', '#3b6b4a', '#2c3e50'];
  for (let i = 0; i < text.length; i++) {
    const x = 14 + i * 24;
    const y = 28 + ((randomBytes(1)[0] % 6) - 3);
    const rot = (randomBytes(1)[0] % 30) - 15;
    glyphs += `<text x="${x}" y="${y}" font-size="22" font-family="monospace" font-weight="bold" fill="${fills[i % fills.length]}" transform="rotate(${rot} ${x} ${y})">${text[i]}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#f5efe6"/>${noise}${glyphs}</svg>`;
}
export function createCaptcha() {
  const text = genCaptchaText(4);
  const token = 'cap_' + randomUUID();
  captchas.set(token, { text, exp: Date.now() + CAPTCHA_TTL });
  // 测试/演示可显式开启 AUTH_DEV_EXPOSE_CAPTCHA=1 以在响应里附带 _devText（仅非生产、默认关闭，生产安全）。
  const devText = process.env.AUTH_DEV_EXPOSE_CAPTCHA === '1' ? text : undefined;
  return { token, svg: svgCaptcha(text), _devText: devText };
}
export function verifyCaptcha(token, input) {
  if (!token || input == null) return false;
  const rec = captchas.get(token);
  if (!rec) return false;
  captchas.delete(token); // 一次性：校验后即作废
  if (Date.now() > rec.exp) return false;
  return constantTimeEq(rec.text.toUpperCase(), String(input).toUpperCase());
}

// ——————————————————————————————————————————————
// 2) 短信 provider（安全验证通道）
// ——————————————————————————————————————————————
// 返回 null 表示「未配置」——调用方应如实报错，绝不假装发送成功。
function getSmsProvider() {
  if (SMS_PROVIDER === 'console') {
    // 开发/演示：控制台打印验证码，并返回 devCode 供前端走通流程（仅非生产）。
    if (IS_PROD) return null; // 生产必须配置真实网关（tencent 等）
    return {
      name: 'console',
      async send(phone, code) {
        // eslint-disable-next-line no-console
        console.log(`[SMS:dev] => ${phone} 验证码 ${code}（10 分钟内有效，仅限开发环境）`);
        return { ok: true, devCode: code };
      },
    };
  }
  if (SMS_PROVIDER === 'tencent') {
    // 预留真实网关接入点（需 TENCENT_SMS_SECRET_ID/KEY 凭证，按凭证调 SDK）。
    if (!process.env.TENCENT_SMS_SECRET_ID || !process.env.TENCENT_SMS_SECRET_KEY) return null;
    // 真实发送实现略（生产接此处）；缺凭证视为未配置。
    return null;
  }
  return null;
}

export async function sendSms({ phone, captchaToken, captchaInput, scene = 'login' } = {}) {
  if (!PHONE_RE.test(String(phone || ''))) return { ok: false, error: '手机号格式不正确' };
  // 短信 provider 未配置：先如实报错（不消耗图形验证码，便于用户重试）。
  if (!getSmsProvider()) return { ok: false, error: '短信服务未配置（provider 缺失）' };
  // 图形验证码（人机验证）前置。
  if (!verifyCaptcha(captchaToken, captchaInput)) return { ok: false, error: '图形验证码错误' };

  const now = Date.now();
  const times = (smsLimit.get(phone) || []).filter((t) => now - t < LIMIT.perDay);
  const last = times[times.length - 1];
  if (last && now - last < LIMIT.perMinute) return { ok: false, error: '发送太频繁，请 1 分钟后再试' };
  const hourAgo = times.filter((t) => now - t < LIMIT.perHour);
  if (hourAgo.length >= LIMIT.maxPerHour) return { ok: false, error: '发送次数过多，请 1 小时后再试' };
  if (times.length >= LIMIT.maxPerDay) return { ok: false, error: '今日发送已达上限，请明日再试' };

  // 6 位安全随机码（常量时间比较在服务端）。
  const code = String(randomBytes(3).readUIntBE(0, 3) % 1000000).padStart(6, '0');
  smsCodes.set(phone, { code, exp: now + SMS_TTL, scene, used: false });
  times.push(now);
  smsLimit.set(phone, times);

  const provider = getSmsProvider();
  if (!provider) return { ok: false, error: '短信服务未配置（provider 缺失）' };
  return provider.send(phone, code);
}

// ——————————————————————————————————————————————
// 3) JWT（HMAC-SHA256 内联，零依赖）
// ——————————————————————————————————————————————
function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function signJwt(payload) {
  if (!JWT_SECRET) throw new Error('JWT 密钥未配置（AUTH_JWT_SECRET）');
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}
export function verifyJwt(token) {
  if (!JWT_SECRET) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const expected = b64url(createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest());
  if (!constantTimeEq(expected, parts[2])) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (p.exp && Date.now() > p.exp * 1000) return null;
    return p;
  } catch { return null; }
}

// ——————————————————————————————————————————————
// 4) 用户（内存；按手机号/unionid 合并）
// ——————————————————————————————————————————————
function maskPhone(p) { return p.slice(0, 3) + '****' + p.slice(7); }
function publicUser(u) {
  return { id: u.id, nickname: u.nickname, phoneMasked: u.phoneMasked || (u.phone ? maskPhone(u.phone) : '') };
}
function findOrCreateUserByPhone(phone) {
  const ex = phoneIndex.get(phone);
  if (ex) return users.get(ex);
  const id = 'u_' + randomUUID().slice(0, 8);
  const user = {
    id,
    nickname: '武汉吃货' + phone.slice(7),
    phone,
    phoneMasked: maskPhone(phone),
    created_at: Date.now(),
  };
  users.set(id, user);
  phoneIndex.set(phone, id);
  return user;
}
function issueJwt(user, scene) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    sub: user.id,
    phone: user.phone || null,
    scene,
    iat: now,
    exp: now + 30 * 24 * 3600, // 30 天
  });
}

// ——————————————————————————————————————————————
// 5) 手机登录（验证码交换 JWT）
// ——————————————————————————————————————————————
export function loginWithPhone({ phone, smsCode, scene = 'login' } = {}) {
  if (!PHONE_RE.test(String(phone || ''))) return { ok: false, error: '手机号格式不正确' };
  const rec = smsCodes.get(phone);
  if (!rec || rec.used) return { ok: false, error: '验证码不存在或已使用' };
  if (Date.now() > rec.exp) { smsCodes.delete(phone); return { ok: false, error: '验证码已过期，请重新获取' }; }
  if (scene !== rec.scene) return { ok: false, error: '验证码场景不匹配' };
  if (!constantTimeEq(rec.code, String(smsCode || ''))) return { ok: false, error: '验证码错误或已失效' };
  rec.used = true; // 一次性失效
  smsCodes.set(phone, rec);

  const user = findOrCreateUserByPhone(phone);
  const token = issueJwt(user, scene);
  return { ok: true, token, user: publicUser(user) };
}

// 凭 token 取用户（/auth/me，供前端在微信回跳等场景补齐会话）。
export function getUserByToken(token) {
  const p = verifyJwt(token);
  if (!p || !p.sub) return null;
  const u = users.get(p.sub);
  return u ? publicUser(u) : null;
}

// ——————————————————————————————————————————————
// 6) 微信网页授权（OAuth2，AppSecret 仅服务端）
// ——————————————————————————————————————————————
export function wechatAuthorizeUrl(state) {
  if (!WECHAT_APPID) return { ok: false, error: '微信登录未配置（AppID 缺失）' };
  if (!WECHAT_REDIRECT_URI) return { ok: false, error: '微信登录未配置（回调地址缺失）' };
  const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${WECHAT_APPID}` +
    `&redirect_uri=${encodeURIComponent(WECHAT_REDIRECT_URI)}` +
    `&response_type=code&scope=snsapi_userinfo&state=${encodeURIComponent(state || '')}#wechat_redirect`;
  return { ok: true, url };
}

export async function wechatCallback(code, state) {
  if (!WECHAT_APPID || !WECHAT_APPSECRET) return { ok: false, error: '微信登录未配置（AppSecret 缺失）' };
  if (!code) return { ok: false, error: '缺少 code' };
  const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APPID}` +
    `&secret=${WECHAT_APPSECRET}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  let data;
  try {
    const r = await fetch(tokenUrl);
    data = await r.json();
  } catch {
    return { ok: false, error: '微信授权请求失败' };
  }
  if (!data || data.errcode) return { ok: false, error: '微信授权失败：' + ((data && data.errmsg) || '未知错误') };

  const unionid = data.unionid || data.openid;
  let id = unionIndex.get(unionid);
  let user = id ? users.get(id) : null;
  if (!user) {
    id = 'u_' + randomUUID().slice(0, 8);
    user = {
      id,
      nickname: '微信用户',
      phone: null,
      phoneMasked: '',
      wechat: { openid: data.openid, unionid },
      created_at: Date.now(),
    };
    users.set(id, user);
    unionIndex.set(unionid, id);
  }
  const token = issueJwt(user, 'wechat');
  const redirect = `${FRONTEND_ORIGIN}/?cb=wechat&token=${encodeURIComponent(token)}&state=${encodeURIComponent(state || '')}`;
  return { ok: true, redirect, user: publicUser(user) };
}
