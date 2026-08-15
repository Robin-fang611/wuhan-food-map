// 探店采集：用户上传店铺 → 后端调高德 Web 服务校验 → 三分支决策 + 持久化。
//
// 红线（见 SPEC §7.4 / §8）：
//  - 高德 Key 仅本模块从 env 读取（AMAP_SERVER_KEY），绝不进前端 / 仓库。
//  - 坐标不伪造：流动摊坐标取自用户上传定位；高德未匹配且非摊类 → 存待核验，不删、不编造。
//  - verified / verified_stall 进「正式库」（独立 merchant-uploads.json，不污染 ALL_MERCHANTS）；pending 进待核验数组。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
// UPLOAD_STORE_FILE 可覆盖存储路径（单测用临时文件；生产/默认走 data/merchant-uploads.json）。
// 惰性读取：调用时才读 env，测试可在 import 后设置临时路径。
function getStoreFile() {
  return process.env.UPLOAD_STORE_FILE || path.join(DATA_DIR, 'merchant-uploads.json');
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// 两点距离（米），Haversine。坐标为 { lng, lat }。
function distMeters(a, b) {
  if (!a || !b || typeof a.lng !== 'number' || typeof b.lng !== 'number') return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// 名称相关性闸门常量：
//  - NAME_MATCH_THRESHOLD：归一化名称相似度 >= 此值才视为「找到该店」。
//  - MAX_MATCH_DIST_METERS：用户提供了定位时，POI 超出此距离视为不同店（不同分店/区域）。
const NAME_MATCH_THRESHOLD = 0.5;
const MAX_MATCH_DIST_METERS = 3000;

// 归一化店名：去空格/标点/括号内的分店注解，去结尾泛化后缀（店/馆/铺…），仅留中英文数字。
const NAME_NOISE_SUFFIX = ['餐饮', '美食', '小吃', '饭店', '餐厅', '餐馆', '饭馆', '酒楼', '商铺', '门店', '店铺', '快餐', '料理', '店', '馆', '铺', '坊', '斋', '堂', '屋'];
function normalizeName(s) {
  if (!s) return '';
  let t = String(s).toLowerCase().trim();
  t = t.replace(/\s+/g, '');
  t = t.replace(/[\(\[（【][^\)\]）】]*[\)\]）】]/g, ''); // 去括号及内部分店注解
  t = t.replace(/[^\p{L}\p{N}]/gu, ''); // 仅留字母数字（含中文）
  for (const suf of NAME_NOISE_SUFFIX) {
    if (t.endsWith(suf) && t.length > suf.length) t = t.slice(0, -suf.length);
  }
  return t;
}

