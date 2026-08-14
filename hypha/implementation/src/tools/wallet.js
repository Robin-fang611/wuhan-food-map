// reward.view-wallet —— 薄绑 core/store.js:getCoupons（仅本人）
// W5（2026-08-15）：JWT 鉴权——服务端从 token 解析本人，忽略客户端 userId（防越权）。
import { store } from '../runtime.js';
import { resolveUserId } from './_identity.js';

function projectCoupon(c) {
  return {
    id: c.id,
    code: c.code,
    play_type: c.play_type,
    title: c.title,
    discount_desc: c.discount_desc,
    amount: c.amount,
    merchant_id: c.merchant_id ?? null,
    status: c.status,
    issued_at: c.issued_at,
    expires_at: c.expires_at,
  };
}

export default async function rewardWallet(input = {}) {
  const id = resolveUserId(input);
  if (!id.ok) return { success: false, error: id.error, code: 'UNAUTHORIZED' };
  const userId = id.uid;
  const coupons = await store.getCoupons(userId);
  // 不回显 userId（守 data.export-pii 红线）：券列表本身不含 user_id（projectCoupon 已剥离）。
  return {
    success: true,
    output: { count: coupons.length, coupons: coupons.map(projectCoupon) },
  };
}
