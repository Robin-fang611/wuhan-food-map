// 轻量埋点（产品方案 §9）。
//
// 设计原则（隐私友好，见 §8/§9）：
//   - 全部事件为"行为事件"（详情 PV / 导航点击 / 搜索词 / 榜单点击 / 签到 / 得券 / 核销…），
//     不含任何用户身份。聚合指标（签到人数 = checkin 事件数、核销率 = 核销/得券）由事件计数得出，
//     因此天然不存身份、不可反推个人。
//   - track 会静默剥离 PII 字段（见 PII_KEYS），从源头杜绝身份入库。
//   - 采样（sampleRate）与本地缓冲（localStorage）前置；BFF 上报只是 flush 时的一个可插拔 reporter。
//
// 架构对齐 RewardStore：v0.5 用本地缓冲跑通；v1.5 接 BFF 时只换 reporter（HTTP 上报），
// 本模块与调用方（UI/玩法）零改动。

// §9 事件清单（行为语义，props 均为非 PII 的聚合维度）。
export const EVENTS = {
  DETAIL_VIEW: 'detail_view',         // 商户详情 PV（props: {id, zone}）
  NAV_CLICK: 'nav_click',             // 高德导航点击（props: {id}）
  FAVORITE: 'favorite',               // 收藏（props: {id, action:'add'|'remove'}）
  SEARCH: 'search',                   // 搜索词（props: {term, zone}）—— term 为查询意图，非 PII
  RANK_CLICK: 'rank_click',           // 榜单点击（props: {rank, id}）
  CHECKIN: 'checkin',                 // 签到（props: {streak}）
  CLAIM: 'claim',                     // 领商家券（props: {id}）
  COUPON_ISSUED: 'coupon_issued',     // 得券（props: {play_type, count}）
  COUPON_REDEEMED: 'coupon_redeemed', // 核销（props: {id}）
  APP_OPEN: 'app_open'                // 启动/会话（DAU 计数基础；props 留空）
};

// 匿名访客 ID（一方、localStorage、非 PII）。DAU = 同一天出现不同 vid 的 APP_OPEN 数。
// 与账号体系无关：未登录也能量unique visitor，登录后仍是同一匿名 vid（不绑定身份）。
const VID_KEY = 'myw:vid';
function ensureVid(storage) {
  try {
    const existing = storage.getItem(VID_KEY);
    if (existing) return existing;
    const v = (globalThis.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'v-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    storage.setItem(VID_KEY, v);
    return v;
  } catch {
    return 'v-anon'; // storage 不可用时退化为共享匿名值，不影响业务
  }
}

// 绝不进入事件的字段（用户身份 / 敏感凭据）。track 会静默剥离，无论嵌套在哪一层 props。
const PII_KEYS = new Set([
  'user_id', 'userid', 'userId', 'uid', 'openid', 'unionid', 'sub',
  'phone', 'mobile', 'tel', 'email', 'mail',
  'name', 'nickname', 'realname', 'username',
  'idcard', 'id_card', 'id_no',
  'address', 'token', 'session', 'password', 'passwd', 'secret', 'auth'
]);

// 小写的 key 是否在 PII 黑名单（大小写不敏感）。
function isPII(key) { return PII_KEYS.has(String(key).toLowerCase()); }

// 递归剥离 PII 键，且把 props 摊平成"一层可序列化对象"（防止意外存嵌套对象/函数）。
function sanitize(props) {
  const out = {};
  if (props && typeof props === 'object') {
    for (const [k, v] of Object.entries(props)) {
      if (isPII(k)) continue;                       // 剥离身份字段
      if (v == null) continue;                       // 跳过空值
      if (typeof v === 'object') continue;           // 不存嵌套对象（避免误带敏感结构）
      if (typeof v === 'function') continue;
      out[k] = v;
    }
  }
  return out;
}

// node / 浏览器通用的最小 localStorage 兜底（node 无全局 localStorage 时不崩）。
function memoryFallback() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
}

// 默认 reporter：本地原型期不真正上报。v1.5 把 reporter 换成 `(batch)=>fetch(...)` 即可。
const NOOP_REPORTER = async () => {};

// 抽象基类——固定契约，保证未来 BFF 实现可替换。
export class Analytics {
  async track() { throw new Error('not implemented'); }
  async flush() { throw new Error('not implemented'); }
  getQueue() { throw new Error('not implemented'); }
  stats() { throw new Error('not implemented'); }
  topSearch() { throw new Error('not implemented'); }
}

