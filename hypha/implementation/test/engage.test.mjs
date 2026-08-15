// 集成测试：经本机工具服务验证 Engage 状态（favorite / checkin / claim / viewWallet）的治理，
// 并覆盖 Track（analytics.track PII 剥离）与 discovery 的降级标注 + 红线校验（eval.redline-check）。
//
// 在独立测试端口(:8797)起 httpServer，避免干扰常驻 :8799 服务或外部 :8788。
// 验证口径对齐 ARCHITECTURE.md 步骤 6 / 步骤 8 完成条件：
//   - favorite/checkin/claim/viewWallet 经 Agent 治理返回预期，幂等，本人 scope；
//   - 输出绝不回显 user_id / phone / token 等 PII（守 data.export-pii 红线）；
//   - analytics.track 入库事件不含 PII；
//   - discovery 输出 summary 含 total_matched 与 degradation（数据缺口显式标注，不编造）。
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MYWO_PORT = '8797';
// S4/S5：测试环境注入密钥 / 图形码开发态 / 账号落临时目录；W5：关限流 + 治理令牌
process.env.AUTH_JWT_SECRET = 'engage-test-secret';
process.env.AUTH_DEV_EXPOSE_CAPTCHA = '1';
process.env.AUTH_DATA_DIR = mkdtempSync(join(tmpdir(), 'mywo-engage-'));
process.env.RATE_LIMIT = 'off';
process.env.ADMIN_TOKEN = 'engage-admin-token';
process.env.RUNTIME_STORE_FILE = join(mkdtempSync(join(tmpdir(), 'mywo-engage-store-')), 'runtime-store.json'); // W7.2 隔离券存储
const { server } = await import('../src/httpServer.js');
const authApi = await import('../src/auth-server.js');
const { getAnalytics } = await import('../src/runtime.js');
const { redlineCheck } = await import('../src/orchestrator.js');

const BASE = `http://127.0.0.1:${process.env.MYWO_PORT}`;
const UID = 'utest-engage';
const MID = 'm-test-engage';

