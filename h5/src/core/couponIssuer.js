// CouponIssuer —— 统一发券。所有玩法（签到/抽奖/任务/直接领）都通过它发券，
// 保证券记录结构一致，且与 §4.3 核销闭环、§5 user_coupons 表对齐。
import { store } from './store.js';
import { uid, couponCode } from '../utils/id.js';

const DEFAULT_VALID_DAYS = 30;

/**
 * @param {string} userId
 * @param {object} spec
 *   title        券标题（如「满20减3 通用券」）
 *   discountDesc 折扣说明（如「到店出示二维码，满20立减3元」）
 *   playType     来源玩法 id（checkin/lottery/task/claim）
 *   amount       票面金额（元），用于券票左侧展示
 *   validDays    有效期天数，默认 30
 *   merchantId   绑定商家 id（通用券为 null）
 */
export async function issueCoupon(userId, spec) {
  const now = Date.now();
  const validDays = spec.validDays ?? DEFAULT_VALID_DAYS;
  const coupon = {
    id: uid('c_'),
    user_id: userId,
    code: couponCode(),
    play_type: spec.playType,
    title: spec.title,
    discount_desc: spec.discountDesc,
    amount: spec.amount ?? 0,
    merchant_id: spec.merchantId ?? null,
    status: '已得',                 // 已得 | 已核销 | 已过期
    issued_at: now,
    expires_at: now + validDays * 86400000,
    redeemed_at: null
  };
  await store.addCoupon(userId, coupon);
  return coupon;
}

// 过期判定（前端展示用；核销侧以服务端时间为准）
export function isExpired(coupon, now = Date.now()) {
  return coupon.status !== '已核销' && coupon.expires_at <= now;
}

// 票号条文本（呼应 Logo 票号「NO. WH-0279 · 真实探店 · 通用券」）
export function ticketNo(coupon) {
  const seq = coupon.code.replace(/[^A-Z0-9]/g, '').slice(-4);
  const type = coupon.merchant_id ? '商家券' : '通用券';
  return `NO. WH-${seq} · 真实探店 · ${type}`;
}
