// Agent Loop（Path B 自有 Node 后端 LLM 大脑）—— ReAct 循环驱动 DeepSeek tool_calling。
//
// 职责：收自然语言 → 调 DeepSeek（tool_calling）→ 解析工具调用 → 经「工具 facade」复用既有
// 10 个领域工具 adapter（discover.filter/rank/geo/detail/navigate + engage 系列）→ 组装
// output.food-recommendation（含 1 主推 + 理由 + 2~3 备选 的 decision 契约 + guidance + provenance）。
//
// 红线守约：
//  - DeepSeek Key 仅由 deepseek.js 从 env 读取，本文件不持有 Key。
//  - 模型输出当不可信文本：finalize_recommendation 的 merchantId 必须经数据存在性校验，
//    不存在即丢弃；reason/guidance 仅作为文本（前端 textContent 渲染，防 XSS）。
//  - 工具 facade 只回传投影后的商户（不含 PII），导航只用真实坐标 + 公开 URI。
//  - CPS 标（cpsTag）仅在结果装配后由 cps.js 追加（渲染层），**绝不**进入排序/过滤（防火墙）。
//
// 降级：transport.call() 抛错（无 Key / 超时 / 5xx）→ 本函数抛 AgentFallbackError，
//  由 httpServer 捕获并改跑确定性 runFoodDiscovery（R1 熔断，前端无感）。

import { getDataSource, createDataSource } from './datasource/index.js';
import discoverFilter from './tools/filter.js';
import discoverRank from './tools/rank.js';
import discoverGeo from './tools/geo.js';
import discoverDetail from './tools/detail.js';
import { projectMerchant, buildAmapUrl, parsePrice } from './runtime.js';
import { explainRecommendation } from './explain.js';
import { parseIntent } from './intent-parser.js';
import { PROCESS_HASH, FSM_PATH, PROMPT_REFS } from './provenance.js';
import { redlineCheck } from './orchestrator.js';
import { isCpsEnrolled } from './cps.js';
import { getProfile, upsertProfile, profileToSystemText } from './memory-store.js';

export class AgentFallbackError extends Error {
  constructor(msg) { super(msg); this.name = 'AgentFallbackError'; }
}

// —— 工具 facade：把「模型可调用的高层动作」映射到既有 10 工具 adapter ——
// 模型不直接拿到 590 条原始数据，只拿到 facade 返回的投影候选集；排序/过滤仍然由
// 真实 adapter（filter/rank/geo）完成，满足「复用 10 工具」。

function sortBy(list, sort) {
  const arr = list.slice();
  if (sort === 'price') {
    arr.sort((a, b) => (parsePrice(a.avgPrice) ?? Infinity) - (parsePrice(b.avgPrice) ?? Infinity));
  } else {
    arr.sort((a, b) => rankScore(b) - rankScore(a) || (parsePrice(a.avgPrice) ?? Infinity) - (parsePrice(b.avgPrice) ?? Infinity));
  }
  return arr;
}
function rankScore(m) {
  return m.rating === '必吃' ? 2 : m.rating === '推荐' ? 1 : 0;
}

// 给模型看的精简商户摘要（去掉坐标等非必要字段，坐标只在导航时由后端查）。
function summarizeForModel(m) {
  const { lng, lat, ...rest } = m;
  return rest;
}

