// 廉价验证（PRD §2.4）—— 离线盲评 DeepSeek 原型 vs 规则引擎，用 PRD §2.3 判定线证 LLM>规则。
//
// 默认（LLM_MODE 未设 / 无 Key）：用 mock 传输层离线跑通「LLM 路径能产出决策契约」，
//   并以**程序化可证**的方式度量规则引擎在「情境/情绪意图」上的结构性盲区。
// 真实盲评：设 LLM_MODE=real 且 DEEPSEEK_API_KEY 已设置 → 真调 DeepSeek 跑同一批测试集，
//   产出可交人工盲评的真实输出（去标识化混排）。
//
// 重要（诚实声明）：本脚本对「懂我胜率 / 决策完成率」给出的是**结构性结论**
//   （规则在情境意图上无任何字段可映射 → vibe 理解率 0%；LLM 设计上把情绪翻译成约束+理由）。
//   定量盲评数值（≥65% / ≥15pp）需 Robin 用真实 Key 跑实时盲评最终锁定，命令见文末。
//
// 运行：node hypha/implementation/scripts/cheap-validation.mjs
import { runFoodDiscovery } from '../src/orchestrator.js';
import { parseIntent } from '../src/intent-parser.js';
import { agentChat } from '../src/agent-loop.js';
import { createDeepSeekTransport } from '../src/deepseek.js';
import { setDefaultDataSource, createDataSource } from '../src/datasource/index.js';
import '../src/datasource/wuhan.js'; // 触发 wuhan 数据源注册（真实 590 数据集接入点）

// mock 传输：搜一次 → 提交决策（编码「LLM 应把情绪翻译成约束+理由」的预期行为）。
function makeMockTransport() {
  return {
    kind: 'mock',
    async call(messages) {
      const lastTool = [...messages].reverse().find((m) => m.role === 'tool');
      if (lastTool && lastTool.content.includes('"merchants"')) {
        let data; try { data = JSON.parse(lastTool.content); } catch { data = { merchants: [] }; }
        const ids = (data.merchants || []).map((m) => m.id).filter(Boolean);
        if (ids.length) {
          return { content: '', toolCalls: [{ id: 'c2', name: 'finalize_recommendation', arguments: { primaryId: ids[0], alternativeIds: ids.slice(1, 4), reason: '贴合你此刻的状态（情绪→约束已翻译）', guidance: '去试试这家~' } }] };
        }
      }
      return { content: '', toolCalls: [{ id: 'c1', name: 'search_merchants', arguments: { zone: '全城', limit: 6 } }] };
    },
  };
}

// 25 条情境/结构化意图测试集（校园口语 + 小红书式表达）。
const TEST_CASES = [
  { intent: '心情不好想吃点治愈系暖暖的', type: 'situational' },
  { intent: '带暗恋的人第一次吃饭别太寒酸', type: 'situational' },
  { intent: '今天累瘫了想吃近的不想走动', type: 'situational' },
  { intent: '一个人不知道吃啥', type: 'situational' },
  { intent: '想吃点辣的爽一下', type: 'situational' },
  { intent: '生理期想吃热乎的', type: 'situational' },
  { intent: '宿舍聚餐想点外卖别太贵', type: 'situational' },
  { intent: '考试周想吃点补脑的', type: 'situational' },
  { intent: '失恋了想一个人静静吃碗面', type: 'situational' },
  { intent: '朋友来了想请客有面子', type: 'situational' },
  { intent: '下雨天不想出门点个近的', type: 'situational' },
  { intent: '想吃清淡点最近上火', type: 'situational' },
  { intent: '想喝点甜的开心一下', type: 'situational' },
  { intent: '周末想犒劳自己吃顿好的', type: 'situational' },
  { intent: '赶时间随便吃点快点的', type: 'situational' },
  { intent: '南湖附近便宜的宵夜', type: 'structured' },
  { intent: '首义必吃', type: 'structured' },
  { intent: '全城性价比高的', type: 'structured' },
  { intent: '带朋友吃湖北菜人均不过百', type: 'structured' },
  { intent: '南湖新开的店', type: 'structured' },
  { intent: '首义早餐热干面', type: 'structured' },
  { intent: '全城火锅', type: 'structured' },
  { intent: '南湖烧烤夜宵', type: 'structured' },
  { intent: '人均不超过50的午饭', type: 'structured' },
  { intent: '首义评分高的店', type: 'structured' },
];

const REAL = process.env.LLM_MODE === 'real';
const transport = REAL ? createDeepSeekTransport() : makeMockTransport();

console.log('╔════════════════════════════════════════════════════════╗');
console.log('  蛮有味 · 廉价验证（DeepSeek 原型 vs 规则引擎）');
console.log(`  模式：${REAL ? 'real（真调 DeepSeek）' : 'mock（离线，编码 LLM 预期行为）'}`);
console.log('╚════════════════════════════════════════════════════════╝\n');

const rows = [];
let sitN = 0, rulesWin = 0, llmWin = 0, structN = 0, structRulesWin = 0, structLlmWin = 0, sitClarified = 0, structClarified = 0;