// 字符 bigram 集合（短串退化为单字），用于 Jaccard 相似度。
function charBigrams(s) {
  const set = new Set();
  if (s.length <= 2) { for (const c of s) set.add(c); return set; }
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}
function jaccard(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const sa = charBigrams(a), sb = charBigrams(b);
  let inter = 0; for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// 提交店名 vs 高德 POI 名称的相似度（0~1）。精确=1；一方包含另一方核心串=0.9；否则 bigram Jaccard。
export function nameSimilarity(submitted, poiName) {
  const a = normalizeName(submitted);
  const b = normalizeName(poiName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 2 && b.includes(a)) return 0.9;
  if (b.length >= 2 && a.includes(b)) return 0.9;
  return jaccard(a, b);
}

// 调高德 Web 服务文本搜索（place/text），命中且通过相关性闸门才返回 POI，否则 null。
// 相关性闸门：店名相似度 >= 阈值；若用户提供了定位，POI 须在其 3km 内（避免远处分店误判）。
// fetchImpl 可注入（单测用）；生产走全局 fetch。
export async function verifyWithAmap({ name, address, location, city = '武汉', key, fetchImpl }) {
  const q = (name || '').trim() || (address || '').trim();
  if (!q || !key) return null;
  const doFetch = fetchImpl || fetch;
  const url = `https://restapi.amap.com/v3/place/text?keywords=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&citylimit=true&key=${key}`;
  try {
    const res = await doFetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    if (j.status !== '1' || !Array.isArray(j.pois) || j.pois.length === 0) return null;
    const poi = j.pois[0];
    const [lng, lat] = (poi.location || '').split(',').map(Number);
    if (!lng || !lat) return null;
    // 相关性闸门：店名不相关 → 视为未匹配，避免高德模糊搜索误判为「找到该店」。
    const sim = nameSimilarity(name, poi.name);
    if (sim < NAME_MATCH_THRESHOLD) return null;
    // 提供了定位且 POI 过远 → 视为不同店，落入待核验/摊类分支。
    const dm = distMeters(location, { lng, lat });
    if (dm != null && dm > MAX_MATCH_DIST_METERS) return null;
    const addr = [poi.pname, poi.cityname, poi.adname, poi.address].filter(Boolean).join('');
    return {
      id: poi.id || null,
      name: poi.name,
      address: addr || poi.address || '',
      location: { lng, lat },
      similarity: Number(sim.toFixed(2)),
    };
  } catch {
    return null; // 网络/解析失败 → 视为未匹配，不阻断
  }
}

// 纯决策函数（无网络）：给定高德匹配结果与用户输入，返回三分支决策。
export function decideUpload({ name, address, description, category, isStall, location, amapMatch, amapEnabled = true }) {
  if (amapMatch) {
    const dm = distMeters(location, amapMatch.location);
    return {
      decision: 'verified',
      merchantId: makeId('m'),
      poi: {
        name: amapMatch.name,
        address: amapMatch.address,
        location: amapMatch.location,
        distanceMeters: Number.isFinite(dm) ? dm : null,
      },
    };
  }
  if (isStall) {
    return {
      decision: 'verified_stall',
      merchantId: makeId('m'),
      note: '流动摊/路边摊，坐标取自上传定位',
    };
  }
  return {
    decision: 'pending',
    uploadId: makeId('u'),
    label: '待核验',
    reason: amapEnabled ? '高德未匹配且非摊类' : '高德校验暂未启用，已存待核验',
  };
}

// 持久化：verified/verified_stall → verified 数组；pending → pending 数组（与 ALL_MERCHANTS 分离）。
async function persistUpload(record) {
  if (process.env.MYWO_NO_PERSIST) return; // 单测用：跳过文件 IO
  try {
    if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
    const storeFile = getStoreFile();
    let data = { verified: [], pending: [] };
    if (existsSync(storeFile)) {
      try { data = JSON.parse(await readFile(storeFile, 'utf8')); } catch { data = { verified: [], pending: [] }; }
      if (!Array.isArray(data.verified)) data.verified = [];
      if (!Array.isArray(data.pending)) data.pending = [];
    }
    const entry = { ...record, receivedAt: new Date().toISOString() };
    if (record.decision === 'pending') data.pending.push(entry);
    else data.verified.push(entry);
    await writeFile(storeFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[upload] persist failed:', err && err.message); // 不抛，避免阻断用户
  }
}

// 编排：读 env Key → 调高德 → 决策 → 持久化 → 返回决策。
export async function handleUpload(payload = {}, { amapKey, fetchImpl } = {}) {
  const key = amapKey != null ? amapKey : process.env.AMAP_SERVER_KEY;
  const amapEnabled = !!key;
  const amapMatch = key ? await verifyWithAmap({
    name: payload.name, address: payload.address, location: payload.location, key, fetchImpl,
  }) : null;
  const decision = decideUpload({
    name: payload.name, address: payload.address, description: payload.description,
    category: payload.category, isStall: !!payload.isStall, location: payload.location,
    amapMatch, amapEnabled,
  });
  await persistUpload({ ...decision, source: payload, userId: payload.userId || null });
  return decision;
}

// ——————————————————————————————————————————————
// S5 · pending 上传治理（2026-08-15）
// 能力：待核验列表（脱敏，不输出 userId/原始 source）+ 人工治理（promote 收录 / reject 驳回，
//       均保留审计轨迹，rejected 不硬删——守「不删数据」红线）+ dry-run 预演。
// 存储：merchant-uploads.json 结构扩展为 { verified, pending, rejected, audit }（向后兼容旧文件）。
// ——————————————————————————————————————————————
async function readStore() {
  try {
    const storeFile = getStoreFile();
    if (!existsSync(storeFile)) return { verified: [], pending: [], rejected: [], audit: [] };
    const data = JSON.parse(await readFile(storeFile, 'utf8'));
    return {
      verified: Array.isArray(data.verified) ? data.verified : [],
      pending: Array.isArray(data.pending) ? data.pending : [],
      rejected: Array.isArray(data.rejected) ? data.rejected : [],
      audit: Array.isArray(data.audit) ? data.audit : [],
    };
  } catch {
    return { verified: [], pending: [], rejected: [], audit: [] };
  }
}

async function writeStore(data) {
  if (process.env.MYWO_NO_PERSIST) return;
  try {
    const storeFile = getStoreFile();
    if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
    await writeFile(storeFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[upload] store write failed:', err && err.message);
  }
}

// 治理视图：只暴露人工判断所需字段，不输出 userId / 原始 source（守 PII 红线）。
export function toGovernanceView(entry) {
  const src = entry.source || {};
  return {
    uploadId: entry.uploadId || null,
    name: src.name || entry.name || '',
    address: src.address || '',
    category: src.category || '',
    description: src.description || '',
    location: src.location || null,
    isStall: !!src.isStall,
    reason: entry.reason || '',
    receivedAt: entry.receivedAt || null,
  };
}

// 待核验列表（新→旧）。limit 默认全量；返回 { ok, count, items }。
export async function listPendingUploads({ limit } = {}) {
  const data = await readStore();
  const items = data.pending
    .slice()
    .reverse()
    .map(toGovernanceView);
  const out = typeof limit === 'number' && limit > 0 ? items.slice(0, limit) : items;
  return { ok: true, count: out.length, total: items.length, items: out };
}

// 审计轨迹列表（新→旧，管理后台展示用）。audit 记录仅含 at/action/uploadId/by/note，
// 天然无 PII（不含 userId/联系方式/原始 source），可安全输出。
export async function listAudit({ limit } = {}) {
  const data = await readStore();
  const items = data.audit.slice().reverse();
  const out = typeof limit === 'number' && limit > 0 ? items.slice(0, limit) : items;
  return { ok: true, count: out.length, total: items.length, items: out };
}

// 治理动作：promote（人工确认收录 → verified，标注 governance）/ reject（驳回 → rejected，保留轨迹）。
// dryRun=true 只预演不落盘。by/note 记入审计日志（默认 'admin-cli'）。
export async function governUpload({ uploadId, action = 'promote', dryRun = false, by = 'admin-cli', note = '' } = {}) {
  if (!uploadId) return { ok: false, error: '缺少 uploadId' };
  if (!['promote', 'reject'].includes(action)) return { ok: false, error: 'action 必须是 promote/reject' };
  const data = await readStore();
  const idx = data.pending.findIndex((e) => e.uploadId === uploadId);
  if (idx < 0) return { ok: false, error: '未找到该待核验记录（可能已处理）' };
  const entry = data.pending[idx];
  const audit = { at: new Date().toISOString(), action, uploadId, by, note, dryRun: !!dryRun };
  if (dryRun) {
    return { ok: true, dryRun: true, would: action, uploadId, audit, pendingTotal: data.pending.length };
  }
  data.pending.splice(idx, 1);
  const governed = { ...entry, governance: { action, at: audit.at, by, note } };
  if (action === 'promote') {
    // 人工确认收录：decision 标为 verified（带 governance 标记，区别于自动核验）
    data.verified.push({ ...governed, decision: 'verified', label: '人工收录', reason: note || entry.reason });
  } else {
    data.rejected.push(governed);
  }
  data.audit = data.audit || [];
  data.audit.push(audit);
  await writeStore(data);
  return { ok: true, action, uploadId, by, note, pendingTotal: data.pending.length, audit };
}


// W4：注销账号时删除该用户的上传记录（verified/pending/rejected 中 userId 匹配项；审计保留）
export async function deleteUserUploads(uid) {
  if (!uid) return;
  const data = await readStore();
  const isMine = (e) => (e.userId || (e.source && e.source.userId)) === uid;
  const before = data.verified.length + data.pending.length + data.rejected.length;
  data.verified = data.verified.filter((e) => !isMine(e));
  data.pending = data.pending.filter((e) => !isMine(e));
  data.rejected = data.rejected.filter((e) => !isMine(e));
  const after = data.verified.length + data.pending.length + data.rejected.length;
  if (before !== after) {
    data.audit = data.audit || [];
    data.audit.push({ at: new Date().toISOString(), action: 'delete-user-data', uid, by: 'account-delete' });
    await writeStore(data);
  }
}