async function facadeSearch(params = {}) {
  const ds = getDataSource();
  const all = await ds.listMerchants();
  const p = {
    zone: '武汉全城', mealTime: [], categories: [], maxPrice: null,
    keyword: '', sort: null, board: null, limit: 8, ...params,
  };
  let merchants; let ranked_by;
  if (p.board) {
    const f = await discoverFilter({ merchants: all, zone: p.zone, categories: p.categories, mealTime: p.mealTime, maxPrice: p.maxPrice });
    const r = await discoverRank({ merchants: f.output.merchants, board: p.board, limit: 0 });
    merchants = r.output.merchants; ranked_by = r.output.ranked_by;
  } else {
    const f = await discoverFilter({ merchants: all, zone: p.zone, categories: p.categories, mealTime: p.mealTime, maxPrice: p.maxPrice, keyword: p.keyword });
    merchants = f.output.merchants; ranked_by = p.sort || 'rating';
  }
  if (p.zone === '财大南湖周边') {
    const g = await discoverGeo({ merchants, fromZone: p.zone });
    merchants = g.output.merchants;
    if (p.sort === 'distance') ranked_by = 'distance';
    else merchants = sortBy(merchants, p.sort || 'rating');
  } else if (!p.board) {
    merchants = sortBy(merchants, p.sort || 'rating');
  }
  const limited = merchants.slice(0, Number(p.limit) || 8);
  return { ranked_by, merchants: limited.map((m) => summarizeForModel(m)), total: merchants.length };
}

async function facadeDetail({ merchantId } = {}) {
  const r = await discoverDetail({ merchantId });
  if (!r.success) return { error: r.error || '未找到商户' };
  return summarizeForModel(r.output);
}

async function facadeNavigate({ merchantId } = {}) {
  const ds = getDataSource();
  const m = await ds.getMerchantById(merchantId);
  if (!m) return { url: null, name: null, hint: '未找到商户' };
  const url = buildAmapUrl(m);
  return { url, name: m.name || null, hint: url ? undefined : '缺少有效坐标，导航不可用（守红线不编造）' };
}

// —— 暴露给模型的工具定义（OpenAI/DeepSeek function schema）——
const TOOL_DEFS = [
  {
    name: 'search_merchants',
    description: '在美食库中按条件筛选/排榜，返回候选商户列表（不含坐标）。用于先收窄候选集。参数尽量用用户原话推断。',
    parameters: {
      type: 'object',
      properties: {
        zone: { type: 'string', enum: ['财大南湖周边', '武汉全城'], description: '片区' },
        categories: { type: 'array', items: { type: 'string' }, description: '分类，如 烧烤/小吃宵夜/湖北菜/火锅' },
        mealTime: { type: 'array', items: { type: 'string', enum: ['早', '午', '晚', '夜宵'] }, description: '用餐场景' },
        maxPrice: { type: 'number', description: '人均上限（元）' },
        keyword: { type: 'string', description: '招牌菜/店名关键词，如 牛肉面/烧烤' },
        sort: { type: 'string', enum: ['rating', 'price', 'distance'], description: '排序：评分/人均/距离' },
        board: { type: 'string', enum: ['mustEat', 'value', 'lateNight', 'newest'], description: '榜单：必吃/性价比/夜宵/新收录' },
        limit: { type: 'integer', description: '返回条数（默认 8）' },
      },
      required: [],
    },
  },
  {
    name: 'get_merchant_detail',
    description: '取单店详情（招牌菜/人均/评分/理由/地址）。在想深入了解某家店时调用。',
    parameters: {
      type: 'object',
      properties: { merchantId: { type: 'string', description: '商户 id' } },
      required: ['merchantId'],
    },
  },
  {
    name: 'get_navigation',
    description: '取某商户的高德导航链接（公开 URI，无密钥）。在用户想导航时调用。',
    parameters: {
      type: 'object',
      properties: { merchantId: { type: 'string', description: '商户 id' } },
      required: ['merchantId'],
    },
  },
  {
    name: 'finalize_recommendation',
    description: '提交最终推荐决策。必须先用 search_merchants 收窄候选。primaryId 为主推，alternativeIds 为 2~3 个备选，reason 解释为何适合用户此刻状态，guidance 给用户的一句话导览，note 可选（诚实声明：如数据库没有完全符合的店铺时，说明差距与建议）。',
    parameters: {
      type: 'object',
      properties: {
        primaryId: { type: 'string', description: '主推商户 id' },
        alternativeIds: { type: 'array', items: { type: 'string' }, description: '2~3 个备选商户 id' },
        reason: { type: 'string', description: '一句话理由：为什么这家适合用户此刻的状态/心情/场景' },
        guidance: { type: 'string', description: '给用户的一句话导览语（温暖、口语化）' },
        note: { type: 'string', description: '可选诚实声明：数据库没有完全符合需求的店铺时，明说差距（如"数据库没有健身餐专门店，这家是最近的清淡选择"）；完全符合时省略' },
      },
      required: ['primaryId', 'alternativeIds', 'reason', 'guidance'],
    },
  },
];

