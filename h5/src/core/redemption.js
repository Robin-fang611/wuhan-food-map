// 优惠券核销引擎（M14，v1.5 核销后台）。
// 角色：商家侧核销台的核心逻辑——按券码查找券、幂等标记已用。
//
// 复用与边界（守 §13.1 / §8）：
//  - 不直接改 RewardStore 的 5 方法契约（引擎/玩法/券包零改动），只在其之上做"核销"语义。
//  - 查找按券码全局定位（商家只有券码，不知 user_id）；v0.5 原型扫描 LocalStore 的券桶
//    （myw:coupons:*），v1.5 由 BFF 服务端按 code 全局查（见 BFF接口契约 §4：忽略客户端
//    userId、服务端幂等核销）。
//  - 不持有任何密钥；不写不可测的网络分支（真实扫码/微信属 v1.5，留接口）。

import { store } from './store.js';

const COUPON_PREFIX = 'myw:coupons:';

// 输入归一：去空白、转大写、仅保留字母数字与连字符（券码形如 MYW-XXXX-XXXX）。
export function normalizeCode(raw) {
  if (raw == null) return '';
  return String(raw).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

// 纯函数：核销资格判定（幂等 + 过期）。返回 { ok, reason }。
export function canRedeem(coupon, now = Date.now()) {
  if (!coupon || typeof coupon !== 'object') return { ok: false, reason: '券不存在' };
  if (coupon.status === '已核销') return { ok: false, reason: '该券已核销，不可重复核销' };
  if (coupon.status === '已过期') return { ok: false, reason: '该券已过期' };
  if (typeof coupon.expires_at === 'number' && coupon.expires_at <= now) {
    return { ok: false, reason: '该券已过期' };
  }
  return { ok: true, reason: '' };
}

// 收集本地所有用户券桶（v0.5 原型；v1.5 由 BFF 服务端全局查）。
function collectAllCoupons() {
  const out = [];
  if (typeof localStorage === 'undefined') return out;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(COUPON_PREFIX)) {
      try {
        const list = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(list)) out.push(...list);
      } catch { /* 跳过损坏桶 */ }
    }
  }
  return out;
}

export function findCouponByCode(code) {
  const norm = normalizeCode(code);
  if (!norm) return null;
  return collectAllCoupons().find((c) => normalizeCode(c.code) === norm) || null;
}

// 核销主流程：幂等标记已用。
// opts.now 可注入（测试）；opts.operator 为可选商家标识（v1.5 由会话注入，原型可空）。
export async function redeem(code, opts = {}) {
  const now = opts.now ?? Date.now();
  const coupon = findCouponByCode(code);
  const check = canRedeem(coupon, now);
  if (!check.ok) return { ok: false, reason: check.reason, coupon: coupon || null };
  const patch = { status: '已核销', redeemed_at: now };
  // v1.5：服务端按已验证商家会话记录 redeemed_by；原型不持密钥，仅留字段位。
  if (opts.operator) patch.redeemed_by = opts.operator;
  await store.updateCoupon(coupon.user_id, coupon.id, patch);
  return { ok: true, reason: '核销成功', coupon: { ...coupon, ...patch } };
}
