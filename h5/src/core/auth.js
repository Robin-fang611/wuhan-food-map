// 账号体系（M12，v1.5 平台化的前端原型）。
//
// 设计对齐 RewardStore（见 store.js）：v0.5 用 LocalAuthProvider（localStorage）跑通
// 账号 + 本地收藏；v1.5 接入后端后只需把 `auth` 换成 `new BffAuthProvider(api)`，
// 本模块与调用方（账号中心 UI / 收藏 / 券包）零改动。
//
// 安全红线（§8，绝不越界）——本前端原型只做"无安全边界的本地身份 + 本地收藏"：
//   - 微信网页授权一键登录（需 AppSecret、state 防 CSRF）与密码 Argon2 哈希均为服务端职责。
//     本前端不实现、不持有任何密钥/口令：loginWithWechat 预留抛错；本地注册无密码字段。
//   - 本地原型不存在安全边界，因此"登录"仅是建立本地身份（手机/邮箱），不做口令校验；
//     v1.5 BFF 才做真鉴权 + Argon2 + 云端同步（M13）。
//   - 手机号/邮箱仅在本地存储用户自己的数据，展示时一律脱敏；绝不经由任何网络外发。

import { DEMO_USER } from './store.js';
import { uid } from '../utils/id.js';

const PREFIX = 'myw:auth:';
const SKEY = PREFIX + 'session';          // 当前会话用户
const FAV_USER = (u) => `${PREFIX}fav:${u}`;
const FAV_ANON = PREFIX + 'fav:anon';     // 未登录时的临时收藏（登录后合并，见 §4.1）

// node / 浏览器通用的最小 localStorage 兜底（同 analytics.js），保证无 storage 时也不崩。
function memoryFallback() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
}

