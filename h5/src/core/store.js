// RewardStore —— 数据访问抽象层。
// 为什么抽这一层：v0.5 用 localStorage 跑通；v1.5 账号上线后只需新增 bffStore 实现同一接口，
// 奖励引擎 / 玩法 / 券包 UI 全部不改（见产品方案 §4.5 / §5）。
//
// 接口契约（所有实现必须遵循）：
//   getCheckin(userId)       -> Promise<{ streak, lastDate, dates[] }>
//   saveCheckin(userId, data)-> Promise<void>
//   getCoupons(userId)       -> Promise<Coupon[]>
//   addCoupon(userId, coupon)-> Promise<void>
//   updateCoupon(userId, id, patch) -> Promise<void>

const PREFIX = 'myw:';
const ck = (u) => `${PREFIX}checkin:${u}`;
const pk = (u) => `${PREFIX}coupons:${u}`;

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function write(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

export class RewardStore {
  async getCheckin() { throw new Error('not implemented'); }
  async saveCheckin() { throw new Error('not implemented'); }
  async getCoupons() { throw new Error('not implemented'); }
  async addCoupon() { throw new Error('not implemented'); }
  async updateCoupon() { throw new Error('not implemented'); }
}

// v0.5 实现：localStorage。键按 userId 隔离，迁移 BFF 后此文件可整体替换。
export class LocalStore extends RewardStore {
  async getCheckin(userId) {
    return read(ck(userId), { streak: 0, lastDate: null, dates: [] });
  }
  async saveCheckin(userId, data) { write(ck(userId), data); }
  async getCoupons(userId) { return read(pk(userId), []); }
  async addCoupon(userId, coupon) {
    const list = read(pk(userId), []);
    list.unshift(coupon);
    write(pk(userId), list);
  }
  async updateCoupon(userId, id, patch) {
    const list = read(pk(userId), []);
    const i = list.findIndex((c) => c.id === id);
    if (i >= 0) { list[i] = { ...list[i], ...patch }; write(pk(userId), list); }
  }
}

// 当前激活的存储实现（默认 LocalStore，v0.5 原型）。
// v1.5 切换：在应用启动处（且已部署 BFF 后端时）
//   import { setActiveStore } from './store.js';
//   import { BffStore }       from './store.bff.js';
//   setActiveStore(new BffStore({ baseUrl: '/api', getToken: () => auth.sessionToken }));
// 引擎 / 玩法 / 券包通过本文件的 `store` 实时绑定无感切换（ES 模块 live binding），零改动。
export let store = new LocalStore();

// v1.5 切换激活实现——校验必须是 RewardStore 实例（含 LocalStore / BffStore）。
export function setActiveStore(next) {
  if (!next || typeof next.getCheckin !== 'function' || typeof next.getCoupons !== 'function') {
    throw new Error('setActiveStore 需要一个 RewardStore 实例');
  }
  store = next;
}
export function getActiveStore() {
  return store;
}

// 原型期无账号：用一个稳定的演示用户（v1.5 由登录态替换）。
export const DEMO_USER = 'demo-user';
