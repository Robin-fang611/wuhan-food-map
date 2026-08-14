// 共享身份解析（W5 · 2026-08-15）
// 所有写操作工具（checkin/claim/wallet/favorite）统一从这里取用户：
//  - 身份只认服务端可验证的 JWT（httpServer 会把 Authorization: Bearer 注入为 input.token）；
//  - 客户端传入的任何 userId 一律忽略（防越权）；
//  - 未登录写操作 → 拒绝（前端引导登录或回落本地原型）。
import { verifyJwt } from '../auth-server.js';

export function resolveUserId(input = {}) {
  const token = input.token || input._authToken || '';
  const payload = verifyJwt(token);
  if (!payload || !payload.sub) {
    return { ok: false, error: '请先登录（该操作需要登录凭证）', code: 'UNAUTHORIZED' };
  }
  return { ok: true, uid: payload.sub };
}
