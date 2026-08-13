// 蛮有味 · V1.4 成本/延迟离线测算脚本（无需真实 API 调用，不花钱）。
//
// 目的：把 D-20260812-01 / D-20260813-01 的结论固化成一份可复跑的报告——
//   典型 LLM 调用 token 量、单次成本区间、不同月调用量下的总成本、与「免费档不可用」的风险提示。
//
// 红线：本脚本全程离线，绝不发起任何网络请求、不读取/打印任何密钥。
// 数据性质：所有数字均为【estimated】（基于 DeepSeek 公开定价 + 项目典型负载假设），
//   非真实跑量实测（真实跑量待 Robin 在 env 设 DEEPSEEK_API_KEY 后由服务日志累计，见 httpServer /agent）。
//
// 用法：
//   node scripts/llm-cost.mjs               # 默认输出报告到 stdout
//   node scripts/llm-cost.mjs --write       # 同时写 scripts/llm-cost-report.md
//   MYWO_LLM_CALLS=50000 node scripts/llm-cost.mjs   # 追加自定义月调用量

const ASSUMPTIONS = {
  // —— 以下均为 estimated（假设），非 verified 实测 ——
  tokensPerCall: 3481,                 // 典型一次 /agent 往返（system + 多轮历史 + 工具 schema + 完成）
  costPerCallMin: 0.0024,              // ¥/次（缓存命中 + 低价档，靠近 1 万次≈¥24）
  costPerCallMax: 0.0075,              // ¥/次（缓存未命中 + 完整输出上限）
  latencyP50Ms: 1200,                 // 典型端到端延迟（模型推理 ~1.2s，见历史实测 ~1.2s 可达）
  latencyWorstMs: 20000,              // 超时上限（deepseek.js DEFAULT_TIMEOUT_MS）
  freeTierUsable: false,               // 免费档限流，不扛真实并发（open-threads 风险项）
  paidTierPriceRef: 'DeepSeek deepseek-chat（国内付费档，约 ¥1~2 / 百万 token）',
};

const VOLUMES = [1_000, 10_000, 100_000, 1_000_000];
const customCalls = Number(process.env.MYWO_LLM_CALLS) || 0;

function fmtMoney(n) {
  if (n >= 10000) return `¥${(n / 10000).toFixed(2)}万`;
  if (n >= 1000) return `¥${n.toFixed(0)}`;
  return `¥${n.toFixed(2)}`;
}
function fmtNum(n) { return n.toLocaleString('zh-CN'); }

function buildReport() {
  const a = ASSUMPTIONS;
  const now = new Date().toISOString();
  const lines = [];
  lines.push(`# 蛮有味 · LLM 成本/延迟离线测算报告`);
  lines.push('');
  lines.push(`> 生成时间：${now}（离线测算，无需 API Key，不花钱）`);
  lines.push('> 数据性质：全部为 **estimated**（基于 DeepSeek 公开定价与项目典型负载假设），非真实跑量实测。真实跑量待 Robin 在 env 设 `DEEPSEEK_API_KEY` 后由 `:8799 /agent` 服务日志累计。');
  lines.push('');
  lines.push('## 假设（estimated）');
  lines.push('');
  lines.push(`- 单次调用 token 量：≈ ${fmtNum(a.tokensPerCall)} token/次`);
  lines.push(`- 单次成本区间：¥${a.costPerCallMin} ~ ¥${a.costPerCallMax}/次`);
  lines.push(`- 典型延迟：P50 ≈ ${(a.latencyP50Ms / 1000).toFixed(1)}s；超时上限 ${a.latencyWorstMs / 1000}s`);
  lines.push(`- 付费档参考：${a.paidTierPriceRef}`);
  lines.push(`- 免费档可用性：**不可用**（限流，不扛真实并发——open-threads 风险项，勿用于生产）`);
  lines.push('');
  lines.push('## 不同月调用量下的总成本（estimated）');
  lines.push('');
  lines.push('| 月调用量 | 月 token 总量 | 月成本下限 | 月成本上限 | 单日均值(上限) |');
  lines.push('|---------:|-------------:|-----------:|-----------:|--------------:|');
  const vols = customCalls > 0 ? [...VOLUMES, customCalls] : VOLUMES;
  for (const v of vols) {
    const tokens = v * a.tokensPerCall;
    const lo = v * a.costPerCallMin;
    const hi = v * a.costPerCallMax;
    const perDayHi = hi / 30;
    lines.push(`| ${fmtNum(v)} | ${fmtNum(Math.round(tokens))} | ${fmtMoney(lo)} | ${fmtMoney(hi)} | ${fmtMoney(perDayHi)} |`);
  }
  lines.push('');
  lines.push('## 结论（estimated）');
  lines.push('');
  lines.push('- 校园先行场景下，月调用 1 万次 ≈ **¥24~75/月**（成本极低，纯 CPS 单位经济完全可覆盖，见 MONETIZATION-MODEL）。');
  lines.push('- 即便放大到月 100 万次（远超校园早期规模），上限也仅 ≈ **¥7,500/月**，仍在可控区间。');
  lines.push('- 成本瓶颈不在 AI 推理，而在**增长/adoption**（见 PRODUCT-VISION 战略判断）：推理极便宜，真正缺口在运营与获客。');
  lines.push('- 免费档仅用于开发联调；任何生产流量必须走付费档（estimated 成本已固化如上）。');
  lines.push('- 真实延迟/成本以 `:8799 /agent` 带 Key 实跑的服务日志为准（本脚本为离线固化版）。');
  lines.push('');
  return lines.join('\n');
}

const report = buildReport();
if (process.argv.includes('--write')) {
  const fs = await import('node:fs');
  const path = new URL('./llm-cost-report.md', import.meta.url);
  fs.writeFileSync(path, report, 'utf8');
  console.log(`[llm-cost] 报告已写入 ${path.pathname}`);
}
console.log(report);