// v0.5 实现：本地缓冲（localStorage） + 采样 + 可插拔 reporter。
export class LocalAnalytics extends Analytics {
  constructor(opts = {}) {
    super();
    this.storage = opts.storage || globalThis.localStorage || memoryFallback();
    this.bufferKey = opts.bufferKey || 'myw:analytics';
    this.sampleRate = typeof opts.sampleRate === 'number' ? opts.sampleRate : 1; // 0..1
    this.rng = opts.rng || Math.random;       // 注入以便测试确定性采样
    this.now = opts.now || Date.now;          // 注入以便测试确定性 ts
    this.maxBuffer = opts.maxBuffer || 200;   // 本地缓冲上限，超出丢弃最旧
    this.reporter = opts.reporter || NOOP_REPORTER;
    this.vid = opts.vid || ensureVid(this.storage); // 匿名访客 ID（DAU 去重键）
    this._q = this._load();
  }

  _load() {
    try {
      const v = this.storage.getItem(this.bufferKey);
      return v ? JSON.parse(v) : [];
    } catch { return []; }
  }
  _persist() {
    try { this.storage.setItem(this.bufferKey, JSON.stringify(this._q)); } catch { /* 配额满则忽略 */ }
  }

  /**
   * 记录一个事件。
   * @param {string} name 事件名（建议用 EVENTS.*）
   * @param {object} [props] 维度；会经 sanitize 剥离 PII 与嵌套对象
   * @returns {{queued:boolean, sampled:boolean}}
   */
  async track(name, props = {}) {
    if (typeof name !== 'string' || !name) return { queued: false, sampled: false };
    // 采样：rng() <= sampleRate 才保留（sampleRate=1 全留，=0 几乎全丢）。
    if (this.rng() > this.sampleRate) return { queued: false, sampled: true };
    const event = { name, props: sanitize(props), ts: this.now(), vid: this.vid };
    this._q.push(event);
    while (this._q.length > this.maxBuffer) this._q.shift();
    this._persist();
    return { queued: true, sampled: false };
  }

  // 导出当前缓冲（副本，防外部篡改）。
  getQueue() { return [...this._q]; }

  // 各事件名计数（聚合指标基础：签到人数 / 得券数 / 核销数…）。
  stats() {
    const c = {};
    for (const e of this._q) c[e.name] = (c[e.name] || 0) + 1;
    return c;
  }

  // 搜索词 Top（§9 搜索词 Top 指标）。
  topSearch(limit = 10) {
    const c = {};
    for (const e of this._q) {
      if (e.name === EVENTS.SEARCH && e.props && typeof e.props.term === 'string') {
        const t = e.props.term.trim();
        if (t) c[t] = (c[t] || 0) + 1;
      }
    }
    return Object.entries(c)
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
      .slice(0, limit);
  }

  // DAU（日活）= 当天出现过 APP_OPEN 的不同匿名 vid 数。dayKey 形如 '2026-8-8'（本地日）。
  dau(dayKey) {
    const seen = new Set();
    for (const e of this._q) {
      if (e.name !== EVENTS.APP_OPEN) continue;
      const d = new Date(e.ts);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      if (!dayKey || key === dayKey) seen.add(e.vid);
    }
    return seen.size;
  }

  // 上报：抽空缓冲交给 reporter（BFF 接入点）。默认 no-op。
  async flush() {
    if (this._q.length === 0) return { sent: 0, batch: [] };
    const batch = this._q;
    this._q = [];
    this._persist();
    try { await this.reporter(batch); } catch { /* 上报失败不阻塞业务 */ }
    return { sent: batch.length, batch };
  }
}

// 默认单例（类似 store）。UI/玩法直接 `import { analytics }` 调用；
// 生产环境可在此替换 reporter 指向 BFF，调用方无感。
export const analytics = new LocalAnalytics();

// 本地预测试 / 调试用的 reporter：把批量事件打印到控制台（不向外发送）。
// 用法：在入口处 `analytics.reporter = ConsoleReporter`，即可在浏览器控制台看到事件流。
export const ConsoleReporter = async (batch) => {
  // 仅打印非 PII 维度；vid 为匿名，可安全出现在调试日志。
  console.log('[analytics] flush', batch.length, 'events', batch.map((e) => e.name));
};
