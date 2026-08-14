// reward.checkin —— 薄绑 plays/checkin.js:checkinPlugin.participate + couponIssuer 发券（同日幂等）
// W5（2026-08-15）：JWT 鉴权——服务端从 token 解析本人，忽略客户端 userId（防越权）。
import { checkinPlugin } from '../runtime.js';
import { resolveUserId } from './_identity.js';

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

export default async function rewardCheckin(input = {}) {
  const id = resolveUserId(input);
  if (!id.ok) return { success: false, error: id.error, code: 'UNAUTHORIZED' };
  const userId = id.uid;
  const gate = await checkinPlugin.canParticipate(userId);
  if (!gate.allowed) {
    // 同日已签：幂等返回当前状态 + 已得券（不发新券）。
    const status = await checkinPlugin.getStatus(userId);
    const { store } = await import('../runtime.js');
    const coupons = (await store.getCoupons(userId)).filter((c) => c.play_type === 'checkin').map(projectCoupon);
    return { success: true, output: { status, coupons, idempotent: true, hint: gate.reason } };
  }
  const r = await checkinPlugin.participate(userId);
  return {
    success: true,
    output: {
      status: { streak: r.status.streak, signedToday: r.status.signedToday, lastDate: r.status.lastDate },
      coupons: (r.coupons || []).map(projectCoupon),
      bonus: r.bonus === true,
    },
  };
}