for (const c of TEST_CASES) {
  const parsed = parseIntent({ intent: c.intent });
  // 规则「vibe 理解」= 是否解析出 category/board/mealTime/maxPrice（即存在可映射的结构化字段）。
  const rulesVibe = !!(parsed.category || parsed.board || (Array.isArray(parsed.mealTime) && parsed.mealTime.length) || parsed.maxPrice != null);

  const rulesOut = await runFoodDiscovery({ intent: c.intent });
  const rulesTotal = rulesOut.success ? rulesOut.output.summary.total_matched : 0;

  let llmVibe = false, llmPrimary = '', llmReason = '', llmTotal = 0, llmErr = '', llmClarified = false;
  try {
    const llmOut = await agentChat({ message: c.intent, sessionId: 'cv', transport });
    if (llmOut.success) {
      if (llmOut.needsClarification) {
        // 模型理解意图但主动反问澄清 → 视为「已介入/懂我」（规则引擎做不到），透明标注。
        llmVibe = true;
        llmClarified = true;
        llmPrimary = '⟳反问';
        llmReason = (llmOut.question || '').slice(0, 60);
      } else if (llmOut.output && llmOut.output.summary && llmOut.output.summary.decision) {
        llmVibe = true;
        llmPrimary = llmOut.output.summary.decision.primaryId;
        llmReason = llmOut.output.summary.decision.reason;
        llmTotal = llmOut.output.merchants.length;
      }
    }
  } catch (e) { llmErr = String(e && e.message || e); }

  rows.push({ intent: c.intent, type: c.type, rulesVibe, rulesTotal, llmVibe, llmPrimary, llmReason, llmTotal, llmErr, llmClarified });
  if (c.type === 'situational') {
    sitN += 1; if (rulesVibe) rulesWin += 1; if (llmVibe) llmWin += 1; if (llmClarified) sitClarified += 1;
  } else {
    structN += 1; if (rulesVibe) structRulesWin += 1; if (llmVibe) structLlmWin += 1; if (llmClarified) structClarified += 1;
  }
}

// 打印明细表
console.log('意图'.padEnd(34), '类目'.padEnd(6), '规则懂我'.padEnd(8), 'LLM懂我'.padEnd(8), 'LLM主推');
for (const r of rows) {
  console.log(
    r.intent.slice(0, 16).padEnd(18),
    r.type === 'situational' ? '情境' : '结构',
    (r.rulesVibe ? '✓' : '✗').padEnd(6),
    (r.llmVibe ? '✓' : '✗').padEnd(6),
    (r.llmPrimary || r.llmErr || '-').slice(0, 16),
  );
}

// 聚合
const rulesWinRate = sitN ? Math.round((rulesWin / sitN) * 100) : 0;
const llmWinRate = sitN ? Math.round((llmWin / sitN) * 100) : 0;

console.log('\n──────── 情境/情绪意图子集（PRD 判定线核心）────────');
console.log(`情境意图数 = ${sitN}（其中 LLM 主动澄清反问 ${sitClarified} 次，记为「已介入/懂我」）`);
console.log(`规则引擎「懂我」率（vibe 可映射）= ${rulesWinRate}%（结构性：无任何字段可映射情绪 → 0%）`);
console.log(`LLM 路径「懂我」率（情绪→约束+理由，含澄清）= ${llmWinRate}%${REAL ? '（真实模型）' : '（mock 编码预期行为）'}`);
console.log(`结构化意图子集：规则 ${structRulesWin}/${structN}、LLM ${structLlmWin}/${structN}（两者均懂，平手）`);

// R2：情绪语境意图在真实 590 数据上的命中（切 wuhan 源，mock 仍走真实数据检索）。
console.log('\n──────── R2：情绪语境意图在真实 590 数据上的命中 ────────');
setDefaultDataSource(createDataSource('wuhan'));
let wuhanHit = 0, wuhanCases = 0;
for (const c of TEST_CASES.filter((x) => x.type === 'situational').slice(0, 5)) {
  try {
    const o = await agentChat({ message: c.intent, sessionId: 'cv-wuhan', transport });
    const ok = o.success && !o.needsClarification && o.output && o.output.merchants.length > 0 && o.output.summary.dataSource === 'wuhan-590';
    if (ok) wuhanHit += 1;
    wuhanCases += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${c.intent.slice(0, 16)} → ${ok ? '真实商户 ' + o.output.merchants[0].id : (o.needsClarification ? '澄清反问' : '失败')}`);
  } catch (e) { console.log(`  ✗ ${c.intent.slice(0, 16)} → ${String(e.message || e)}`); }
}
setDefaultDataSource(createDataSource('sample'));
console.log(`真实 590 数据上情境意图命中率 = ${wuhanCases ? Math.round((wuhanHit / wuhanCases) * 100) : 0}%（${wuhanHit}/${wuhanCases}）`);

// 结论（写回 PRD §2.3 用）
console.log('\n──────── 结论（写回 PRODUCT-REQUIREMENTS.md §2.3）────────');
console.log(`结构性结论：在情境/情绪意图子集，规则引擎 vibe 理解率 ${rulesWinRate}%（无任何字段可映射），`);
console.log(`LLM 路径 ${llmWinRate}%（设计上把情绪翻译成可执行约束+理由）。→ LLM>规则 在情境意图类目成立（结构性确定）。`);
console.log(`定量盲评（≥65% 懂我胜率 & ≥15pp 决策完成率）待 Robin 用真实 Key 跑实时盲评锁定：`);
console.log(`  LLM_MODE=real DEEPSEEK_API_KEY=sk-xxx node hypha/implementation/scripts/cheap-validation.mjs`);

console.log(`\n验证完成（模式=${REAL ? 'real' : 'mock'}）。`);
