// L3 客户端集成层：把用户自然语言意图发给本地 Agent 运行时，回传 output.food-recommendation，
// 供前端以 h() 安全渲染。
//
// 后端切换（无缝）：
//  - 'local'（默认规则大脑）：指向后端 /run，跑确定性 FSM（无需 LLM）。
//  - 'server'（LLM 大脑，Phase 5 目标）：走 /agent —— 由后端 Agent Loop
//    调 DeepSeek tool_calling 驱动 10 工具。后端在 LLM 不可用时自动降级 /run（前端无感）。
// 基址（LOCAL_AGENT / SERVER_AGENT）：浏览器取 __MANYOUWEI_CONFIG__.apiBase
// （本地开发 = http://127.0.0.1:8799；生产构建 = '/api' 同源反代，见 deploy/static-server.cjs），
// Node 环境兜底 http://127.0.0.1:8799。
//
// 该模块纯 fetch，无 DOM、无 innerHTML，可在浏览器与 Node 同构运行。
// 安全红线：前端永不持有 DeepSeek Key、永不直连模型 API——所有 LLM 调用都在后端中转。

// 基址解析（2026-08-15 修复线上「连不上 Agent 后端」）：
//   - 浏览器：读 h5/src/config.js 注入的 __MANYOUWEI_CONFIG__.apiBase（生产构建 = '/api'，
//     经 deploy/static-server.cjs 同源反代到 :8799，无 CORS、无「连到用户自己电脑」问题）；
//   - Node（测试/CLI）/ 本地未配置：兜底本机 8799 直连。
function resolveAgentBase() {
  try {
    const cfg = globalThis.__MANYOUWEI_CONFIG__;
    if (cfg && typeof cfg.apiBase === 'string' && cfg.apiBase) return cfg.apiBase;
  } catch { /* ignore */ }
  return 'http://127.0.0.1:8799';
}
const LOCAL_AGENT = resolveAgentBase();
const SERVER_AGENT = resolveAgentBase();
// 默认 'local'（2026-08-15 Robin 拍板：方案 B——确定性脚本模拟推理为主）：
//  - local：走 /run 确定性 FSM（关键词→数据库检索→推荐），秒回、零成本、零网络依赖，
//    返回完整推理时间线（intake→filter→geo→rank→decide→why）可审计可复现；
//  - server：走 /agent LLM 大脑（DeepSeek ReAct），增强情境理解；网络/密钥稳定后可 setBackend('server') 启用。
let BACKEND = 'local';
const FETCH_TIMEOUT_MS = 45000; // /agent 多轮 ReAct 可能耗时较长

export function setBackend(b) { BACKEND = b === 'server' ? 'server' : 'local'; }
export function getBackend() { return BACKEND; }
function base() { return BACKEND === 'server' ? SERVER_AGENT : LOCAL_AGENT; }
function agentPath() { return BACKEND === 'server' ? '/agent' : '/run'; }

// 带超时的 fetch，避免网络不可达时无限挂起。
async function fetchWithTimeout(url, init = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// task.food-discovery（规则大脑 /run）：发意图，拿 output.food-recommendation。
// 超时 30s：后端 /run 内部有 25s LLM 升级护栏（httpServer.js），前端超时必须大于它，
// 否则健康语义/模糊表达触发升级时会被前端提前 abort，误报「连不上后端」。
export async function discover(input = {}) {
  const res = await fetchWithTimeout(`${base()}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, 30000);
  if (!res.ok) throw new Error(`agent /run ${res.status}`);
  return res.json(); // { success, output:{ merchants, summary } }
}

// LLM 大脑 /agent：多轮对话 + 记忆。返回 { success, output, fallback?, fallbackReason? }。
export async function agentChat({ message, sessionId = 'anon', history = [] } = {}) {
  const res = await fetchWithTimeout(`${SERVER_AGENT}/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId, history }),
  }, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`agent /agent ${res.status}`);
  return res.json();
}

// 后端化口味档案（按 sessionId 隔离）。
export async function getMemory(sessionId = 'anon') {
  const res = await fetch(`${SERVER_AGENT}/memory/${encodeURIComponent(sessionId)}`, { method: 'GET' });
  if (!res.ok) throw new Error(`memory get ${res.status}`);
  const j = await res.json();
  return j.profile || {};
}
export async function updateMemory(sessionId = 'anon', patch = {}) {
  const res = await fetch(`${SERVER_AGENT}/memory/${encodeURIComponent(sessionId)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`memory post ${res.status}`);
  const j = await res.json();
  return j.profile || {};
}
export async function clearMemory(sessionId = 'anon') {
  const res = await fetch(`${SERVER_AGENT}/memory/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`memory delete ${res.status}`);
  return res.json();
}

// 本地会话 JWT（W5：写操作服务端从 JWT 解析本人；未登录则不带凭证 → 后端拒绝并引导登录）
function sessionAuthHeader() {
  try {
    const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem('myw:auth:session') : null;
    if (!raw) return {};
    const u = JSON.parse(raw);
    if (u && u.token && String(u.token).split('.').length === 3) return { Authorization: 'Bearer ' + u.token };
  } catch { /* ignore */ }
  return {};
}

// reward.checkin：经 Agent 治理的本人签到得券（Engage 状态，JWT 鉴权）。
export async function checkin() {
  const res = await fetch(`${base()}/tools/reward.checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionAuthHeader() },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`agent checkin ${res.status}`);
  return res.json();
}

// user.favorite：经 Agent 治理的本人收藏/取消（Engage 状态，幂等，JWT 鉴权）。
export async function favorite({ merchantId, action = 'add' } = {}) {
  const res = await fetch(`${base()}/tools/user.favorite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionAuthHeader() },
    body: JSON.stringify({ merchantId, action }),
  });
  if (!res.ok) throw new Error(`agent favorite ${res.status}`);
  return res.json();
}

// reward.claim：经 Agent 治理的本人领商家券（Engage 状态，每商家每用户限 1，幂等，JWT 鉴权）。
export async function claim({ merchantId, merchantName, summary } = {}) {
  const res = await fetch(`${base()}/tools/reward.claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionAuthHeader() },
    body: JSON.stringify({ merchantId, merchantName, summary }),
  });
  if (!res.ok) throw new Error(`agent claim ${res.status}`);
  return res.json();
}

// reward.view-wallet：经 Agent 治理的查看本人券包（仅本人，无 PII 回显，JWT 鉴权）。
export async function viewWallet() {
  const res = await fetch(`${base()}/tools/reward.view-wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionAuthHeader() },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`agent viewWallet ${res.status}`);
  return res.json();
}

// 探店采集：用户上传店铺 → 后端 /upload（高德校验三分支：verified / verified_stall / pending）。
export async function uploadShop(payload = {}) {
  const res = await fetchWithTimeout(`${SERVER_AGENT}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 20000);
  if (!res.ok) throw new Error(`upload ${res.status}`);
  return res.json();
}