// —— 输入校验（§8：注入/XSS 与长度/类型校验，缺失即拦截）——
const PHONE_RE = /^1[3-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NICK_MAX = 20;

export function validateNickname(n) {
  if (typeof n !== 'string' || !n.trim()) return { ok: false, reason: '昵称不能为空' };
  if (n.trim().length > NICK_MAX) return { ok: false, reason: `昵称不超过 ${NICK_MAX} 字` };
  return { ok: true, value: n.trim() };
}
export function validatePhone(p) {
  if (!p) return { ok: false, reason: '请输入手机号' };
  if (!PHONE_RE.test(String(p))) return { ok: false, reason: '手机号格式不正确' };
  return { ok: true, value: String(p) };
}
export function validateEmail(e) {
  if (!e) return { ok: false, reason: '请输入邮箱' };
  if (!EMAIL_RE.test(String(e))) return { ok: false, reason: '邮箱格式不正确' };
  return { ok: true, value: String(e) };
}

// 手机号/邮箱脱敏展示（§8 信息脱敏，绝不展示明文）。
export function maskContact(v) {
  if (!v) return '';
  if (PHONE_RE.test(v)) return v.slice(0, 3) + '****' + v.slice(7);
  const [a, b] = String(v).split('@');
  if (!b) return String(v);
  const head = a.length <= 2 ? a[0] + '*' : a.slice(0, 2) + '***';
  return `${head}@${b}`;
}

// 抽象基类——固定契约，保证未来 BffAuthProvider 可替换（同 RewardStore 思路）。
class BaseAuth {
  async getSession() { throw new Error('not implemented'); }
  async register() { throw new Error('not implemented'); }
  async loginWithPhoneEmail() { throw new Error('not implemented'); }
  async loginWithWechat() { throw new Error('not implemented'); }
  async logout() { throw new Error('not implemented'); }
  async getFavorites() { throw new Error('not implemented'); }
  async addFavorite() { throw new Error('not implemented'); }
  async removeFavorite() { throw new Error('not implemented'); }
  async isFavorite() { throw new Error('not implemented'); }
  currentUserId() { throw new Error('not implemented'); }
  onChange() {}
}

// v0.5 实现：localStorage。登录/收藏按用户隔离；未登录走 anon 键，登录后合并。
// 注意：本地原型无密码、无中心账号库——仅建立本地身份，真鉴权留待 BFF。
export class LocalAuthProvider extends BaseAuth {
  constructor(opts = {}) {
    super();
    // 懒解析 storage：优先显式传入，其次全局 localStorage，最后内存兜底（保证模块加载/测试不崩）。
    this.storage = opts.storage || (typeof globalThis !== 'undefined' && globalThis.localStorage) || memoryFallback();
    this._subs = [];
  }

  _loadSession() {
    try { const v = this.storage.getItem(SKEY); return v ? JSON.parse(v) : null; }
    catch { return null; }
  }
  _saveSession(u) { this.storage.setItem(SKEY, JSON.stringify(u)); this._emit(); }
  _emit() { const s = this._loadSession(); this._subs.slice().forEach((f) => f(s)); }

  async getSession() { return this._loadSession(); }
  currentUserId() { const s = this._loadSession(); return s ? s.id : null; }

  onChange(cb) {
    if (typeof cb === 'function') { this._subs.push(cb); return () => { this._subs = this._subs.filter((f) => f !== cb); }; }
    return () => {};
  }

  // 注册：建立本地身份（无密码字段）。成功即建立会话并合并 anon 收藏。
  async register({ nickname, phone, email } = {}) {
    const n = validateNickname(nickname);
    if (!n.ok) return { ok: false, reason: n.reason };

    let contact = null;
    if (phone) { const p = validatePhone(phone); if (!p.ok) return { ok: false, reason: p.reason }; contact = { type: 'phone', value: p.value }; }
    if (email) { const e = validateEmail(email); if (!e.ok) return { ok: false, reason: e.reason }; contact = { type: 'email', value: e.value }; }

    const user = {
      id: uid('u_'),
      nickname: n.value,
      phone: contact && contact.type === 'phone' ? contact.value : null,
      email: contact && contact.type === 'email' ? contact.value : null,
      sessionToken: uid('tok_'),     // 本地会话令牌；v1.5 由后端签发 JWT
      created_at: Date.now()
      // 注意：不存 password —— 本地原型无安全边界，真口令校验由 BFF(Argon2) 完成
    };
    this._saveSession(user);
    await this._mergeAnonFavorites(user.id);
    return { ok: true, user };
  }

  // 手机/邮箱登录（本地原型：无密码，仅恢复/建立本地身份）。
  // 已有会话直接复用；否则按联系方式新建一个本地用户（无中心账号库，无法跨设备识别同一人）。
  async loginWithPhoneEmail({ phone, email } = {}) {
    const key = phone ? validatePhone(phone) : email ? validateEmail(email) : { ok: false, reason: '请输入手机号或邮箱' };
    if (!key.ok) return { ok: false, reason: key.reason };

    let s = this._loadSession();
    if (!s) {
      const v = key.value;
      s = {
        id: uid('u_'),
        nickname: (v.slice(0, 3)) + '同学',
        phone: phone ? v : null,
        email: email ? v : null,
        sessionToken: uid('tok_'),
        created_at: Date.now()
      };
      this._saveSession(s);
      await this._mergeAnonFavorites(s.id);
    }
    return { ok: true, user: s };
  }

  // 预留：微信网页授权一键登录需后端持有 AppSecret 并校验 state（§8/§4.4）。
  // 本前端原型不实现、不持有任何密钥；接入点留给 M13 BFF。
  async loginWithWechat() {
    throw new Error('微信登录需 v1.5 后端授权（M13 BFF），当前为前端原型');
  }

  async logout() { this.storage.removeItem(SKEY); this._emit(); return { ok: true }; }

  // BFF 登录后把后端会话写入本地存储（favorites/wallet 按 id 隔离继续工作，零改动）。
  // 后端只回传脱敏手机号(phoneMasked)，完整手机号永不落地前端（隐私最小化）。
  applyRemoteSession(session) {
    if (!session || !session.id) return { ok: false, reason: '无效会话' };
    this._saveSession({
      id: session.id,
      nickname: session.nickname || '蛮友',
      phone: null,
      phoneMasked: session.phoneMasked || '',
      token: session.token || null,     // 后端签发的 JWT；仅前端持有登录态，不含任何密钥
      created_at: session.created_at || Date.now(),
    });
    return { ok: true };
  }

  _readFav(key) {
    try { const v = this.storage.getItem(key); return v ? JSON.parse(v) : []; }
    catch { return []; }
  }
  _writeFav(key, ids) { this.storage.setItem(key, JSON.stringify(ids)); }

  async getFavorites() {
    const uid0 = this.currentUserId();
    const ids = this._readFav(uid0 ? FAV_USER(uid0) : FAV_ANON);
    return [...new Set(ids)];
  }
  async isFavorite(merchantId) {
    const list = await this.getFavorites();
    return list.includes(merchantId);
  }
  async addFavorite(merchantId) {
    if (!merchantId) return { ok: false, reason: '缺少商户' };
    const uid0 = this.currentUserId();
    const key = uid0 ? FAV_USER(uid0) : FAV_ANON;   // 未登录存 anon，登录后合并
    const ids = this._readFav(key);
    if (!ids.includes(merchantId)) { ids.push(merchantId); this._writeFav(key, ids); }
    this._emit();
    return { ok: true, favorited: true };
  }
  async removeFavorite(merchantId) {
    const uid0 = this.currentUserId();
    const key = uid0 ? FAV_USER(uid0) : FAV_ANON;
    const ids = this._readFav(key).filter((x) => x !== merchantId);
    this._writeFav(key, ids);
    this._emit();
    return { ok: true, favorited: false };
  }
  // 登录时把未登录期间的 anon 收藏并入该用户（§4.1 未登录可本地临时收藏，登录后合并）。
  async _mergeAnonFavorites(userId) {
    const anon = this._readFav(FAV_ANON);
    if (!anon.length) return;
    const mine = new Set(this._readFav(FAV_USER(userId)));
    anon.forEach((x) => mine.add(x));
    this._writeFav(FAV_USER(userId), [...mine]);
    this.storage.removeItem(FAV_ANON);
  }
}

// v1.5 预留：接 BFF（Next.js Route Handlers）的账号实现。
// 仅声明接口与明确抛错，不写任何网络分支（守门红线：未鉴权/不可测的网络分支不写）。
export class BffAuthProvider extends BaseAuth {
  constructor(api) { super(); this.api = api; }
  _todo(name) { throw new Error(`BffAuthProvider.${name} 需 M13 BFF 实现（微信 OAuth + Argon2 + 云端收藏/券包）`); }
  async getSession() { return this._todo('getSession'); }
  async register() { return this._todo('register'); }
  async loginWithPhoneEmail() { return this._todo('loginWithPhoneEmail'); }
  async loginWithWechat() { return this._todo('loginWithWechat'); }
  async logout() { return this._todo('logout'); }
  async getFavorites() { return this._todo('getFavorites'); }
  async addFavorite() { return this._todo('addFavorite'); }
  async removeFavorite() { return this._todo('removeFavorite'); }
  async isFavorite() { return this._todo('isFavorite'); }
  currentUserId() { return this._todo('currentUserId'); }
  onChange() {}
}

// 当前激活的账号实现。v1.5 改为 `new BffAuthProvider(api)` 即可，调用方无感。
export const auth = new LocalAuthProvider();

// 解析"当前用户 id"：已登录用会话 id；未登录用 DEMO_USER。
// 这样 store（按 userId 隔离）在登录前后都能工作，登录后数据归属真实用户。
export function activeUserId() {
  return auth.currentUserId() || DEMO_USER;
}
