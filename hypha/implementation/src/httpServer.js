// 蛮有味·美食发现 Agent —— 自有 Node 后端（Path B）。监听 :8799，暴露：
//   POST /health            探针（10 工具 + 模式）
//   POST /run               确定性 FSM（Intake→Discover→Completed）→ output.food-recommendation
//   POST /agent             LLM 大脑（DeepSeek ReAct tool_calling）；LLM 不可用时自动降级 /run（R1 熔断）
//   POST /tools/:id         单工具调用（10 个领域工具 adapter）
//   GET/POST/DELETE /memory/:sessionId   后端化口味档案读写/清除（R5）
//
// 红线：DeepSeek Key 仅由 deepseek.js 从 env 读取，本文件不持有；前端永不直连模型 API。
import { createServer } from 'node:http';

import { runFoodDiscovery } from './orchestrator.js';
import { agentChat, AgentFallbackError } from './agent-loop.js';
import { getProfile, upsertProfile, clearProfile } from './memory-store.js';
import discoverFilter from './tools/filter.js';
import discoverRank from './tools/rank.js';
import discoverDetail from './tools/detail.js';
import discoverGeo from './tools/geo.js';
import discoverNavigate from './tools/navigate.js';
import userFavorite from './tools/favorite.js';
import rewardCheckin from './tools/checkin.js';
import rewardWallet from './tools/wallet.js';
import rewardClaim from './tools/claim.js';
import analyticsTrack from './tools/track.js';

// 工具表：id -> handler（对齐 domain.yaml 的 10 个 ToolSpec）。
const TOOLS = {
  'discover.filter': discoverFilter,
  'discover.rank': discoverRank,
  'discover.detail': discoverDetail,
  'discover.geo': discoverGeo,
  'discover.navigate': discoverNavigate,
  'user.favorite': userFavorite,
  'reward.checkin': rewardCheckin,
  'reward.view-wallet': rewardWallet,
  'reward.claim': rewardClaim,
  'analytics.track': analyticsTrack,
};

// :8788 已被占用；Path B 工具服务固定用 :8799（MYWO_PORT 可覆盖）。
const PORT = process.env.MYWO_PORT ? Number(process.env.MYWO_PORT) : 8799;
const LLM_ENABLED = !!process.env.DEEPSEEK_API_KEY;

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(raw.trim() ? JSON.parse(raw) : {}); }
      catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

const server = createServer(async (req, res) => {
  // CORS（供本地前端跨进程调用）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
  if (req.method === 'OPTIONS') return send(res, 204, {});

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // POST /health
  if (req.method === 'POST' && url.pathname === '/health') {
    return send(res, 200, { ok: true, tools: Object.keys(TOOLS).length, ids: Object.keys(TOOLS), llmEnabled: LLM_ENABLED, port: PORT });
  }

  // POST /run —— 确定性 FSM
  if (req.method === 'POST' && url.pathname === '/run') {
    const input = await readBody(req);
    if (!input) return send(res, 400, { success: false, error: '请求体非 JSON' });
    try {
      const out = await runFoodDiscovery(input);
      return send(res, out.success ? 200 : 422, out);
    } catch (err) {
      return send(res, 400, { success: false, error: 'run 失败', detail: String(err && err.message || err) });
    }
  }

  // POST /agent —— LLM 大脑（带降级熔断）
  if (req.method === 'POST' && url.pathname === '/agent') {
    const input = await readBody(req);
    if (!input || typeof input !== 'object') return send(res, 400, { success: false, error: '请求体非 JSON' });
    try {
      const out = await agentChat({
        message: input.message || input.intent || '',
        sessionId: input.sessionId || 'anon',
        history: Array.isArray(input.history) ? input.history : [],
      });
      return send(res, 200, out);
    } catch (err) {
      if (err instanceof AgentFallbackError) {
        // R1：LLM 不可用 / 超时 / 5xx / 红线 → 自动回退确定性运行时（前端无感）。
        try {
          const fb = await runFoodDiscovery(input);
          if (fb.success && fb.output && fb.output.summary) {
            fb.output.summary.fallbackNote = 'LLM 暂不可用，已降级到规则引擎（同样的推荐契约）';
          }
          fb.fallback = true;
          fb.fallbackReason = err.message;
          return send(res, 200, fb);
        } catch (e2) {
          return send(res, 422, { success: false, error: 'agent 降级也失败', detail: String(e2 && e2.message || e2) });
        }
      }
      return send(res, 400, { success: false, error: 'agent 失败', detail: String(err && err.message || err) });
    }
  }

  // /memory/:sessionId —— 后端化口味档案（R5）
  const mem = req.method !== 'OPTIONS' && url.pathname.match(/^\/memory\/([^/]+)$/);
  if (mem) {
    const sid = decodeURIComponent(mem[1]);
    if (req.method === 'GET') {
      return send(res, 200, { success: true, profile: getProfile(sid) });
    }
    if (req.method === 'POST') {
      const patch = await readBody(req);
      const p = upsertProfile(sid, patch && typeof patch === 'object' ? patch : {});
      return send(res, 200, { success: true, profile: p });
    }
    if (req.method === 'DELETE') {
      clearProfile(sid);
      return send(res, 200, { success: true, cleared: true });
    }
    return send(res, 405, { success: false, error: '不支持的方法' });
  }

  // POST /tools/:id —— 单工具调用
  const m = req.method === 'POST' && url.pathname.match(/^\/tools\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const handler = TOOLS[id];
    if (!handler) return send(res, 404, { success: false, error: `未知工具: ${id}`, knownTools: Object.keys(TOOLS) });
    try {
      const input = await readBody(req);
      if (!input) return send(res, 400, { success: false, error: '请求体非 JSON' });
      const out = await handler(input);
      return send(res, 200, out);
    } catch (err) {
      return send(res, 400, { success: false, error: '调用失败', detail: String(err && err.message || err) });
    }
  }

  return send(res, 404, { success: false, error: '未匹配的路由', path: url.pathname });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[manyouwei-impl] listening on :${PORT}, tools=${Object.keys(TOOLS).length}, llmEnabled=${LLM_ENABLED}`);
});

export { server, TOOLS };
