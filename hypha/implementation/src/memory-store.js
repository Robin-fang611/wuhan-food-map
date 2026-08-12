// 后端化口味档案（长期记忆）——按会话 id 隔离，存自有后端（本地文件），不进第三方、不落前端包。
//
// 隐私红线（对齐 PRODUCT-REQUIREMENTS.md §3.3）：仅存储「行为推导」的口味偏好
//（zone / mealTime / category / maxPrice / spice / dislikes / notes），**不采集任何 PII**
//（无姓名 / 学号 / 手机号）。用户可一键清除（clearProfile）。
//
// 设计：进程内 Map 做热缓存 + 本地 JSON 文件做持久化（server 重启不丢）。路径在
// 项目内 .agent-memory/（已被 .gitignore 忽略，不会进仓库）。浏览器侧只持有 sessionId，
// 绝不持有档案内容本身。

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEM_DIR = join(__dirname, '..', '.agent-memory');
const ALLOWED_KEYS = ['zone', 'mealTime', 'category', 'maxPrice', 'spice', 'dislikes', 'notes'];

const _hot = new Map();

function fileFor(sessionId) {
  // sessionId 仅作文件名，做基础净化避免路径穿越。
  const safe = String(sessionId || 'anon').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  return join(MEM_DIR, `${safe}.json`);
}

function emptyProfile() {
  return { zone: null, mealTime: [], category: null, maxPrice: null, spice: null, dislikes: [], notes: '' };
}

export function getProfile(sessionId) {
  const sid = sessionId || 'anon';
  if (_hot.has(sid)) return _hot.get(sid);
  const f = fileFor(sid);
  let p = emptyProfile();
  if (existsSync(f)) {
    try {
      const raw = JSON.parse(readFileSync(f, 'utf8'));
      p = { ...p, ...raw };
    } catch { /* 损坏则回退空档案 */ }
  }
  _hot.set(sid, p);
  return p;
}

// 部分更新（只接受白名单字段）。返回合并后的档案。
export function upsertProfile(sessionId, patch = {}) {
  const p = getProfile(sessionId);
  for (const k of ALLOWED_KEYS) {
    if (k in patch && patch[k] != null) {
      // 数组字段做去重净化；标量字段直接覆盖。
      if (Array.isArray(p[k])) p[k] = Array.isArray(patch[k]) ? [...new Set(patch[k])] : p[k];
      else p[k] = patch[k];
    }
  }
  _hot.set(sessionId || 'anon', p);
  try {
    if (!existsSync(MEM_DIR)) mkdirSync(MEM_DIR, { recursive: true });
    writeFileSync(fileFor(sessionId || 'anon'), JSON.stringify(p, null, 2), 'utf8');
  } catch { /* 持久化失败不阻塞主流程（热缓存仍在） */ }
  return p;
}

export function clearProfile(sessionId) {
  const sid = sessionId || 'anon';
  _hot.delete(sid);
  const f = fileFor(sid);
  if (existsSync(f)) {
    try { rmSync(f); } catch { /* ignore */ }
  }
  return true;
}

// 把档案格式化为系统提示片段（注入 LLM，帮助「越用越懂你」）。
export function profileToSystemText(p) {
  if (!p) return '';
  const parts = [];
  if (p.zone) parts.push(`常去片区：${p.zone}`);
  if (Array.isArray(p.mealTime) && p.mealTime.length) parts.push(`常去场景：${p.mealTime.join('/')}`);
  if (p.category) parts.push(`偏好分类：${p.category}`);
  if (typeof p.maxPrice === 'number') parts.push(`预算上限：人均约 ¥${p.maxPrice}`);
  if (p.spice) parts.push(`辣度：${p.spice}`);
  if (Array.isArray(p.dislikes) && p.dislikes.length) parts.push(`忌口：${p.dislikes.join('/')}`);
  if (p.notes) parts.push(`补充：${p.notes}`);
  return parts.length ? `【用户口味档案】${parts.join('；')}。` : '';
}
