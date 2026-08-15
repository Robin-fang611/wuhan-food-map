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
import { shouldUpgrade, buildUpgradeResult } from './upgrade.js';
import { parseIntent } from './intent-parser.js';
import { logLlmCall, logClientError, errDetail } from './llm-cost-log.js';
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
import { handleUpload, listPendingUploads, governUpload } from './upload.js';
import {
  createCaptcha, sendSms, loginWithPhone, getUserByToken, wechatAuthorizeUrl, wechatCallback,
  revokeToken, updateProfile, deleteAccount,
} from './auth-server.js';
import { deleteUserFavorites } from './tools/favorite.js';
import { deleteUserUploads } from './upload.js';

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

// —— W5.2 安全防护（2026-08-15）：CORS 白名单 / 全局限流 / 治理鉴权 / 请求体上限 ——
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS
    || 'http://127.0.0.1:5180,http://localhost:5180,http://127.0.0.1:5173,http://localhost:5173')
    .split(',').map((s) => s.trim()).filter(Boolean)
);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';           // 治理接口（/upload/govern 等）管理令牌
const RATE_LIMIT_DISABLED = process.env.RATE_LIMIT === 'off'; // 测试环境可关
const MAX_BODY_BYTES = 1024 * 1024;                           // 请求体上限 1MB

