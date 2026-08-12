// user.favorite —— 薄绑 core/auth.js:LocalAuthProvider.addFavorite/removeFavorite（幂等，按本人）
import { authForUser } from '../runtime.js';

export default async function userFavorite(input = {}) {
  const { merchantId, action = 'add', userId } = input;
  if (!merchantId) return { success: false, error: '缺少 merchantId' };
  if (!['add', 'remove'].includes(action)) return { success: false, error: 'action 必须是 add/remove' };
  const uid = userId || 'demo-user';
  const auth = authForUser(uid);
  const res = action === 'add' ? await auth.addFavorite(merchantId) : await auth.removeFavorite(merchantId);
  if (!res.ok) return { success: false, error: res.reason };
  // 不回显 userId（守 data.export-pii 红线）：调用方即本人，无需回显身份。
  return { success: true, output: { ok: true, favorited: res.favorited } };
}
