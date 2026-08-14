// 账号体系后端单测（S3 · 2026-08-15 补齐 + 持久化验证）
// 覆盖：图形验证码（一次性/错误）→ 短信验证码（格式/前置/频控/成功）→ 登录（JWT/脱敏/一次性码）
//       → /me（凭 token 取用户）→ 负路径 → **文件持久化 + 重启后旧 token 仍有效（子进程模拟）**
// 运行：node --test hypha/implementation/test/auth.test.mjs（或全量套件）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 必须在 import auth-server 前设好 env（模块初始化读取）
const DATA_DIR = mkdtempSync(join(tmpdir(), 'mywo-auth-'));
process.env.AUTH_JWT_SECRET = 's3-test-secret-please-change';
process.env.AUTH_DEV_EXPOSE_CAPTCHA = '1';
process.env.AUTH_DATA_DIR = DATA_DIR;

const auth = await import('../src/auth-server.js');
const AUTH_FILE = join(DATA_DIR, 'auth-users.json');
const AUTH_MODULE = fileURLToPath(new URL('../src/auth-server.js', import.meta.url));

// —— 子进程助手：全新进程 = 全新模块 = 模拟「重启」 ——
function runChild(script, extraEnv = {}) {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: {
      ...process.env,
      AUTH_DATA_DIR: DATA_DIR,
      AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET,
      AUTH_DEV_EXPOSE_CAPTCHA: '1',
      ...extraEnv,
    },
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').pop());
}

test('图形验证码：签发 SVG + 一次性 + 错误拒绝', () => {
  const c = auth.createCaptcha();
  assert.ok(c.token.startsWith('cap_'));
  assert.ok(c.svg.includes('<svg'));
  assert.equal(c._devText.length, 4);
  // 一次性：正确校验一次后作废
  assert.equal(auth.verifyCaptcha(c.token, c._devText), true);
  assert.equal(auth.verifyCaptcha(c.token, c._devText), false);
  // 错误输入：拒绝
  const c2 = auth.createCaptcha();
  assert.equal(auth.verifyCaptcha(c2.token, 'WRONG'), false);
});

test('短信验证码：格式/图形前置/频控/成功', async () => {
  // 手机号格式
  const bad = await auth.sendSms({ phone: '12345', captchaToken: 'x', captchaInput: 'x' });
  assert.equal(bad.ok, false);
  assert.ok(bad.error.includes('手机号格式'));
  // 未过图形验证
  const noCap = await auth.sendSms({ phone: '13800000001', captchaToken: 'cap_none', captchaInput: 'NOPE' });
  assert.equal(noCap.ok, false);
  assert.ok(noCap.error.includes('图形验证码'));
  // 成功（console provider 返回 devCode）
  const cap = auth.createCaptcha();
  const sms = await auth.sendSms({ phone: '13800000001', captchaToken: cap.token, captchaInput: cap._devText });
  assert.equal(sms.ok, true);
  assert.equal(sms.devCode.length, 6);
  // 频控：同号 1 分钟内第二次
  const cap2 = auth.createCaptcha();
  const again = await auth.sendSms({ phone: '13800000001', captchaToken: cap2.token, captchaInput: cap2._devText });
  assert.equal(again.ok, false);
  assert.ok(again.error.includes('1 分钟'));
});

test('手机登录：JWT + 脱敏 + 一次性码 + /me', async () => {
  // 无验证码
  const noCode = auth.loginWithPhone({ phone: '13800000002', smsCode: '' });
  assert.equal(noCode.ok, false);
  assert.ok(noCode.error.includes('验证码不存在'));
  // 正确流程
  const cap = auth.createCaptcha();
  const sms = await auth.sendSms({ phone: '13800000002', captchaToken: cap.token, captchaInput: cap._devText });
  const login = auth.loginWithPhone({ phone: '13800000002', smsCode: sms.devCode });
  assert.equal(login.ok, true);
  assert.ok(login.token.split('.').length === 3);
  assert.equal(login.user.phoneMasked.length > 4, true);
  assert.equal(login.user.phone, undefined, '完整手机号永不下发前端');
  assert.equal(login.user.id.startsWith('u_'), true);
  // 码一次性
  const reuse = auth.loginWithPhone({ phone: '13800000002', smsCode: sms.devCode });
  assert.equal(reuse.ok, false);
  assert.ok(reuse.error.includes('已使用'));
  // /me
  const me = auth.getUserByToken(login.token);
  assert.equal(me.id, login.user.id);
  assert.equal(auth.getUserByToken('bad.token.here'), null);
});

test('持久化：账号写入 data/auth-users.json（gitignored 目录，索引哈希化）', () => {
  assert.equal(existsSync(AUTH_FILE), true);
  const raw = JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
  assert.ok(Array.isArray(raw.users));
  assert.ok(raw.users.length >= 1);
  // W5.3：phoneIndex 键为 sha256 哈希（可查询不可逆），不再明文手机号
  const keys = Object.keys(raw.phoneIndex || {});
  assert.ok(keys.length >= 1);
  assert.ok(keys.every((k) => /^[0-9a-f]{32}$/.test(k)), 'phoneIndex 键应为哈希');
});