async function callTool(id, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/tools/${id}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

// S4：走真实登录链路取 JWT（图形码→短信→登录）
async function obtainToken(phone) {
  const cap = authApi.createCaptcha();
  const sms = await authApi.sendSms({ phone, captchaToken: cap.token, captchaInput: cap._devText });
  if (!sms.ok || !sms.devCode) throw new Error('sms failed: ' + JSON.stringify(sms));
  const login = authApi.loginWithPhone({ phone, smsCode: sms.devCode, agreement: '2026-08-15' });
  if (!login.ok) throw new Error('login failed: ' + JSON.stringify(login));
  return login.token;
}
async function runDiscovery(input) {
  const res = await fetch(`${BASE}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.json();
}

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, '✗ ' + name);
  passed++;
  console.log('  ✓', name);
}

// —— 1. favorite（S4：JWT 鉴权 + 防越权 + 跨设备 + 无 PII 回显）——
console.log('Engage · user.favorite');
const noAuth = await callTool('user.favorite', { merchantId: MID, action: 'add' });
ok('无 token → 拒绝（请先登录）', noAuth.success === false && String(noAuth.error || '').includes('登录'));
const badAuth = await callTool('user.favorite', { merchantId: MID, action: 'add', token: 'fake.token.x' });
ok('伪造 token → 拒绝', badAuth.success === false);
const TOKEN_A = await obtainToken('13800000021');
const fa1 = await callTool('user.favorite', { merchantId: MID, action: 'add' }, TOKEN_A);
ok('add（Bearer JWT）→ success & favorited=true', fa1.success && fa1.output.favorited === true);
ok('add 输出无 userId 回显', !('userId' in (fa1.output || {})));
const faIntrude = await callTool('user.favorite', { merchantId: 'm-other', action: 'add', userId: 'victim-user' }, TOKEN_A);
ok('客户端传 userId 被忽略（服务端从 JWT 解析本人）', faIntrude.success && faIntrude.output.favorites.includes('m-other'));
const faList = await callTool('user.favorite', { action: 'list' }, TOKEN_A);
ok('list 返回本人收藏', faList.success && faList.output.favorites.includes(MID) && faList.output.favorites.includes('m-other'));
const fa2 = await callTool('user.favorite', { merchantId: MID, action: 'remove' }, TOKEN_A);
ok('remove → success & favorited=false', fa2.success && fa2.output.favorited === false);
const fa3 = await callTool('user.favorite', { merchantId: MID, action: 'remove' }, TOKEN_A);
ok('remove 重复不报错（幂等）', fa3.success && fa3.output.favorited === false);

// —— 2. checkin 同日幂等（W5：JWT 鉴权）——
console.log('Engage · reward.checkin');
const ck0 = await callTool('reward.checkin', {});
ok('无 token → 拒绝（请先登录）', ck0.success === false && ck0.code === 'UNAUTHORIZED');
const ck1 = await callTool('reward.checkin', {}, TOKEN_A);
ok('首次签到 idempotent≠true', ck1.success && ck1.output.idempotent !== true);
const ck2 = await callTool('reward.checkin', {}, TOKEN_A);
ok('同日重复签到 idempotent===true', ck2.success && ck2.output.idempotent === true);

// —— 3. claim 每商家每用户限 1 + 无 PII（W5：JWT 鉴权）——
console.log('Engage · reward.claim');
const cl1 = await callTool('reward.claim', { merchantId: MID }, TOKEN_A);
ok('首次领券 idempotent≠true', cl1.success && cl1.output.idempotent !== true);
ok('首次领券发 1 张', Array.isArray(cl1.output.coupons) && cl1.output.coupons.length === 1);
ok('券投射无 user_id', cl1.output.coupons.every((c) => !('user_id' in c)));
const cl2 = await callTool('reward.claim', { merchantId: MID }, TOKEN_A);
ok('重复领券 idempotent===true', cl2.success && cl2.output.idempotent === true);
ok('重复领券不发新券', Array.isArray(cl2.output.coupons) && cl2.output.coupons.length === 1);
const clIntrude = await callTool('reward.claim', { merchantId: MID, userId: 'victim-user' }, TOKEN_A);
ok('客户端传 userId 被忽略（服务端从 JWT 解析本人，越权无效）', clIntrude.success && clIntrude.output.idempotent === true);

// —— 4. view-wallet 仅本人 + 无 PII 回显（W5：JWT 鉴权）——
console.log('Engage · reward.view-wallet');
const w = await callTool('reward.view-wallet', {}, TOKEN_A);
ok('viewWallet success', w.success);
ok('viewWallet 无 userId 回显', !('userId' in (w.output || {})));
ok('viewWallet count≥1（含已领券）', w.output.count >= 1);
ok('viewWallet 券无 user_id', w.output.coupons.every((c) => !('user_id' in c)));
const wIntrude = await callTool('reward.view-wallet', { userId: 'victim-user' }, TOKEN_A);
ok('客户端传 userId 查他人券包被忽略（仍为本人数据）', wIntrude.success && !('userId' in (wIntrude.output || {})));
// W7.2：券/签到数据文件持久化（重启不丢）
const { existsSync: rtExists, readFileSync: rtRead } = await import('node:fs');
ok('runtime-store.json 已落盘（券/签到持久化）', rtExists(process.env.RUNTIME_STORE_FILE));
const rtBlob = rtRead(process.env.RUNTIME_STORE_FILE, 'utf8');
ok('落盘内容含券数据（非空存储）', rtBlob.length > 50 && rtBlob.includes('coupon'));

// —— 5. Track：analytics.track 入库剥离 PII ——
console.log('Track · analytics.track');
const tr = await callTool('analytics.track', {
  event: 'search',
  payload: { user_id: 'u-pii', phone: '13800000000', name: '张三', term: '南湖宵夜' },
});
ok('track queued & piiStripped', tr.success && tr.output.queued === true && tr.output.piiStripped === true);
const last = getAnalytics().getQueue().slice(-1)[0];
ok('入库事件保留非 PII 维度 term', last && last.props && last.props.term === '南湖宵夜');
ok('入库事件不含 user_id/phone/name', last && !('user_id' in (last.props || {})) && !('phone' in (last.props || {})) && !('name' in (last.props || {})));

// —— 6. Discovery：降级标注 + 红线校验 ——
console.log('Discovery · degradation + redline');
const d = await runDiscovery({ intent: '南湖附近便宜的宵夜' });
ok('discovery success & 有商户', d.success && Array.isArray(d.output.merchants));
ok('summary.total_matched 为数字', typeof d.output.summary.total_matched === 'number');
ok('summary.degradation 为数组（数据缺口显式标注）', Array.isArray(d.output.summary.degradation));
const bad = redlineCheck({ merchants: [{ user_id: 'x' }], summary: {} });
ok('redlineCheck 拒绝含 PII 输出（data.export-pii）', bad.passed === false && bad.violations.includes('data.export-pii'));
const good = redlineCheck({ merchants: [], summary: {} });
ok('redlineCheck 放行干净输出', good.passed === true);

// —— 7. S5：/upload/pending + /upload/govern HTTP 契约（临时存储文件）——
console.log('S5 · upload 治理端点（HTTP）');
process.env.UPLOAD_STORE_FILE = join(mkdtempSync(join(tmpdir(), 'mywo-engage-upload-')), 'merchant-uploads.json');
const up = await fetch(`${BASE}/upload`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'HTTP待核验店', description: '契约测试', isStall: false }),
}).then((r) => r.json());
ok('POST /upload → pending（无 Key 降级）', up.decision === 'pending' && !!up.uploadId);
const ADMIN_HDR = { 'Content-Type': 'application/json', 'X-Admin-Token': 'engage-admin-token' };
const pendNoAuth = await fetch(`${BASE}/upload/pending`).then((r) => r.json());
ok('治理接口无令牌 → 401', pendNoAuth.success === false && String(pendNoAuth.error || '').includes('管理员'));
const pend = await fetch(`${BASE}/upload/pending`, { headers: ADMIN_HDR }).then((r) => r.json());
ok('GET /upload/pending（带令牌）→ 含该条且脱敏', pend.ok && pend.total >= 1 && pend.items.some((i) => i.uploadId === up.uploadId && !('userId' in i)));
const gov = await fetch(`${BASE}/upload/govern`, {
  method: 'POST',
  headers: ADMIN_HDR,
  body: JSON.stringify({ uploadId: up.uploadId, action: 'reject', by: 'engage-test', note: '契约测试驳回' }),
}).then((r) => r.json());
ok('POST /upload/govern reject → ok + 审计', gov.ok && gov.action === 'reject' && gov.audit && gov.audit.action === 'reject');
const pend2 = await fetch(`${BASE}/upload/pending`, { headers: ADMIN_HDR }).then((r) => r.json());
ok('govern 后 pending 清空', pend2.total === 0);
const govBad = await fetch(`${BASE}/upload/govern`, {
  method: 'POST',
  headers: ADMIN_HDR,
  body: JSON.stringify({ uploadId: 'u_nope', action: 'promote' }),
}).then((r) => r.json());
ok('未知 uploadId → 404 + 错误体', govBad.ok === false && /未找到/.test(govBad.error));
const audNoAuth = await fetch(`${BASE}/upload/audit`).then((r) => r.json());
ok('GET /upload/audit 无令牌 → 401', audNoAuth.success === false);
const aud = await fetch(`${BASE}/upload/audit`, { headers: ADMIN_HDR }).then((r) => r.json());
ok('GET /upload/audit（带令牌）→ 含刚才的 reject 记录且无 PII', aud.ok && aud.total >= 1 && aud.items.some((a) => a.action === 'reject' && a.uploadId === up.uploadId) && aud.items.every((a) => !('userId' in a)));
const badOrigin = await fetch(`${BASE}/health`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' },
  body: '{}',
}).then((r) => r.json()).catch((e) => ({ fetchError: String(e) }));
ok('非白名单 Origin → 403', badOrigin.success === false && badOrigin.error.includes('来源'));
delete process.env.UPLOAD_STORE_FILE;

console.log(`\nALL ENGAGE/Track/Redline TESTS PASSED (${passed} assertions)`);
server.close();
process.exit(0);
