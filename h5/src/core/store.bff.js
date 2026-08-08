// store.bff.js —— v1.5 实现：RewardStore 接口对接 BFF（Next.js Route Handlers）。
//
// 与 LocalStore 完全相同的 5 个方法签名，奖励引擎 / 玩法 / 券包 UI 全部零改动（见 §4.5 / §5）。
//
// 切换方式（应用启动处，且仅当 v1.5 已部署 BFF 后端时）：
//   import { setActiveStore } from './store.js';
//   import { BffStore }       from './store.bff.js';
//   setActiveStore(new BffStore({ baseUrl: '/api', getToken: () => auth.sessionToken }));
// 不配置则默认仍是 LocalStore，现有行为完全不变（见 store.js）。
//
// 安全红线（§8，绝不越界）：
//   - 不持有任何密钥 / AppSecret / JWT 密钥；仅携带用户会话令牌（由 opts.getToken 注入，同源内存）。
//   - 传输可注入（opts.transport，默认 globalThis.fetch）；未配置后端时请求自然会失败，不静默伪造数据。
//   - 服务端返回统一走 JSON；非 2xx 抛错并尽量取 body.error；不信任未校验的响应结构。
//   - ⚠️ BFF 服务端必须以"已验证的 JWT 重新解析 user_id"为准，忽略前端传入的 userId，防越权读写他人券/签到。
//
// 路由契约（详见 docs/BFF接口契约.md，与 Next.js app/api/rewards/* Route Handlers 对齐）：
//   GET    /api/rewards/checkin?userId=   -> { streak, lastDate, dates }
//   PUT    /api/rewards/checkin            -> { userId, streak, lastDate, dates }
//   GET    /api/rewards/coupons?userId=    -> Coupon[]
//   POST   /api/rewards/coupons            -> { userId, coupon }
//   PATCH  /api/rewards/coupons/:id        -> { userId, patch }
// 说明：Coupon 字段与 §5 user_coupons 表 + CouponIssuer 输出一致
//   { id, user_id, code, play_type, title, discount_desc, amount, merchant_id, status, issued_at, expires_at, redeemed_at }。

import { RewardStore } from './store.js';

export class BffStore extends RewardStore {
  constructor(opts = {}) {
    super();
    // baseUrl 缺省为 null（必须显式配置）；传 '' 表示同源（/api 在路径里，不含在 baseUrl）。
    this.baseUrl = opts.baseUrl == null ? null : String(opts.baseUrl).replace(/\/+$/, '');
    this.getToken = typeof opts.getToken === 'function' ? opts.getToken : () => null;
    this.transport =
      opts.transport ||
      (typeof globalThis !== 'undefined' && globalThis.fetch ? globalThis.fetch.bind(globalThis) : null);
    if (typeof this.transport !== 'function') {
      throw new Error('BffStore 需要一个 fetch 传输（浏览器自带，或注入 transport 用于测试）');
    }
  }

  async _request(method, path, body) {
    if (this.baseUrl == null) throw new Error('BffStore 未配置 baseUrl（需 v1.5 BFF 后端）');
    const headers = { 'Content-Type': 'application/json' };
    const tok = this.getToken();
    if (tok) headers['Authorization'] = `Bearer ${tok}`;
    const url = `${this.baseUrl}${path}`;
    let res;
    try {
      res = await this.transport(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new Error(`BFF 请求失败（${method} ${path}）：${e.message}`);
    }
    if (!res.ok) {
      let msg = `BFF ${method} ${path} 返回 ${res.status}`;
      try {
        const e = await res.json();
        if (e && e.error) msg = e.error;
      } catch {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  getCheckin(userId) {
    return this._request('GET', `/api/rewards/checkin?userId=${encodeURIComponent(userId)}`);
  }
  saveCheckin(userId, data) {
    return this._request('PUT', '/api/rewards/checkin', { userId, ...data });
  }
  getCoupons(userId) {
    return this._request('GET', `/api/rewards/coupons?userId=${encodeURIComponent(userId)}`);
  }
  addCoupon(userId, coupon) {
    return this._request('POST', '/api/rewards/coupons', { userId, coupon });
  }
  updateCoupon(userId, id, patch) {
    return this._request('PATCH', `/api/rewards/coupons/${encodeURIComponent(id)}`, { userId, patch });
  }
}
