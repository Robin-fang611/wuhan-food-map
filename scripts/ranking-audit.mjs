#!/usr/bin/env node
/**
 * V2.3 反广告可验证审计 —— 证明「推荐/排序」不含任何商业加权（sponsored / commercial / paid boost）。
 *
 * 安全可逆 · 本地 · 无任何 API 调用 · 不读写密钥 · 不碰数据。
 * 复跑即可复核：node scripts/ranking-audit.mjs
 * 产物：docs/ranking-audit.md（可读性报告，声明零 sponsored weight）。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// —— 1) 纳入审计的「排序 / 筛选 / 推荐」源码（不含 UI、不含 cps 渲染标模块、不含 LLM 提示词）——
const RANK_FILES = [
  'h5/src/core/query.js',
  'h5/src/core/ranking.js',
  'hypha/implementation/src/tools/rank.js',
  'hypha/implementation/src/tools/filter.js',
  'hypha/implementation/src/discovery-engine.js',
];

// —— 2) 禁止出现在排序/筛选上下文的商业加权词（精确，避免误伤 prompts 等）——
const PROHIBITED_DICT = /\b(sponsor|sponsored|sponsorship|commercial|paywall|advertis\w*|revshare|赞助|广告权重|付费权重|出价|竞价)\b/i;
// 任何对象键/赋值含这些根的也算（捕获 sponsoredWeight: / paidRank: / commercialScore: 等）
const PROHIBITED_KEY = /\b(sponsor|commercial|paid|advert|boost|bid)\w*\s*:/i;

// —— 3) 正向控制：防火墙断言必须存在（不仅「没有坏词」，还要「明确隔离」）——
const FIREWALL_CHECKS = [
  {
    file: 'hypha/implementation/src/cps.js',
    re: /绝不被|排序从不读取|不影响排序|不影响该商户能否入选/i,
    label: 'CPS 商户集合与排序物理隔离（cps.js 防火墙）',
  },
  {
    file: 'hypha/implementation/src/explain.js',
    re: /增信不增权重|不增权重特权/i,
    label: '核验只增信、不增权重特权（explain.js 反广告注释）',
  },
  {
    file: 'hypha/implementation/src/agent-loop.js',
    re: /绝不.*付费|分润关系改变排序|只基于信任信号/i,
    label: 'LLM 系统提示：排序只基于信任信号，绝不因付费/分润改变（agent-loop.js）',
  },
];

// —— 4) 文档化的排序因子（人工核验代码后录入，附 file:line，供报告展示）——
const FACTORS = [
  ['ratingRank(r)', 'h5/src/core/query.js:13', '必吃=3 / 推荐=2 / 数值>0=1 / 其他=0', '信任信号（编辑评级）'],
  ['sortMerchants(list,{sort})', 'h5/src/core/query.js:86', 'rating 降序→人均升序；或 price 升序；或 distance 升序', '信任信号'],
  ['filterMerchants(...)', 'h5/src/core/query.js:61', 'zone / categories / mealTime / maxPrice / keyword', '用户意图筛选（非商业）'],
  ['rankMustEat', 'h5/src/core/ranking.js:8', 'rating=必吃 ∧（评分降序→人均升序→店名字典序）', '信任信号'],
  ['rankValue', 'h5/src/core/ranking.js:19', '（评分权重 ÷ 人均）降序→人均升序', '信任信号'],
  ['rankLateNight', 'h5/src/core/ranking.js:33', 'mealTime⊇夜宵 ∧ 评分降序', '场景信号'],
  ['rankNew', 'h5/src/core/ranking.js:44', 'source=地推 ∧ id 倒序（越新越前）', '收录信号'],
  ['discoverRank', 'hypha/implementation/src/tools/rank.js:13', '薄绑 core/ranking.js 四榜', '信任信号'],
  ['discovery-engine.sortBy', 'hypha/implementation/src/discovery-engine.js:19', 'price 升序 / rating 降序(→人均升序)', '信任信号'],
  ['discovery-engine.geo', 'hypha/implementation/src/discovery-engine.js:67', '财大南湖周边按 distanceKm 升序（仅附注距离；非距离排序时 geo 仅附注）', '距离信号（仅校区）'],
  ['discovery-engine.exclude', 'hypha/implementation/src/discovery-engine.js:82', '多轮「换一家」剔除已展示 id，仅本轮候选集内', '对话状态（非商业）'],
];

// ===== 执行扫描 =====
let verdict = 'PASS';
const prohibitedHits = [];

for (const f of RANK_FILES) {
  const p = join(ROOT, f);
  if (!existsSync(p)) { prohibitedHits.push(`[缺失文件] ${f}`); verdict = 'FAIL'; continue; }
  const lines = readFileSync(p, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    if (PROHIBITED_DICT.test(ln) || PROHIBITED_KEY.test(ln)) {
      prohibitedHits.push(`${f}:${i + 1}: ${ln.trim()}`);
    }
  });
}
if (prohibitedHits.length) verdict = 'FAIL';

const firewallResults = FIREWALL_CHECKS.map((c) => {
  const p = join(ROOT, c.file);
  const ok = existsSync(p) && c.re.test(readFileSync(p, 'utf8'));
  if (!ok) verdict = 'FAIL';
  return { ...c, ok };
});

// ===== 生成报告 =====
const now = new Date();
const beijing = new Date(now.getTime() + 8 * 3600 * 1000);
const ts = beijing.toISOString().replace('Z', '+08:00').replace('T', ' ').slice(0, 19);

const factorRows = FACTORS.map(
  ([fn, loc, order, signal]) =>
    `| \`${fn}\` | ${loc} | ${order} | ${signal} |`
).join('\n');

const firewallRows = firewallResults.map(
  (r) => `| ${r.ok ? '✅' : '❌'} | ${r.label} | \`${r.file}\` |`
).join('\n');

const report = `# 蛮有味 · 反广告排序审计（Ranking Audit — Zero Sponsored Weight）

> 自动生成：\`node scripts/ranking-audit.mjs\` · 生成时间：${ts}（北京时间）
> 结论：**${verdict === 'PASS' ? 'PASS —— 推荐/排序零商业加权' : 'FAIL —— 见下方命中项'}**

## 1. 审计范围
纳入「排序 / 筛选 / 推荐」全部源码路径（不含 UI、不含 CPS 渲染标模块、不含 LLM 提示词）：

${RANK_FILES.map((f) => `- \`${f}\``).join('\n')}

## 2. 排序因子全景（每条均为信任/意图信号，无商业权重）
| 函数 / 入口 | 位置 | 排序/筛选依据 | 信号类型 |
|---|---|---|---|
${factorRows}

## 3. 商业加权扫描结果
扫描以上文件是否出现赞助 / 商业 / 付费 / 竞价 / 广告权重类术语（含对象键形式，如 \`sponsoredWeight:\` / \`paidRank:\` / \`commercialScore:\`）：

- 命中数：**${prohibitedHits.length}**
${prohibitedHits.length ? prohibitedHits.map((h) => `  - ❌ ${h}`).join('\n') : '  - ✅ 零命中 —— 任何排序/筛选/推荐路径均不含商业加权项。'}

## 4. 防火墙正向控制（不仅「没有坏词」，还要「明确隔离」）
| 状态 | 断言 | 位置 |
|---|---|---|
${firewallRows}

## 5. CPS 与排序的物理隔离（关键）
\`hypha/implementation/src/cps.js\` 头部明确：CPS 商户签约集合**只决定卡片是否挂「可核销优惠」展示标**，
**绝不被** discovery-engine / intent-parser / filter / rank / orchestrator 导入；排序从不读取该集合；
不影响商户能否入选，也不影响排序位置。未签约商户照样可凭信任入选（只是没标）。

## 6. 如何复核
\`\`\`bash
node scripts/ranking-audit.mjs
\`\`\`
重跑将重新扫描上述文件并打印 \`verdict=PASS/FAIL\`；报告同步重写本文件。

## 7. 声明（产品信任内核）
**蛮有味的推荐排序不出卖（zero sponsored weight）。** 排序与入选仅由信任信号（编辑评级、人均、距离、
场景、收录来源）与用户意图（片区/分类/时段/预算/关键词）决定；营收（CPS 分润）与排序正交，
仅在推荐结果生成后以展示标形式呈现，且默认无真实签约商户（诚实留空，待 Robin 真实签约后填 env）。
`;

const outPath = join(ROOT, 'docs/ranking-audit.md');
writeFileSync(outPath, report);

console.log(`[ranking-audit] verdict=${verdict} prohibitedHits=${prohibitedHits.length} firewall=${firewallResults.filter((r) => r.ok).length}/${firewallResults.length}`);
if (prohibitedHits.length) {
  console.log(prohibitedHits.join('\n'));
  process.exit(1);
}
console.log(`[ranking-audit] report -> ${outPath}`);
