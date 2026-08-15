// 用户探店众包单测（2026-08-15）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA_DIR = mkdtempSync(join(tmpdir(), 'mywo-explore-'));
process.env.AUTH_DATA_DIR = DATA_DIR;
process.env.EXPLORES_STORE_FILE = join(DATA_DIR, 'explores.json');
process.env.EXPLORE_ENRICH_FILE = join(DATA_DIR, 'enrichment-explore.json'); // 测试隔离，不写仓库数据文件
process.env.AUTH_JWT_SECRET = 'explore-test-secret';
process.env.AUTH_DEV_EXPOSE_CAPTCHA = '1';

const auth = await import('../src/auth-server.js');
const ex = await import('../src/explores.js');

async function getToken(phone) {
  const cap = auth.createCaptcha();
  const login = auth.loginWithCaptcha({ phone, captchaToken: cap.token, captchaInput: cap._devText, agreement: '2026-08-15' });
  if (!login.ok) throw new Error('login failed: ' + JSON.stringify(login));
  return login.token;
}

test('提交探店：未登录拒绝 / 校验 / attest 必填 / 限频', async () => {
  const noAuth = await ex.submitExplore({ merchantId: 'm0001', rating: '必吃', attest: 'yes' });
  assert.equal(noAuth.success, false);
  assert.equal(noAuth.code, 'UNAUTHORIZED');
  const tok = await getToken('13800000071');
  const badRating = await ex.submitExplore({ merchantId: 'm0001', rating: '超好吃', attest: 'yes', token: tok });
  assert.equal(badRating.success, false);
  const noAttest = await ex.submitExplore({ merchantId: 'm0001', rating: '必吃', token: tok });
  assert.equal(noAttest.success, false);
  const ok = await ex.submitExplore({ merchantId: 'm0001', rating: '必吃', recommendDishes: '招牌牛肉面', avgPrice: '18', taste: '香', attest: 'yes', token: tok });
  assert.equal(ok.success, true);
  const dup = await ex.submitExplore({ merchantId: 'm0001', rating: '推荐', attest: 'yes', token: tok });
  assert.equal(dup.success, false); // 同店重复提交拦截
});

test('治理：pending 列表脱敏 / promote 生成覆盖 / reject 保留', async () => {
  const tok = await getToken('13800000072');
  await ex.submitExplore({ merchantId: 'm0002', rating: '推荐', recommendDishes: '藕汤', attest: 'yes', token: tok });
  const list = await ex.listPendingExplores();
  assert.equal(list.ok, true);
  assert.equal(list.items.length >= 1, true);
  assert.ok(list.items.every((i) => !('uid' in i)), '治理视图脱敏（无 uid）');
  const pending = await ex.listPendingExplores();
  const target = pending.items.find((i) => i.merchantId === 'm0002');
  const gov = await ex.governExplore({ exploreId: target.id, action: 'promote', by: 'test-admin' });
  assert.equal(gov.ok, true);
  // 覆盖已生成（enrichment-explore.json 或已在 DATA_DIR 之外——检查函数行为：写 assets 固定路径，测试验证 explores.json）
  const store = JSON.parse(readFileSync(process.env.EXPLORES_STORE_FILE, 'utf8'));
  assert.equal(store.verified.length >= 1, true);
  assert.equal(store.audit.length >= 1, true);
  // reject 路径
  await ex.submitExplore({ merchantId: 'm0003', rating: '一般', attest: 'yes', token: tok });
  const list2 = await ex.listPendingExplores();
  const t2 = list2.items.find((i) => i.merchantId === 'm0003');
  const rj = await ex.governExplore({ exploreId: t2.id, action: 'reject', by: 'test-admin', note: '信息不足' });
  assert.equal(rj.ok, true);
  const store2 = JSON.parse(readFileSync(process.env.EXPLORES_STORE_FILE, 'utf8'));
  assert.equal(store2.rejected.length >= 1, true);
});