// 全局限流（内存滑动窗口，按 IP）：敏感接口（auth/upload/agent/run）更严，防注册刷号与 LLM 成本滥用。
const hitWindow = new Map(); // key -> number[]
function rateLimit(key, windowMs, max) {
  if (RATE_LIMIT_DISABLED) return true;
  const now = Date.now();
  const arr = (hitWindow.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hitWindow.set(key, arr); return false; }
  arr.push(now);
  hitWindow.set(key, arr);
  return true;
}
function clientIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}
function adminOk(req) {
  if (!ADMIN_TOKEN) return false;
  const authz = req.headers['authorization'] || '';
  const bearer = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  return (bearer && bearer === ADMIN_TOKEN) || (req.headers['x-admin-token'] || '') === ADMIN_TOKEN;
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { tooBig = true; req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return resolve(null);
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(raw.trim() ? JSON.parse(raw) : {}); }
      catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

const server = createServer(async (req, res) => {
  // W5.2 CORS 白名单：非白名单 Origin 一律 403（生产前端域名经 ALLOWED_ORIGINS 配置）
  const origin = req.headers.origin || '';
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return send(res, 403, { success: false, error: '来源不被允许' });
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
  if (req.method === 'OPTIONS') return send(res, 204, {});

  // W5.2 请求体上限预检（流式超限在 readBody 内兜底）
  const contentLen = Number(req.headers['content-length'] || 0);
  if (contentLen > MAX_BODY_BYTES) return send(res, 413, { success: false, error: '请求体过大' });

  // W5.2 全局限流（敏感接口更严：auth/upload/agent/run）
  const url0 = new URL(req.url, `http://localhost:${PORT}`);
  const sensitive = url0.pathname.startsWith('/auth') || url0.pathname.startsWith('/upload')
    || url0.pathname === '/agent' || url0.pathname === '/run' || url0.pathname === '/log/error';
  if (!rateLimit(clientIp(req), 60000, sensitive ? 30 : 120)) {
    return send(res, 429, { success: false, error: '请求过于频繁，请稍后再试' });
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // POST /health
  if (req.method === 'POST' && url.pathname === '/health') {
    return send(res, 200, { ok: true, tools: Object.keys(TOOLS).length, ids: Object.keys(TOOLS), llmEnabled: LLM_ENABLED, port: PORT });
  }

  // POST /run —— 确定性 FSM（W1.2 双轨：确定性不足时自动升级 LLM 深度分析，失败回落确定性，前端无感）
  if (req.method === 'POST' && url.pathname === '/run') {
    const input = await readBody(req);
    if (!input) return send(res, 400, { success: false, error: '请求体非 JSON' });
    try {
      const intent = String(input.intent || input.query || '');
      const params = (input && input.params) ? input.params : parseIntent(input);
      const out = await runFoodDiscovery(input);
      const needUpgrade = LLM_ENABLED && shouldUpgrade({ intent, summary: out.output && out.output.summary, params });
      if (out.success && needUpgrade) {
        // LLM 成本护栏：升级路径限流 10 次/分/IP
        if (!rateLimit('llm:' + clientIp(req), 60000, 10)) {
          if (Array.isArray(out.output.summary.degradation)) {
            out.output.summary.degradation.push('AI 深度分析调用过于频繁，本次为脚本兜底结果');
          }
          return send(res, 200, out);
        }
        // 升级：LLM 深度分析（25s 超时护栏；失败自动回落确定性结果；成本日志 W7）
        let agentResult = null;
        const t0 = Date.now();
        try {
          agentResult = await Promise.race([
            agentChat({ message: intent, sessionId: input.sessionId || 'anon', history: [] }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('upgrade timeout')), 25000)),
          ]);
        } catch { agentResult = null; }
        logLlmCall({ scene: 'upgrade', ip: clientIp(req), intent, ok: !!(agentResult && agentResult.success && !agentResult.fallback), ms: Date.now() - t0, usage: agentResult && agentResult.usage });
        if (agentResult && agentResult.success && !agentResult.fallback) {
          // LLM 成功：返回 LLM 结果 + upgrade 标记 + 确定性兜底
          return send(res, 200, buildUpgradeResult(agentResult, out));
        }
        // LLM 不可用/失败：确定性结果 + 诚实降级说明
        if (out.output && Array.isArray(out.output.summary.degradation)) {
          out.output.summary.degradation.push('AI 深度分析暂不可用，以下为脚本兜底结果（实事求是，不硬凑）');
        }
      }
      return send(res, out.success ? 200 : 422, out);
    } catch (err) {
      return send(res, 400, { success: false, error: 'run 失败', detail: errDetail(err) });
    }
  }

  // POST /agent —— LLM 大脑（带降级熔断；LLM 成本护栏：10 次/分/IP；成本日志 W7）
  if (req.method === 'POST' && url.pathname === '/agent') {
    if (!rateLimit('llm:' + clientIp(req), 60000, 10)) {
      return send(res, 429, { success: false, error: 'AI 调用过于频繁，请稍后再试' });
    }
    const input = await readBody(req);
    if (!input || typeof input !== 'object') return send(res, 400, { success: false, error: '请求体非 JSON' });
    const t0 = Date.now();
    try {
      const out = await agentChat({
        message: input.message || input.intent || '',
        sessionId: input.sessionId || 'anon',
        history: Array.isArray(input.history) ? input.history : [],
      });
      logLlmCall({ scene: 'agent', ip: clientIp(req), intent: input.message || input.intent, ok: out && out.success && !out.fallback, ms: Date.now() - t0, usage: out && out.usage });
      return send(res, 200, out);
    } catch (err) {
      logLlmCall({ scene: 'agent', ip: clientIp(req), intent: input.message || input.intent, ok: false, ms: Date.now() - t0 }); // W7：失败也记录
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
      return send(res, 400, { success: false, error: 'agent 失败', detail: errDetail(err) });
    }
  }

  // POST /upload —— 探店采集：用户上传店铺 → 高德校验 → 三分支决策（SPEC §11 S5）
  if (req.method === 'POST' && url.pathname === '/upload') {
    const input = await readBody(req);
    if (!input || typeof input !== 'object') return send(res, 400, { success: false, error: '请求体非 JSON' });
    try {
      const out = await handleUpload(input);
      return send(res, 200, out);
    } catch (err) {
      return send(res, 400, { success: false, error: 'upload 失败', detail: errDetail(err) });
    }
  }

  // GET /upload/pending —— 待核验列表（治理视图：脱敏，不含 userId/原始 source；需 ADMIN_TOKEN）
  if (req.method === 'GET' && url.pathname === '/upload/pending') {
    if (!adminOk(req)) return send(res, 401, { success: false, error: '未授权（治理接口需管理员令牌）' });
    try {
      const out = await listPendingUploads({ limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined });
      return send(res, 200, out);
    } catch (err) {
      return send(res, 400, { success: false, error: 'pending 列表失败', detail: errDetail(err) });
    }
  }

  // POST /upload/govern —— 治理动作：promote（人工收录）/ reject（驳回），支持 dryRun，记审计日志（需 ADMIN_TOKEN）
  if (req.method === 'POST' && url.pathname === '/upload/govern') {
    if (!adminOk(req)) return send(res, 401, { success: false, error: '未授权（治理接口需管理员令牌）' });
    const input = await readBody(req);
    if (!input || typeof input !== 'object') return send(res, 400, { success: false, error: '请求体非 JSON' });
    try {
      const out = await governUpload(input);
      return send(res, out.ok ? 200 : 404, out);
    } catch (err) {
      return send(res, 400, { success: false, error: 'govern 失败', detail: errDetail(err) });
    }
  }

  // ===== 账号体系（图形验证码 + 短信验证码 + 手机登录 + 微信授权）=====
  // POST /auth/captcha —— 图形验证码（人机验证，服务端自绘 SVG）
  if (req.method === 'POST' && url.pathname === '/auth/captcha') {
    try {
      const c = createCaptcha();
      return send(res, 200, { token: c.token, svg: c.svg });
    } catch (err) {
      return send(res, 500, { ok: false, error: '验证码生成失败', detail: errDetail(err) });
    }
  }
  // POST /auth/sms/send —— 发送短信验证码（先过图形验证 + 频控；未配置 provider 如实报错）
  if (req.method === 'POST' && url.pathname === '/auth/sms/send') {
    const input = await readBody(req);
    if (!input || typeof input !== 'object') return send(res, 400, { ok: false, error: '请求体非 JSON' });
    const r = await sendSms(input);
    return send(res, r.ok ? 200 : 400, r);
  }
  // POST /auth/login —— 手机验证码登录 / 注册，签发 JWT
  if (req.method === 'POST' && url.pathname === '/auth/login') {
    const input = await readBody(req);
    if (!input || typeof input !== 'object') return send(res, 400, { ok: false, error: '请求体非 JSON' });
    try {
      const r = loginWithPhone(input);
      return send(res, r.ok ? 200 : 400, r);
    } catch (err) {
      return send(res, 500, { ok: false, error: '登录服务异常', detail: errDetail(err) });
    }
  }
  // GET /auth/wechat/url —— 微信网页授权页 URL（AppSecret 仅服务端）
  if (req.method === 'GET' && url.pathname === '/auth/wechat/url') {
    const state = url.searchParams.get('state') || '';
    const r = wechatAuthorizeUrl(state);
    return send(res, r.ok ? 200 : 400, r);
  }
  // GET /auth/wechat/callback —— code 换 token 后重定向到前端落地页（带 token+state）
  if (req.method === 'GET' && url.pathname === '/auth/wechat/callback') {
    const code = url.searchParams.get('code') || '';
    const state = url.searchParams.get('state') || '';
    const r = await wechatCallback(code, state);
    if (!r.ok || !r.redirect) return send(res, 400, r);
    res.writeHead(302, { Location: r.redirect });
    return res.end();
  }
  // GET /auth/me —— 凭 token 取当前用户（微信回跳等场景补齐会话）
  if (req.method === 'GET' && url.pathname === '/auth/me') {
    const authz = req.headers['authorization'] || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    const u = getUserByToken(token);
    return send(res, u ? 200 : 401, u ? { ok: true, user: u } : { ok: false, error: '未登录或登录已过期' });
  }

  // POST /log/error —— 前端错误上报（W7 监控；脱敏：消息/来源/行号，无 PII；限流）
  if (req.method === 'POST' && url.pathname === '/log/error') {
    const input = await readBody(req);
    if (!input || typeof input !== 'object') return send(res, 400, { success: false, error: '请求体非 JSON' });
    logClientError({ ip: clientIp(req), message: input.message, source: input.source, lineno: input.lineno });
    return send(res, 200, { ok: true });
  }

  // POST /auth/logout —— 登出（吊销当前 JWT，W4 会话管理）
  if (req.method === 'POST' && url.pathname === '/auth/logout') {
    const authz = req.headers['authorization'] || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!token) return send(res, 400, { ok: false, error: '缺少凭证' });
    return send(res, 200, revokeToken(token));
  }

  // POST /auth/profile —— 更新昵称（登录态）
  if (req.method === 'POST' && url.pathname === '/auth/profile') {
    const input = await readBody(req);
    if (!input || typeof input !== 'object') return send(res, 400, { ok: false, error: '请求体非 JSON' });
    const authz = req.headers['authorization'] || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    const r = updateProfile({ token, nickname: input.nickname });
    return send(res, r.ok ? 200 : 400, r);
  }

  // POST /auth/delete —— 注销账号（删用户 + 收藏 + 上传记录 + 吊销会话，合规）
  if (req.method === 'POST' && url.pathname === '/auth/delete') {
    const authz = req.headers['authorization'] || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    const r = deleteAccount({ token });
    if (!r.ok) return send(res, 400, r);
    deleteUserFavorites(r.deletedId);
    await deleteUserUploads(r.deletedId);
    return send(res, 200, r);
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
      // S4：把 Authorization: Bearer <JWT> 注入为 input.token（工具从 JWT 解析身份，
      // 服务端忽略客户端传入的 userId 防越权；无 token 的写工具如实拒绝，前端回落本地）。
      if (!input.token) {
        const authz = req.headers['authorization'] || '';
        if (authz.startsWith('Bearer ')) input.token = authz.slice(7).trim();
      }
      const out = await handler(input);
      return send(res, 200, out);
    } catch (err) {
      return send(res, 400, { success: false, error: '调用失败', detail: errDetail(err) });
    }
  }

  return send(res, 404, { success: false, error: '未匹配的路由', path: url.pathname });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[manyouwei-impl] listening on :${PORT}, tools=${Object.keys(TOOLS).length}, llmEnabled=${LLM_ENABLED}`);
});

export { server, TOOLS };
