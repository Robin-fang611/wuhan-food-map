// L3 客户端集成层：把用户自然语言意图发给本地 Agent 运行时，回传 output.food-recommendation，
// 供前端以 h() 安全渲染。
//
// 后端切换（无缝）：
//  - 'local'（默认规则大脑）：指向本机后端（:8799）/run，跑确定性 FSM（无需 LLM）。
//  - 'server'（LLM 大脑，Phase 5 目标）：同样指向 :8799，但走 /agent —— 由后端 Agent Loop
//    调 DeepSeek tool_calling 驱动 10 工具。后端在 LLM 不可用时自动降级 /run（前端无感）。
//
// 该模块纯 fetch，无 DOM、无 innerHTML，可在浏览器与 Node 同构运行。
// 安全红线：前端永不持有 DeepSeek Key、永不直连模型 API——所有 LLM 调用都在 :8799 后端中转。

const LOCAL_AGENT = 'http://127.0.0.1:8799';
const SERVER_AGENT = 'http://127.0.0.1:8799';
let BACKEND = 'server'; // Phase 5 默认走 LLM 大脑；后端无 Key 时自动降级，体验无感。
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
export async function discover(input = {}) {
  const res = await fetchWithTimeout(`${base()}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, 15000);
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

// reward.checkin：经 Agent 治理的本人签到得券（Engage 状态）。
export async function checkin(userId) {
  const res = await fetch(`${base()}/tools/reward.checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(`agent checkin ${res.status}`);
  return res.json();
}

// user.favorite：经 Agent 治理的本人收藏/取消（Engage 状态，幂等）。
export async function favorite({ merchantId, action = 'add', userId } = {}) {
  const res = await fetch(`${base()}/tools/user.favorite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchantId, action, userId }),
  });
  if (!res.ok) throw new Error(`agent favorite ${res.status}`);
  return res.json();
}

// reward.claim：经 Agent 治理的本人领商家券（Engage 状态，每商家每用户限 1，幂等）。
export async function claim({ userId, merchantId, merchantName, summary } = {}) {
  const res = await fetch(`${base()}/tools/reward.claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, merchantId, merchantName, summary }),
  });
  if (!res.ok) throw new Error(`agent claim ${res.status}`);
  return res.json();
}

// reward.view-wallet：经 Agent 治理的查看本人券包（仅本人，无 PII 回显）。
export async function viewWallet({ userId } = {}) {
  const res = await fetch(`${base()}/tools/reward.view-wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
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