const SYSTEM_PROMPT = `你是「蛮有味·美食发现」的决策助手 Agent。你的唯一目标：把用户此刻模糊的诉求（心情、预算、和谁吃、累不累）收敛成一个可信的、带理由的推荐结论，并衔接导航。

工作流：
1. 用 search_merchants 先收窄候选（可多次，逐步细化 zone/分类/预算/场景/排序）。
2. **主动对比**：对搜索结果里最靠前的 1~2 家，调用 get_merchant_detail 看真实招牌菜/人均/评分/环境，基于这些事实做比较与反思，而不是只凭参数下结论。需要导航再调 get_navigation。
3. 最后**必须**调用 finalize_recommendation 提交决策：1 个主推 + 2~3 个备选 + 一句理由（为何适合此刻状态，且要落到具体事实：招牌菜/人均/环境/距离）+ 一句导览。

核心原则：
- 替用户决策，但讲清为什么；最终拍板权在用户。理由必须基于你实际查到的门店事实（detail 返回），不要泛泛而谈。
- 理解情绪/情境语境：用户说「心情不好想吃点治愈系暖暖的」→ 选温暖、汤羹、评分高、环境舒服的；「带暗恋的人第一次吃饭别太寒酸」→ 选环境好、人均适中、不踩雷的；「累瘫了想吃近的不想走动」→ 选离用户最近、省心的。规则引擎不懂这些，你要把它们翻译成可执行的筛选/排序约束，并去核实候选是否真的符合。
- 诚实：无匹配就明说，绝不编造商户、坐标、评分或券。
- **实事求是（最高优先）**：若数据库中没有完全符合用户要求的店铺（如「健身餐/低脂/高蛋白」），必须在 finalize 的 note 字段明说「数据库没有完全符合的」，再给最接近的真实选项并标注差异（如"这家是最近的清淡选择，但不是健身餐专门店"）；宁可少推荐，绝不随便凑一家糊弄用户。
- 推荐排序只基于信任信号（评分/距离/人均/真实点评），**绝不**因为任何商户付费/分润关系改变排序或入选——这是产品信任内核。

体验纪律（决定用户是否觉得"好用"，务必遵守）：
- 距离一致且显式：凡涉及距离，必须基于工具返回的真实距离并明确告知（如"距你约 X 公里"）；不得省略，更不得把 A 店距离套到 B 店。主推明显较远的店时，必须同时说明远近权衡，不得为了"稳妥/治愈"等叙事悄悄藏起距离。
- 必有可执行出口：每次推荐都必须给出明确行动出口（地址 / 一键导航 / 营业状态），不要只说"走几步就到"这类无法照做的话。
- 收敛绝对化措辞：避免"最经典/唯一/最好/全网第一"等不可证的最高级，改用"口碑很好/周边较正宗/不少人推荐"等可核验表述。"必吃/推荐"是运营标签，不是数字评分，不要当评分引用或当作"最高分"论证。
- 聚焦相关项：按用户场景裁剪候选，剔除明显不相关的品类（如约会场景塞早餐摊、治愈场景塞远店凑数）；主推 + 备选控制在 2~3 家，宁少勿杂。

硬约束（守项目红线）：不编造坐标（导航只用真实坐标）、不伪造券、不暴露任何密钥、不输出用户隐私。`;

