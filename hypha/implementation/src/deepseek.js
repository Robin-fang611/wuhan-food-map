// DeepSeek Chat Completions（tool_calling）传输层 —— 仅服务端使用。
//
// 安全红线（贯穿项目 §8）：
//  - API Key 仅从环境变量 DEEPSEEK_API_KEY 读取，绝不硬编码、绝不进前端包、绝不进仓库。
//  - 本模块不打印 / 不回显 Key；错误日志只含状态码与前 200 字符，不含任何密钥。
//  - 通过 env 可覆盖 base URL 与模型名，兼容「直连 DeepSeek 官方」或「经本地网关（如 CCSwitch）」。
//
// 设计：transport 是一个纯函数式接口
//   call(messages, tools) => { content, toolCalls:[{id,name,arguments}] }
// 失败（无 Key / 超时 / 5xx）一律抛错，由调用方（agent-loop / httpServer）做降级。

const DEFAULT_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
// 默认走 DeepSeek 官方 V3 对话模型（稳定支持 tool_calling）。
// 若 Robin 经本地网关（CCSwitch 映射 deepseek-v4-flash）接入，设置
//   DEEPSEEK_BASE_URL=http://127.0.0.1:15721/v1
//   DEEPSEEK_MODEL=deepseek-v4-flash
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEFAULT_TIMEOUT_MS = 20000;

export function isDeepSeekConfigured() {
  return !!process.env.DEEPSEEK_API_KEY;
}

// 把我们的工具定义（{name,description,parameters}）转成 OpenAI / DeepSeek 函数格式。
function toOpenAIFunction(t) {
  return {
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  };
}

function safeParseArgs(s) {
  if (s && typeof s === 'object') return s;
  try { return JSON.parse((s || '').toString() || '{}'); } catch { return {}; }
}

/**
 * 创建 DeepSeek 传输实例。
 * @param {object} opts
 *  - apiKey / baseUrl / model / timeoutMs：覆盖 env 默认值（测试可注入）。
 *  - fetch：注入 fetch 实现（测试可注入 mock）。
 * @returns {{ kind: 'unavailable'|'deepseek', model?:string, call: Function }}
 */
export function createDeepSeekTransport(opts = {}) {
  // 离线演示模式（MYWO_AGENT_MOCK=1）：用脚本化模型跑同一条 ReAct + trace 路径，
  // 便于在无 Key 时体验「Agent 推理轨迹」UI。设 DEEPSEEK_API_KEY 后自动切真模型。
  if (!opts.apiKey && !process.env.DEEPSEEK_API_KEY && process.env.MYWO_AGENT_MOCK === '1') {
    return createMockTransport();
  }

  const apiKey = opts.apiKey != null ? opts.apiKey : process.env.DEEPSEEK_API_KEY;
  const baseUrl = opts.baseUrl != null ? opts.baseUrl : DEFAULT_BASE_URL;
  const model = opts.model != null ? opts.model : DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const fetchFn = opts.fetch != null ? opts.fetch : globalThis.fetch;

  if (!apiKey) {
    // 无 Key：返回 unavailable 传输，call() 始终抛错 → 调用方自动降级到确定性运行时。
    return {
      kind: 'unavailable',
      reason: 'DEEPSEEK_API_KEY 未设置',
      async call() { throw new Error('DEEPSEEK_API_KEY 未设置（LLM 不可用，降级到规则引擎）'); },
    };
  }

  async function call(messages, tools) {
    if (typeof fetchFn !== 'function') {
      throw new Error('运行时缺少 fetch（LLM 不可用）');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchFn(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          tools: tools && tools.length ? tools.map(toOpenAIFunction) : undefined,
          tool_choice: tools && tools.length ? 'auto' : undefined,
          temperature: 0.3,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      // 网络不可达 / 超时（AbortError）：统一抛错 → 降级。
      throw new Error(`DeepSeek 请求失败：${e && e.name === 'AbortError' ? '超时' : (e && e.message || e)}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 5xx / 4xx：抛错 → 降级。注意：不回显任何密钥。
      throw new Error(`DeepSeek HTTP ${res.status}：${text.slice(0, 200)}`);
    }

    const data = await res.json().catch(() => null);
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new Error('DeepSeek 响应缺少 message（结构异常）');

    return {
      content: typeof msg.content === 'string' ? msg.content : '',
      toolCalls: (msg.tool_calls || []).map((tc) => ({
        id: tc.id,
        name: tc.function && tc.function.name,
        arguments: safeParseArgs(tc.function && tc.function.arguments),
      })),
      usage: (data && data.usage) || null, // W7：token 用量（成本日志）
    };
  }

  return { kind: 'deepseek', model, call };
}

// 脚本化模型（离线演示用）：跑同一条 ReAct 路径，产出真实工具调用 + 决策，便于体验推理轨迹 UI。
function createMockTransport() {
  let n = 0;
  const pickFromSearch = (messages) => {
    const lastTool = [...messages].reverse().find((m) => m.role === 'tool');
    if (!lastTool) return { primary: 's006', alts: ['s003', 's004'] };
    try {
      const d = JSON.parse(lastTool.content);
      const ids = (d.merchants || []).map((m) => m.id).filter(Boolean);
      if (ids.length) return { primary: ids[0], alts: ids.slice(1, 4) };
    } catch { /* 兜底 */ }
    return { primary: 's006', alts: ['s003', 's004'] };
  };
  const userText = (messages) => {
    const u = [...messages].reverse().find((m) => m.role === 'user');
    return (u && u.content || '').toString();
  };
  return {
    kind: 'mock',
    async call(messages) {
      n += 1;
      if (n >= 3) {
        const { primary, alts } = pickFromSearch(messages);
        return {
          content: '对比后选定最贴合的一家，附 2~3 备选。',
          toolCalls: [{ id: 'c3', name: 'finalize_recommendation', arguments: { primaryId: primary, alternativeIds: alts, reason: `查了「${primary}」的招牌菜与环境，确实贴合你此刻的状态（情绪→可执行约束+事实核实）`, guidance: '去试试这家~' } }],
        };
      }
      if (n === 2) {
        const { primary } = pickFromSearch(messages);
        return { content: `深入了解「${primary}」的招牌菜/人均/环境`, toolCalls: [{ id: 'c2', name: 'get_merchant_detail', arguments: { merchantId: primary } }] };
      }
      const txt = userText(messages);
      const thinking = (txt.includes('心情') || txt.includes('治愈'))
        ? '理解：情绪偏治愈，倾向温暖汤羹类'
        : (txt.includes('暗恋') || txt.includes('第一次') || txt.includes('请客'))
          ? '理解：社交场景，环境好、不踩雷优先'
          : '理解：综合你的预算/场景/片区收窄候选';
      return { content: thinking, toolCalls: [{ id: 'c1', name: 'search_merchants', arguments: { zone: '全城', sort: 'rating', limit: 6 } }] };
    },
  };
}