test('W5.3 加密模式：AUTH_DATA_KEY 下手机号密文落盘，重启后仍可登录（子进程）', () => {
  const KEY = 'a'.repeat(64);
  const encDir = mkdtempSync(join(tmpdir(), 'mywo-auth-enc-'));
  // 子进程 A：加密模式创建账号
  const a = runChild(`
    import { createCaptcha, sendSms, loginWithPhone } from '${AUTH_MODULE}';
    const cap = createCaptcha();
    const sms = await sendSms({ phone: '13800000041', captchaToken: cap.token, captchaInput: cap._devText });
    const login = loginWithPhone({ phone: '13800000041', smsCode: sms.devCode });
    if (!login.ok) throw new Error(JSON.stringify(login));
    console.log(JSON.stringify({ id: login.user.id }));
  `, { AUTH_DATA_DIR: encDir, AUTH_DATA_KEY: KEY });
  // 磁盘检查：无明文手机号、phone 字段 enc: 前缀
  const raw = JSON.parse(readFileSync(join(encDir, 'auth-users.json'), 'utf8'));
  const blob = JSON.stringify(raw);
  assert.equal(blob.includes('13800000041'), false, '文件不得含明文手机号');
  assert.ok(raw.users.some((u) => String(u.phone || '').startsWith('enc:')), 'phone 应为 enc: 密文');
  // 子进程 B：加密模式重启 → 同号登录命中同一账号
  const b = runChild(`
    import { createCaptcha, sendSms, loginWithPhone } from '${AUTH_MODULE}';
    const cap = createCaptcha();
    const sms = await sendSms({ phone: '13800000041', captchaToken: cap.token, captchaInput: cap._devText });
    const login = loginWithPhone({ phone: '13800000041', smsCode: sms.devCode });
    console.log(JSON.stringify({ id: login.user.id }));
  `, { AUTH_DATA_DIR: encDir, AUTH_DATA_KEY: KEY });
  assert.equal(b.id, a.id, '加密模式重启后同号登录命中同一账号');
});

test('重启后旧 JWT 仍有效 + 同号重登返回同一账号（子进程模拟）', () => {
  // 子进程 A：全新进程创建账号并签发 token
  const a = runChild(`
    import { createCaptcha, sendSms, loginWithPhone } from '${AUTH_MODULE}';
    const cap = createCaptcha();
    const sms = await sendSms({ phone: '13800000009', captchaToken: cap.token, captchaInput: cap._devText });
    const login = loginWithPhone({ phone: '13800000009', smsCode: sms.devCode });
    if (!login.ok) throw new Error(JSON.stringify(login));
    console.log(JSON.stringify({ token: login.token, id: login.user.id }));
  `);
  // 子进程 B：重启后（全新模块，从文件加载）
  const b = runChild(`
    import { createCaptcha, sendSms, loginWithPhone, getUserByToken } from '${AUTH_MODULE}';
    const token = '${a.token}';
    const me = getUserByToken(token);
    const cap = createCaptcha();
    const sms = await sendSms({ phone: '13800000009', captchaToken: cap.token, captchaInput: cap._devText });
    const relogin = loginWithPhone({ phone: '13800000009', smsCode: sms.devCode });
    console.log(JSON.stringify({ me: me && me.id, relogin: relogin.user.id }));
  `);
  assert.equal(b.me, a.id, '重启后旧 JWT 仍有效（同一账号）');
  assert.equal(b.relogin, a.id, '重启后同号登录命中同一账号（phoneIndex 已持久化）');
  assert.equal(b.me, b.relogin);
});

test('跨设备收藏同步：设备A收藏 → 设备B同账号可见（独立进程 = 独立设备）', () => {
  const FAV_MODULE = fileURLToPath(new URL('../src/tools/favorite.js', import.meta.url));
  // 设备 A：登录 + 收藏
  const a = runChild(`
    import { createCaptcha, sendSms, loginWithPhone } from '${AUTH_MODULE}';
    import userFavorite from '${FAV_MODULE}';
    const cap = createCaptcha();
    const sms = await sendSms({ phone: '13800000031', captchaToken: cap.token, captchaInput: cap._devText });
    const login = loginWithPhone({ phone: '13800000031', smsCode: sms.devCode });
    const r = await userFavorite({ merchantId: 'm-cross-a', action: 'add', token: login.token });
    if (!r.success) throw new Error(JSON.stringify(r));
    console.log(JSON.stringify({ token: login.token, id: login.user.id }));
  `);
  // 设备 B：全新进程（无频控残留）同号重登 → 应看到 A 的收藏
  const b = runChild(`
    import { createCaptcha, sendSms, loginWithPhone } from '${AUTH_MODULE}';
    import userFavorite from '${FAV_MODULE}';
    const cap = createCaptcha();
    const sms = await sendSms({ phone: '13800000031', captchaToken: cap.token, captchaInput: cap._devText });
    const login = loginWithPhone({ phone: '13800000031', smsCode: sms.devCode });
    const list = await userFavorite({ action: 'list', token: login.token });
    console.log(JSON.stringify({ id: login.user.id, has: !!(list.output && list.output.favorites.includes('m-cross-a')) }));
  `);
  assert.equal(b.id, a.id, '设备 B 与设备 A 同一账号');
  assert.equal(b.has, true, '设备 B 可见设备 A 的收藏（跨设备同步达成）');
});