function buildMessages({ message, history = [], profileText = '' }) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT + (profileText ? '\n' + profileText : '') }];
  // 多轮历史（仅保留最近若干轮，控制上下文）
  for (const h of history.slice(-8)) {
    if (h && h.role && h.content) messages.push({ role: h.role, content: String(h.content) });
  }
  messages.push({ role: 'user', content: message });
  return messages;
}

// 执行一次模型工具调用，返回给模型的 tool 结果（文本/JSON 字符串）。
async function executeToolCall(tc) {
  const name = tc.name;
  const args = tc.arguments && typeof tc.arguments === 'object' ? tc.arguments : {};
  try {
    if (name === 'search_merchants') return JSON.stringify(await facadeSearch(args));
    if (name === 'get_merchant_detail') return JSON.stringify(await facadeDetail(args));
    if (name === 'get_navigation') return JSON.stringify(await facadeNavigate(args));
    if (name === 'finalize_recommendation') return JSON.stringify({ ok: true, committed: true });
    return JSON.stringify({ error: `未知工具: ${name}` });
  } catch (e) {
    return JSON.stringify({ error: String(e && e.message || e) });
  }
}

// 把工具返回摘要成人类可读的一句话，用于前端「推理轨迹」展示（不泄露坐标/PII）。
function describeToolResult(name, r) {
  if (name === 'search_merchants') {
    const n = Array.isArray(r.merchants) ? r.merchants.length : 0;
    return `找到 ${n} 家候选（按 ${r.ranked_by || '推荐度'}）`;
  }
  if (name === 'get_merchant_detail') return r && r.name ? `查看「${r.name}」详情` : '查看商户详情';
  if (name === 'get_navigation') return r && r.url ? `获取「${r.name || '商户'}」导航链接` : `「${r && r.name || '商户'}」缺坐标，导航不可用`;
  if (name === 'finalize_recommendation') return '提交最终推荐决策';
  return '完成';
}

// 把模型提交的主推+备选解析为真实商户对象（模型输出不可信 → 校验存在性）。
async function resolveDecision(decision, dataSource) {
  const ds = dataSource || getDataSource();
  const ids = [decision.primaryId, ...(Array.isArray(decision.alternativeIds) ? decision.alternativeIds : [])]
    .filter(Boolean);
  const seen = new Set();
  const ordered = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const m = await ds.getMerchantById(id);
    if (!m) continue; // 丢弃不存在的 id（防幻觉）
    seen.add(id);
    ordered.push(projectMerchant(m));
  }
  return ordered;
}

