// 前端收藏云端同步单测（S4 · 2026-08-15）
// 覆盖：未登录纯本地 / JWT 会话走后端（Authorization 头 + 不传 userId）/ 后端失败回落本地 /
//       本地原型会话（tok_xxx 非 JWT）不触发网络 / 服务端结果回写本地缓存。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalAuthProvider } from '../src/core/auth.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1X3Rlc3QifQ.sig';

// —— 有状态服务端桩：跨请求保持收藏集合；failTimes>0 时连续模拟网络故障 ——
let serverFavs = ['m-cloud-1'];
let failTimes = 0;
const calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), opts: opts ? { ...opts, headers: { ...opts.headers } } : null });
  if (failTimes > 0) { failTimes--; throw new Error('network down'); }
  const body = JSON.parse(opts.body || '{}');
  if (body.action === 'list') {
    return { ok: true, json: async () => ({ success: true, output: { ok: true, favorites: [...serverFavs] } }) };
  }
  if (body.action === 'add' && body.merchantId && !serverFavs.includes(body.merchantId)) {
    serverFavs.push(body.merchantId);
  }
  if (body.action === 'remove' && body.merchantId) {
    serverFavs = serverFavs.filter((x) => x !== body.merchantId);
  }
  return { ok: true, json: async () => ({ success: true, output: { ok: true, favorited: true, favorites: [...serverFavs] } }) };
};

function freshProvider() {
  calls.length = 0;
  failTimes = 0;
  serverFavs = ['m-cloud-1'];
  return new LocalAuthProvider({ storage: memStorage() });
}

test('未登录：addFavorite 纯本地，不发网络', async () => {
  const auth = freshProvider();
  const r = await auth.addFavorite('m-local-1');
  assert.equal(r.ok, true);
  assert.equal(calls.length, 0, '未登录不应触发云端');
  assert.deepEqual(await auth.getFavorites(), ['m-local-1']);
});

test('本地原型会话（tok_xxx 非 JWT）：不触发网络', async () => {
  const auth = freshProvider();
  await auth.register({ nickname: '小明', phone: '13800000011' }); // 本地注册 → sessionToken
  const r = await auth.addFavorite('m-local-2');
  assert.equal(r.ok, true);
  assert.equal(calls.length, 0, '非 JWT 会话不应触发云端');
});

test('JWT 会话：addFavorite 走后端（Authorization 头 + 不传 userId），服务端结果回写本地', async () => {
  const auth = freshProvider();
  await auth.applyRemoteSession({ id: 'u_test', nickname: '云端用户', phoneMasked: '138****0000', token: JWT });
  const r = await auth.addFavorite('m-new');
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/tools/user.favorite'));
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer ' + JWT);
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.action, 'add');
  assert.equal(body.merchantId, 'm-new');
  assert.equal('userId' in body, false, '前端绝不发送 userId（服务端从 JWT 解析本人）');
  // 服务端返回的 favorites 回写本地缓存（含他设备新增项），getFavorites 也以服务端为准
  const favs = await auth.getFavorites();
  assert.ok(favs.includes('m-cloud-1'), '本地缓存含服务端既有收藏');
  assert.ok(favs.includes('m-new'), '本地缓存含新增收藏');
});

test('JWT 会话 + 后端不可达：add 与 list 均回落本地，操作不失败', async () => {
  const auth = freshProvider();
  await auth.applyRemoteSession({ id: 'u_test', nickname: '云端用户', phoneMasked: '138****0000', token: JWT });
  failTimes = 2; // add 与随后的 list 都模拟断网
  const r = await auth.addFavorite('m-offline');
  assert.equal(r.ok, true, '后端失败不阻断收藏');
  assert.deepEqual(await auth.getFavorites(), ['m-offline'], '断网时回落本地缓存');
});

test('JWT 会话：getFavorites 取服务端列表；remove 同步后端', async () => {
  const auth = freshProvider();
  await auth.applyRemoteSession({ id: 'u_test', nickname: '云端用户', phoneMasked: '138****0000', token: JWT });
  const list = await auth.getFavorites();
  assert.deepEqual(list, ['m-cloud-1'], '服务端列表为准');
  const rm = await auth.removeFavorite('m-cloud-1');
  assert.equal(rm.ok, true);
  const rmCall = calls[calls.length - 1];
  assert.equal(JSON.parse(rmCall.opts.body).action, 'remove');
  assert.deepEqual(await auth.getFavorites(), [], '删除后服务端为空，本地同步');
});
