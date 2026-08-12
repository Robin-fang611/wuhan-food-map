// reward.claim —— 薄绑 plays/claim.js:claimPlugin.participate + couponIssuer 发券（每商家每用户限1，幂等）
import { claimPlugin, store } from '../runtime.js';

function projectCoupon(c) {
  // 不回显 user_id（守 data.export-pii 红线）；保留与券票展示相关的非 PII 字段。
  return {
    id: c.id,
    code: c.code,
    play_type: c.play_type,
    title: c.title,
    discount_desc: c.discount_desc,
    amount: c.amount,
    merchant_id: c.merchant_id ?? null,
    status: c.status,
    expires_at: c.expires_at,
  };
}

export default async function rewardClaim(input = {}) {
  const { userId, merchantId, merchantName, summary } = input;
  if (!userId) return { success: false, error: '缺少 userId' };
  if (!merchantId) return { success: false, error: '缺少 merchantId' };
  const gate = await claimPlugin.canParticipate(userId, { merchantId, merchantName, summary });
  if (!gate.allowed) {
    // 已领该商家券：幂等返回当前状态 + 已得券（不发新券）。
    const status = await claimPlugin.getStatus(userId, { merchantId });
    const coupons = (await store.getCoupons(userId))
      .filter((c) => c.play_type === 'claim' && c.merchant_id === merchantId)
      .map(projectCoupon);
    return { success: true, output: { status, coupons, idempotent: true, hint: gate.reason } };
  }
  const r = await claimPlugin.participate(userId, { merchantId, merchantName, summary });
  return {
    success: true,
    output: {
      status: r.status,
      coupons: (r.coupons || []).map(projectCoupon),
      idempotent: false,
    },
  };
}
