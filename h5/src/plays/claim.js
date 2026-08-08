// 玩法插件：直接领商家券（v2 预留玩法，本轮落地；对应 §4.3 商户详情页领券按钮）。
// 实现 PlayPlugin 契约。ctx 须带 merchantId / merchantName / summary（由商户详情页传入）。
// 设计要点（防刷，见 §8）：每个商家每用户限领 1 张（按 merchant_id + play_type 去重）。
import { store } from '../core/store.js';
import { issueCoupon } from '../core/couponIssuer.js';
import { CLAIM_DEFAULT } from '../data/couponCatalog.js';
import { ClaimPanel } from '../ui/claimPanel.js';

export const claimPlugin = {
  id: 'claim',
  name: '商家券',
  desc: '在商户详情页一键领取该商家专属券',

  // 当前进度：是否已领该商家券
  async getStatus(userId, ctx = {}) {
    const mid = ctx && ctx.merchantId;
    const claimed = (await store.getCoupons(userId)).some(
      (c) => c.play_type === 'claim' && c.merchant_id === mid && c.status === '已得'
    );
    return { claimed, merchantId: mid };
  },

  // 资格校验：缺商户信息 / 已领 → 拒绝
  async canParticipate(userId, ctx = {}) {
    if (!ctx || !ctx.merchantId) return { allowed: false, reason: '缺少商户信息' };
    const st = await this.getStatus(userId, ctx);
    if (st.claimed) return { allowed: false, reason: '该商家券已领取~' };
    return { allowed: true };
  },

  // 执行领券：发绑定该商家的券
  async participate(userId, ctx = {}) {
    const gate = await this.canParticipate(userId, ctx);
    if (!gate.allowed) return { ok: false, reason: gate.reason };
    const mid = ctx.merchantId;
    const mname = ctx.merchantName || '商家';
    const summary = ctx.summary || '到店出示二维码立享专属优惠';
    const coupon = await issueCoupon(userId, {
      title: `${mname} ${CLAIM_DEFAULT.titleSuffix}`,
      discountDesc: summary,
      playType: 'claim',
      amount: CLAIM_DEFAULT.amount,
      merchantId: mid,
      validDays: 30
    });
    return { ok: true, status: { claimed: true, merchantId: mid }, coupons: [coupon] };
  },

  render(ctx) { return ClaimPanel(ctx); }
};
