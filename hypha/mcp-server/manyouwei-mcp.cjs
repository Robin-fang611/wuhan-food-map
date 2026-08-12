// 蛮有味·美食发现 —— Hypha MCP 工具服务（本地stdio）
// -----------------------------------------------------------------------------
// 把 h5 现有 L1 适配层（:8799 工具服务）的 10 个工具，原样暴露为 Hypha 可治理的
// MCP 工具。Hypha Server 通过 config.yaml 的 mcpServers（mode: local，command: node）
// 以子进程方式拉起本文件，连接后需经 /mcp/servers/:id/capabilities/:cap/approve
// 审批，工具才会进入 approvedMCPRegistry，供 ReAct 运行时按 capabilityId 解析。
//
// 关键约定（已对照 ~/opt/hypha 源码核实）：
//   - 每个工具的 MCP name 必须是「裸 id」（如 discover.filter），这样
//     normalizeMCPToolSpec 产出的 sourceRef.capabilityId === 裸 id，domainPack
//     里引用的 discover.filter 才能经 findApprovedMCPTool 命中。
//   - SDK 走绝对 CJS 路径（hypha 自带 @modelcontextprotocol/sdk@1.30.0）。
// -----------------------------------------------------------------------------

// 注意：绝对路径 require 不走 package exports 映射，必须指向真实 CJS 构建文件。
const SDK = '/Users/onebilion/opt/hypha/node_modules/@modelcontextprotocol/sdk';
const { Server } = require(SDK + '/dist/cjs/server/index.js');
const { StdioServerTransport } = require(SDK + '/dist/cjs/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require(SDK + '/dist/cjs/types.js');

const TOOL_BASE = process.env.MYWO_TOOL_BASE || 'http://127.0.0.1:8799';

// 10 个工具契约（对齐 manyouwei-food-discovery.domain.server.yaml §4）。
// 注意：discover.filter / discover.rank / discover.geo 的 merchants 在 :8799 端
// 默认回退 ALL_MERCHANTS，故这里不设为 required，让 LLM 只传筛选条件即可。
const TOOLS = [
  {
    name: 'discover.filter',
    description:
      '按 zone(财大南湖周边/武汉全城)/categories/mealTime(早/午/晚/夜宵)/maxPrice/keyword 组合筛选商户，返回候选集，不修改源数据。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        zone: { type: 'string', enum: ['财大南湖周边', '武汉全城'] },
        categories: { type: 'array', items: { type: 'string' } },
        mealTime: { type: 'array', items: { type: 'string', enum: ['早', '午', '晚', '夜宵'] } },
        maxPrice: { type: 'number', description: '人均上限（元）' },
        keyword: { type: 'string', description: '店名/招牌菜关键词' },
      },
    },
  },
  {
    name: 'discover.rank',
    description:
      '四榜（mustEat 必吃 / value 性价比 / lateNight 夜宵 / newest 新收录），对候选集或全量商户排名，返回带 ranked_by 的结果。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        board: {
          type: 'string',
          enum: ['mustEat', 'value', 'lateNight', 'newest'],
          description: '榜单类型，默认 mustEat',
        },
        limit: { type: 'integer', minimum: 0, maximum: 50, description: '返回条数，0=不限' },
      },
    },
  },
  {
    name: 'discover.detail',
    description: '取单店招牌菜/人均/评分/理由/地址/坐标，对齐 ui/detail.js 与数据 schema。',
    inputSchema: {
      type: 'object',
      required: ['merchantId'],
      additionalProperties: false,
      properties: { merchantId: { type: 'string' } },
    },
  },
  {
    name: 'discover.geo',
    description:
      '按校区坐标（财大南湖周边 114.370,30.480）算球面距离并就近排序。',
    inputSchema: {
      type: 'object',
      required: ['fromZone'],
      additionalProperties: false,
      properties: {
        fromZone: { type: 'string', enum: ['财大南湖周边', '武汉全城'] },
      },
    },
  },
  {
    name: 'discover.navigate',
    description: '用商户 GCJ-02 坐标生成高德导航 URL（Key 由后端代理/构建注入，绝不下发明文密钥）。',
    inputSchema: {
      type: 'object',
      required: ['lng', 'lat', 'name'],
      additionalProperties: false,
      properties: {
        lng: { type: 'number' },
        lat: { type: 'number' },
        name: { type: 'string' },
      },
    },
  },
  {
    name: 'user.favorite',
    description: '写入当前用户本地收藏（幂等），仅影响本人数据。',
    inputSchema: {
      type: 'object',
      required: ['merchantId'],
      additionalProperties: false,
      properties: {
        merchantId: { type: 'string' },
        action: { type: 'string', enum: ['add', 'remove'] },
      },
    },
  },
  {
    name: 'reward.checkin',
    description: '每日签到得券：按连续签到档位经 CouponIssuer 发券（满20减3/满30减6/满50减12）。',
    inputSchema: {
      type: 'object',
      required: ['userId'],
      additionalProperties: false,
      properties: { userId: { type: 'string' } },
    },
  },
  {
    name: 'reward.view-wallet',
    description: '查看当前用户已得/已核销/已过期券（本地原型），不泄露他人券数据。',
    inputSchema: {
      type: 'object',
      required: ['userId'],
      additionalProperties: false,
      properties: { userId: { type: 'string' } },
    },
  },
  {
    name: 'reward.claim',
    description: '领商家券（claim 玩法，默认满减5），经 CouponIssuer 发券；不伪造、不越权。',
    inputSchema: {
      type: 'object',
      required: ['userId'],
      additionalProperties: false,
      properties: {
        userId: { type: 'string' },
        merchantId: { type: 'string' },
      },
    },
  },
  {
    name: 'analytics.track',
    description:
      '记录行为事件（app_open/detail_view/search/rank_click/nav_click/favorite/checkin/claim），本地缓冲 + 匿名 vid，递归剥离 PII。',
    inputSchema: {
      type: 'object',
      required: ['event'],
      additionalProperties: false,
      properties: {
        event: { type: 'string' },
        payload: { type: 'object' },
      },
    },
  },
];

async function callTool(name, args) {
  const url = `${TOOL_BASE}/tools/${name}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { success: false, error: '非 JSON 响应', raw: text.slice(0, 500) };
  }
  return data;
}

const server = new Server(
  { name: 'manyouwei-food-discovery', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const known = TOOLS.find((t) => t.name === name);
  if (!known) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: `未知工具: ${name}` }) }],
    };
  }
  try {
    const out = await callTool(name, request.params.arguments || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(out) }],
      structuredContent: out,
    };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: '调用失败', detail: msg }) }],
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
