#!/usr/bin/env node
/**
 * llm-cost.mjs —— 蛮有味 LLM 调用成本/延迟估算仪表（V1 任务4）
 *
 * 作用：把"真实调用成本"固化成可复算的数字，避免拍脑袋。
 * 默认采用项目实测估算（见 layers/decisions.md D-20260811-02）：
 *   - 典型 LLM 调用 ≈ 3,481 token/次
 *   - DeepSeek ≈ ¥0.0024–0.0075/次（取保守值 ¥0.0024 即 1万次≈¥24）
 *
 * 用法：
 *   node scripts/llm-cost.mjs                      # 默认 1万次 估算
 *   node scripts/llm-cost.mjs --calls 1000         # 指定调用次数
 *   node scripts/llm-cost.mjs --log calls.jsonl    # 读真实调用日志(每行 {tokens}) 精算
 *   node scripts/llm-cost.mjs --per-call 0.005      # 覆盖单次估算价(¥)
 *
 * 注意：金额为"估算"，真实计费以 DeepSeek 账单为准；本脚本不持有任何密钥。
 */

import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
function getArg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v === undefined ? fallback : v;
}

const PER_CALL_ESTIMATE_YUAN = Number(getArg("per-call", "0.0024")); // 项目实测保守估算
const TOKENS_PER_CALL = 3481; // 典型调用 token 数（D-20260811-02）

function parseLog(path) {
  const raw = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  const rows = raw.map((l) => JSON.parse(l));
  const totalTokens = rows.reduce((s, r) => s + (Number(r.tokens) || 0), 0);
  const calls = rows.length;
  return { calls, totalTokens };
}

let calls, totalTokens, mode;
const logPath = getArg("log", null);
if (logPath) {
  const r = parseLog(logPath);
  calls = r.calls;
  totalTokens = r.totalTokens;
  mode = `真实日志(${logPath})`;
} else {
  calls = Number(getArg("calls", "10000"));
  totalTokens = calls * TOKENS_PER_CALL;
  mode = "估算(默认单次 token 模型)";
}

const costYuan = calls * PER_CALL_ESTIMATE_YUAN;
const per1k = (PER_CALL_ESTIMATE_YUAN / TOKENS_PER_CALL) * 1000;

console.log("=== 蛮有味 LLM 成本估算仪表 ===");
console.log(`模式: ${mode}`);
console.log(`调用次数: ${calls.toLocaleString()}`);
console.log(`Token 总量: ${totalTokens.toLocaleString()} (~${(totalTokens / 1000).toFixed(1)}k)`);
console.log(`单次估算: ¥${PER_CALL_ESTIMATE_YUAN.toFixed(4)}  (≈¥${per1k.toFixed(5)}/1k token)`);
console.log(`合计估算: ¥${costYuan.toFixed(2)}`);
console.log(`--- 参考档位 ---`);
console.log(`  1千次: ¥${(calls === 1000 ? costYuan : 1000 * PER_CALL_ESTIMATE_YUAN).toFixed(2)}`);
console.log(`  1万次: ¥${(10000 * PER_CALL_ESTIMATE_YUAN).toFixed(2)}`);
console.log(`  10万次: ¥${(100000 * PER_CALL_ESTIMATE_YUAN).toFixed(2)}`);
console.log(`(金额为估算，真实计费以 DeepSeek 账单为准；本脚本不持有任何密钥)`);
