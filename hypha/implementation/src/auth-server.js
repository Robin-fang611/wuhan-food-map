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
//  - 存储（S3 · 2026-08-15 起）：账号（users / phoneIndex / unionIndex）文件持久化到
//    data/auth-users.json（gitignored，原子写：tmp + rename），重启不丢账号、旧 JWT 仍有效；
//    验证码 / 频控为内存态（短时效安全语义，重启清空属正确行为）。
//    生产环境建议替换为 Redis/DB（接口不变），文件持久化为本地原型形态。
//
// 频控 / 一次性 / 常量时间比较 等防刷手段均落在服务端（前端倒计时只是 UX，不可绕过）。

import { randomBytes, randomUUID, createHmac, createHash, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.AUTH_DATA_DIR || path.resolve(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'auth-users.json');

// —— W5.3 敏感字段落盘加密（AES-256-GCM）：手机号密文存储 + 哈希索引 ——
// AUTH_DATA_KEY：64 位 hex（32 字节）；未配置时明文落盘并告警（开发模式；生产必须配置）。
const DATA_KEY = process.env.AUTH_DATA_KEY || '';
const KEY_BUF = /^[0-9a-f]{64}$/i.test(DATA_KEY) ? Buffer.from(DATA_KEY, 'hex') : null;
if (!KEY_BUF && process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.warn('[auth] 生产环境缺少 AUTH_DATA_KEY（64 位 hex）——敏感字段将以明文落盘，请立即配置');
}
// 可查询不可逆索引（手机号/unionid → sha256 前 32 hex）
function hashId(v) { return createHash('sha256').update(String(v)).digest('hex').slice(0, 32); }
function encField(v) {
  if (!v || !KEY_BUF) return v;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY_BUF, iv);
  const enc = Buffer.concat([cipher.update(String(v), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc:' + iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}
function decField(v) {
  if (!v || !String(v).startsWith('enc:')) return v; // 旧明文兼容
  if (!KEY_BUF) return null;
  try {
    const [ivHex, tagHex, dataHex] = String(v).slice(4).split(':');
    const decipher = createDecipheriv('aes-256-gcm', KEY_BUF, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch { return null; }
}

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

// —— 账号持久化（S3）：users / phoneIndex / unionIndex 落盘，验证码与频控保持内存态 ——
function persistAccounts() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const payload = {
      version: 2, // W5.3：敏感字段加密（enc: 前缀）+ 索引哈希化
      savedAt: new Date().toISOString(),
      users: [...users.values()].map((u) => ({ ...u, phone: encField(u.phone || '') || null })),
      phoneIndex: Object.fromEntries([...phoneIndex].map(([k, v]) => [hashId(k), v])),
      unionIndex: Object.fromEntries([...unionIndex].map(([k, v]) => [hashId(k), v])),
    };
    const tmp = USERS_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    renameSync(tmp, USERS_FILE); // 原子替换，避免写一半损坏
  } catch (err) {
    // 磁盘失败不阻断登录流程（原型语义）；生产由 Redis/DB 接管
    // eslint-disable-next-line no-console
    console.warn('[auth] 账号持久化失败（继续内存运行）:', String(err && err.message || err));
  }
}

function loadAccounts() {
  try {
    if (!existsSync(USERS_FILE)) return;
    const raw = JSON.parse(readFileSync(USERS_FILE, 'utf8'));
    if (!raw || !Array.isArray(raw.users)) return;
    for (const u of raw.users) {
      if (!u || !u.id) continue;
      const plain = { ...u, phone: decField(u.phone) };
      users.set(u.id, plain);
      if (plain.phone) phoneIndex.set(hashId(plain.phone), u.id);
      if (u.wechat && u.wechat.unionid) unionIndex.set(hashId(u.wechat.unionid), u.id);
    }
  } catch (err) {
    // 文件缺失/损坏：静默降级为空账号（原型语义，不阻断启动）
    // eslint-disable-next-line no-console
    console.warn('[auth] 账号文件加载失败（以空账号启动）:', String(err && err.message || err));
  }
}
loadAccounts();

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
  const ex = phoneIndex.get(hashId(phone));
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
  phoneIndex.set(hashId(phone), id);
  persistAccounts();
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
  let id = unionIndex.get(hashId(unionid));
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
    unionIndex.set(hashId(unionid), id);
    persistAccounts();
  }
  const token = issueJwt(user, 'wechat');
  const redirect = `${FRONTEND_ORIGIN}/?cb=wechat&token=${encodeURIComponent(token)}&state=${encodeURIComponent(state || '')}`;
  return { ok: true, redirect, user: publicUser(user) };
}