// 主入口：一次对话回合。
// @param {object} opts
//  - message：用户本轮自然语言
//  - sessionId：会话 id（记忆隔离）
//  - history：多轮历史 [{role,content}]
//  - transport：LLM 传输（默认 createDeepSeekTransport()）；测试可注入 mock
//  - dataSource：可选 FoodDataSource 覆盖（验证用）
// @returns {Promise<{success, output, trace, fallback:false}>}
export async function agentChat(opts = {}) {
  const {
    message,
    sessionId = 'anon',
    history = [],
    transport,
    dataSource,
  } = opts;

  if (!message || !String(message).trim()) {
    throw new AgentFallbackError('空消息');
  }

  const t = transport || (await import('./deepseek.js')).createDeepSeekTransport();

  // —— 记忆：读取并回灌系统提示；用规则解析补充结构化偏好 ——
  const profile = getProfile(sessionId);
  const profileText = profileToSystemText(profile);
  const parsed = parseIntent({ intent: message });
  upsertProfile(sessionId, {
    zone: parsed.zone || profile.zone,
    mealTime: parsed.mealTime && parsed.mealTime.length ? parsed.mealTime : profile.mealTime,
    category: parsed.category || profile.category,
    maxPrice: parsed.maxPrice != null ? parsed.maxPrice : profile.maxPrice,
  });

  const messages = buildMessages({ message, history, profileText });
  const tools = TOOL_DEFS;

  // 防御：循环体内任何非预期内部错误（模型偶发脏输出导致的属性读取异常等）
  // 一律转成 AgentFallbackError → 由上层优雅降级到确定性引擎，而非返回 400。
  try {
  let lastSearch = null;
  let committed = null;
  let clarification = null;
  const steps = [];
  const MAX_STEPS = 8;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    let resp;
    try {
      resp = await t.call(messages, tools);
    } catch (e) {
      // LLM 不可用 / 超时 / 5xx → 抛 fallback，由上层改跑确定性运行时。
      throw new AgentFallbackError(e && e.message || String(e));
    }

    // 模型提交决策 → 记录并跳出。
    const finalize = (resp.toolCalls || []).find((tc) => tc.name === 'finalize_recommendation');
    if (finalize) {
      committed = finalize.arguments || {};
      if (!committed.guidance && resp.content) committed.guidance = resp.content.slice(0, 200);
      steps.push({
        kind: 'finalize',
        thinking: resp.content || '',
        decision: { primaryId: committed.primaryId, alternatives: Array.isArray(committed.alternativeIds) ? committed.alternativeIds : [] },
        reason: committed.reason || '',
      });
      break;
    }

    // 有工具调用：执行并回灌；记录到推理轨迹。
    const toolCalls = resp.toolCalls || [];
    if (toolCalls.length) {
      const actions = [];
      // 回灌给 DeepSeek 的 tool_calls 必须符合 OpenAI/DeepSeek 格式：
      // 每个元素需 { id, type:'function', function:{ name, arguments(字符串) } }。
      messages.push({
        role: 'assistant',
        content: resp.content || '',
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}),
          },
        })),
      });
      for (const tc of toolCalls) {
        const result = await executeToolCall(tc);
        let summary = '完成';
        try { summary = describeToolResult(tc.name, JSON.parse(result)); } catch { /* ignore */ }
        actions.push({ tool: tc.name, args: tc.arguments || {}, summary });
        if (tc.name === 'search_merchants') {
          try { lastSearch = JSON.parse(result); } catch { /* ignore */ }
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
      steps.push({ kind: 'tool', thinking: resp.content || '', actions });
      continue;
    }

    // 模型只回了文本：若已有候选则兜底合成决策；否则视为澄清反问（真 Agent 行为）。
    if (lastSearch && Array.isArray(lastSearch.merchants) && lastSearch.merchants.length) {
      committed = {
        primaryId: lastSearch.merchants[0].id,
        alternativeIds: lastSearch.merchants.slice(1, 4).map((m) => m.id),
        reason: '基于你的需求，这几家最贴合。',
        guidance: resp.content || '为你挑了几家，看看合不合口味~',
      };
      steps.push({ kind: 'finalize', thinking: resp.content || '', decision: { primaryId: committed.primaryId, alternatives: committed.alternativeIds }, reason: committed.reason });
      break;
    }
    // 无工具、无候选、有文本 → 这是 Agent 在反问以澄清意图。
    if (resp.content && resp.content.trim()) {
      clarification = resp.content.trim();
      steps.push({ kind: 'question', thinking: clarification });
      break;
    }
    throw new AgentFallbackError('模型未调用工具且未提交决策');
  }

  // 澄清反问：不降级，把问题抛回前端继续多轮。
  if (clarification && !committed) {
    return {
      success: true,
      needsClarification: true,
      question: clarification,
      output: null,
      trace: { state: 'Clarifying', driver: 'hypha-react', steps },
      fallback: false,
    };
  }

  if (!committed || !committed.primaryId) {
    throw new AgentFallbackError('未达到 finalize_recommendation');
  }

  // —— 装配 output.food-recommendation ——
  const ds = dataSource || getDataSource();
  const decisionMerchants = await resolveDecision(committed, ds);

  // 若主推解析为空（模型幻觉 id），降级。
  if (!decisionMerchants.length) {
    throw new AgentFallbackError('主推商户 id 无效（幻觉）');
  }

  // 用最后一次 search 的候选集补全「更多推荐」（排除已入选）。
  const inDecision = new Set(decisionMerchants.map((m) => m.id));
  const extra = (lastSearch && Array.isArray(lastSearch.merchants) ? lastSearch.merchants : [])
    .map((m) => m.id)
    .filter((id) => !inDecision.has(id))
    .slice(0, 6);
  const extraMerchants = [];
  for (const id of extra) {
    const m = await ds.getMerchantById(id);
    if (m) extraMerchants.push(projectMerchant(m));
  }

  const allMerchants = [...decisionMerchants, ...extraMerchants];

  // 透明化：为 LLM 路径的候选也附上确定性推荐因子（与 /run 同契约），
  // 使前端「为什么推荐这家」在两种大脑下一致呈现。基于解析后的意图推导，不篡改模型结论。
  for (const m of allMerchants) {
    const ex = explainRecommendation(m, { params: parsed });
    m.factors = ex.factors;
    m.scoreBreakdown = ex.scoreBreakdown;
    m.confidence = ex.confidence;
    if (!m.reason) m.reason = ex.reason;
  }

  // 计算最近一家（就近参考点；全城用中心）。
  let nearest = null;
  const zoneForGeo = parsed.zone || '武汉全城';
  if (zoneForGeo === '财大南湖周边') {
    const g = await discoverGeo({ merchants: allMerchants, fromZone: zoneForGeo });
    const withDist = g.output.merchants.filter((m) => typeof m.distanceKm === 'number');
    if (withDist.length) nearest = { id: withDist[0].id, name: withDist[0].name, distanceKm: withDist[0].distanceKm };
  }

  // CPS 标（渲染层，排序后追加，绝不影响入选/排序）。
  for (const m of allMerchants) m.cpsTag = isCpsEnrolled(m.id);

  const summary = {
    query: message,
    total_matched: allMerchants.length,
    ranked_by: (lastSearch && lastSearch.ranked_by) || 'llm',
    nearest,
    dataSource: ds.name,
    coupon_hint: allMerchants.some((m) => m.cpsTag)
      ? '部分商户已接入「到店核销分润」，卡片标「可核销优惠」'
      : '当前暂无可核销商户（签约后卡片自动挂标，不影响排序）',
    degradation: [],
    guidance: committed.guidance || committed.reason || '',
    note: committed.note || '', // W1.3：LLM 诚实声明（数据缺口/差距说明），前端渲染
    decision: {
      primaryId: decisionMerchants[0].id,
      reason: committed.reason || '',
      alternatives: decisionMerchants.slice(1).map((m) => m.id),
      factors: decisionMerchants[0] ? (decisionMerchants[0].factors || []) : [],
    },
    provenance: {
      driver: 'hypha-react',
      processHash: PROCESS_HASH,
      fsm: FSM_PATH,
      prompts: PROMPT_REFS,
      deterministic: false,
    },
  };

  const output = { merchants: allMerchants, summary };

  // 红线校验（确定性）：输出不得含 PII / 伪造坐标 / 暴露密钥。
  const redline = redlineCheck(output);
  if (!redline.passed) {
    throw new AgentFallbackError('红线校验失败：' + redline.violations.join(','));
  }

  // 记忆生效（去标识化，仅偏好维度，供前端展示「基于你的口味」）。
  const memoryUsed = {
    zone: profile.zone || null,
    mealTime: profile.mealTime && profile.mealTime.length ? profile.mealTime : null,
    category: profile.category || null,
    maxPrice: typeof profile.maxPrice === 'number' ? profile.maxPrice : null,
  };

  return {
    success: true,
    output,
    trace: { state: 'Completed', driver: 'hypha-react', steps, memoryUsed },
    fallback: false,
  };
  } catch (e) {
    if (e instanceof AgentFallbackError) throw e;
    throw new AgentFallbackError('Agent 内部异常：' + (e && e.message || e));
  }
}
