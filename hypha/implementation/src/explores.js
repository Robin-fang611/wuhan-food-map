// 用户探店众包（2026-08-15 · Robin 决策：产品内开辟探店功能，众包补全 500+ 家 estimated 数据）
// 流程：用户对「资料待核验」的店提交探店记录 → pending（带 attest 承诺 + 限频）→ 管理员审核 →
//       promote 后生成 enrichment-explore.json（id 键覆盖）→ normalize-data.mjs 重新生成 merchants.js 升级数据。
// 防伪造：attest='yes' 必填（承诺真实）；每用户每天 ≤10 条；管理员审核门禁；来源标注 user-explore。
// 存储：data/explores.json（gitignored，结构 { pending, verified, rejected, audit }）。
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.AUTH_DATA_DIR || path.resolve(__dirname, '..', 'data');
const EXPLORES_FILE = process.env.EXPLORES_STORE_FILE || path.join(DATA_DIR, 'explores.json');
// EXPLORE_ENRICH_FILE 可覆盖（测试用临时文件）；默认写 assets/foodmap-data/enrichment-explore.json（normalize 时合并生效）
const ENRICH_FILE = process.env.EXPLORE_ENRICH_FILE
  || path.resolve(__dirname, '..', '..', '..', '..', 'assets', 'foodmap-data', 'enrichment-explore.json');

const RATING_ALLOWED = ['必吃', '推荐', '一般'];
const DAILY_LIMIT = 10;

function readStore() {
  try {
    if (!existsSync(EXPLORES_FILE)) return { pending: [], verified: [], rejected: [], audit: [] };
    const d = JSON.parse(readFileSync(EXPLORES_FILE, 'utf8'));
    return {
      pending: Array.isArray(d.pending) ? d.pending : [],
      verified: Array.isArray(d.verified) ? d.verified : [],
      rejected: Array.isArray(d.rejected) ? d.rejected : [],
      audit: Array.isArray(d.audit) ? d.audit : [],
    };
  } catch { return { pending: [], verified: [], rejected: [], audit: [] }; }
}
function writeStore(d) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = EXPLORES_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf8');
    renameSync(tmp, EXPLORES_FILE);
  } catch { /* ignore */ }
}

function isMine(d, uid) {
  return d.uid === uid || d.userId === uid || (d.source && d.source.userId) === uid;
}

// 用户提交探店记录（JWT 鉴权 + attest 承诺 + 每日限频）
export async function submitExplore({ merchantId, rating, recommendDishes = '', avgPrice = '', taste = '', location = null, note = '', attest = '', token = '', merchantName = '' } = {}) {
  const { verifyJwt } = await import('./auth-server.js');
  const payload = verifyJwt(token);
  if (!payload || !payload.sub) return { success: false, error: '请先登录（探店记录需要登录）', code: 'UNAUTHORIZED' };
  const uid = payload.sub;
  if (!merchantId) return { success: false, error: '缺少商户' };
  if (!RATING_ALLOWED.includes(rating)) return { success: false, error: '评分需为 必吃/推荐/一般' };
  if (attest !== 'yes') return { success: false, error: '请勾选「我实地去过并承诺信息真实」' };
  const store = readStore();
  // 每日限频：该用户当天 pending+verified 数
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = [...store.pending, ...store.verified].filter((d) => isMine(d, uid) && String(d.createdAt || '').startsWith(today)).length;
  if (todayCount >= DAILY_LIMIT) return { success: false, error: `今日探店提交已达上限（${DAILY_LIMIT} 条）` };
  // 重复提交（同一用户同商户 pending 中）
  if (store.pending.some((d) => isMine(d, uid) && d.merchantId === merchantId)) {
    return { success: false, error: '你已提交过该店的探店记录，待审核中' };
  }
  const entry = {
    id: 'x_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    uid, merchantId, merchantName: merchantName || '',
    rating, recommendDishes: String(recommendDishes).slice(0, 100),
    avgPrice: String(avgPrice).slice(0, 20), taste: String(taste).slice(0, 40),
    location: location || null, note: String(note).slice(0, 200),
    attest: 'yes', createdAt: new Date().toISOString(),
  };
  store.pending.push(entry);
  writeStore(store);
  return { success: true, output: { ok: true, exploreId: entry.id } };
}

// 治理视图（脱敏：不含 uid）
export function exploreGovView(d) {
  return { id: d.id, merchantId: d.merchantId, merchantName: d.merchantName, rating: d.rating, recommendDishes: d.recommendDishes, avgPrice: d.avgPrice, taste: d.taste, note: d.note, createdAt: d.createdAt };
}
export async function listPendingExplores() {
  const store = readStore();
  return { ok: true, count: store.pending.length, items: store.pending.map(exploreGovView) };
}

// 管理员审核：promote → 合并进 enrichment-explore.json（id 键覆盖，normalize 时生效）；reject → 保留轨迹
export async function governExplore({ exploreId, action = 'promote', by = 'admin-cli', note = '' } = {}) {
  if (!exploreId) return { ok: false, error: '缺少 exploreId' };
  if (!['promote', 'reject'].includes(action)) return { ok: false, error: 'action 必须是 promote/reject' };
  const store = readStore();
  const idx = store.pending.findIndex((d) => d.id === exploreId);
  if (idx < 0) return { ok: false, error: '未找到该探店记录（可能已处理）' };
  const entry = store.pending[idx];
  store.pending.splice(idx, 1);
  const audit = { at: new Date().toISOString(), action, exploreId, by, note };
  if (action === 'promote') {
    store.verified.push({ ...entry, governance: { action: 'promote', at: audit.at, by } });
    mergeIntoEnrichment(entry); // 生成/合并覆盖 → normalize 时升级数据
  } else {
    store.rejected.push({ ...entry, governance: { action: 'reject', at: audit.at, by, note } });
  }
  store.audit.push(audit);
  writeStore(store);
  return { ok: true, action, exploreId, pendingTotal: store.pending.length, audit };
}

// 合并覆盖：按 merchantId 写 enrichment-explore.json（供 normalize-data.mjs loadEnrichment 合并）
function mergeIntoEnrichment(entry) {
  try {
    let base = {};
    if (existsSync(ENRICH_FILE)) base = JSON.parse(readFileSync(ENRICH_FILE, 'utf8'));
    const override = {};
    if (entry.rating) override.rating = entry.rating;
    if (entry.recommendDishes) override.recommendDishes = entry.recommendDishes;
    if (entry.avgPrice) override.avgPrice = entry.avgPrice;
    if (entry.taste) override.taste = entry.taste;
    if (entry.location && typeof entry.location.lng === 'number') { override.lng = entry.location.lng; override.lat = entry.location.lat; }
    override.dataConfidence = 'verified';
    override.source = 'user-explore';
    override.exploredAt = entry.createdAt;
    base[entry.merchantId] = { ...(base[entry.merchantId] || {}), ...override };
    mkdirSync(path.dirname(ENRICH_FILE), { recursive: true });
    writeFileSync(ENRICH_FILE, JSON.stringify(base, null, 2), 'utf8');
  } catch { /* ignore */ }
}
