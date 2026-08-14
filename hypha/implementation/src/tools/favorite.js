// user.favorite —— S4（2026-08-15）：服务端从 JWT 解析用户，忽略客户端传入 userId（防越权）。
// 收藏持久化 data/favorites.json（gitignored、原子写 tmp+rename）；
// 未提供有效 JWT → 拒绝（前端 LocalStore 兜底，见 h5/src/core/auth.js）。
// 输出绝不回显 userId（守 data.export-pii 红线）。
import { verifyJwt } from '../auth-server.js';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.AUTH_DATA_DIR || path.resolve(__dirname, '..', 'data');
const FAV_FILE = path.join(DATA_DIR, 'favorites.json');

// uid -> Set(merchantId)
const byUser = new Map();

function loadFavorites() {
  try {
    if (!existsSync(FAV_FILE)) return;
    const raw = JSON.parse(readFileSync(FAV_FILE, 'utf8'));
    if (!raw || !raw.byUser) return;
    for (const [uid, ids] of Object.entries(raw.byUser)) {
      if (Array.isArray(ids)) byUser.set(uid, new Set(ids));
    }
  } catch {
    // 文件缺失/损坏：静默降级为空收藏（原型语义，不阻断启动）
  }
}
loadFavorites();

function persistFavorites() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      byUser: Object.fromEntries([...byUser].map(([u, s]) => [u, [...s]])),
    };
    const tmp = FAV_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    renameSync(tmp, FAV_FILE);
  } catch (err) {
    // 磁盘失败不阻断收藏操作（原型语义）
    // eslint-disable-next-line no-console
    console.warn('[favorite] 持久化失败（继续内存运行）:', String(err && err.message || err));
  }
}

export default async function userFavorite(input = {}) {
  const { merchantId, action = 'add' } = input;
  // 身份仅取服务端可验证的 JWT（httpServer 会把 Authorization: Bearer 注入为 input.token）；
  // 客户端传入的任何 userId 一律忽略（防越权：服务端以 JWT 重新解析本人）。
  const token = input.token || input._authToken || '';
  const payload = verifyJwt(token);
  if (!payload || !payload.sub) {
    return { success: false, error: '请先登录（收藏已云端同步，需要登录凭证）', code: 'UNAUTHORIZED' };
  }
  const uid = payload.sub;

  // list：取本人收藏（供设备 B / 账号中心同步）
  if (action === 'list') {
    return { success: true, output: { ok: true, favorites: [...(byUser.get(uid) || [])] } };
  }

  if (!merchantId) return { success: false, error: '缺少 merchantId' };
  if (!['add', 'remove'].includes(action)) return { success: false, error: 'action 必须是 add/remove/list' };

  const set = byUser.get(uid) || new Set();
  if (action === 'add') set.add(merchantId);
  else set.delete(merchantId);
  byUser.set(uid, set);
  persistFavorites();
  return { success: true, output: { ok: true, favorited: action === 'add', favorites: [...set] } };
}
