// LLM 调用成本日志（W7 · 2026-08-15）
// 目标：记录每次 LLM（DeepSeek）调用的 时间/IP/场景/意图/耗时/token 用量 → data/llm-cost.log（JSONL，gitignored）。
// 用途：上线后核对「LLM 成本护栏」是否生效、校园量级月成本估算（SPEC §9.2）。
// 安全：不记录密钥、不记录完整意图（前 30 字）、不记录 PII。
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = process.env.LLM_COST_LOG || path.resolve(__dirname, '..', 'data', 'llm-cost.log');

export function logLlmCall({ scene = 'agent', ip = '', intent = '', ok = false, ms = 0, usage = null } = {}) {
  try {
    mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    const row = {
      at: new Date().toISOString(),
      scene, // 'agent' | 'upgrade'
      ip,
      intent: String(intent || '').slice(0, 30),
      ok: !!ok,
      ms: Math.round(ms),
      usage: usage || null, // { prompt_tokens, completion_tokens, total_tokens }
    };
    appendFileSync(LOG_FILE, JSON.stringify(row) + '\n', 'utf8');
  } catch { /* 日志失败不阻断服务 */ }
}

// 生产环境错误脱敏：不泄露内部路径/堆栈（W7）
export function errDetail(err) {
  if (process.env.NODE_ENV === 'production') return '内部错误';
  return String(err && err.message || err);
}
