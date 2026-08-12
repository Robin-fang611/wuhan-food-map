# 蛮有味·美食地图 Agent —— Hypha 分层架构 + 实施路线图

> 本文档**只做设计**，不修改任何 h5 代码。它把 `manyouwei-food-discovery.domain.yaml`
> （已离线编译通过的 DomainPack）落到本机 Hypha 运行时（端口 3000），给出分层架构、
> 10 个工具的适配映射、运行时注册步骤、客户端集成方案、数据/红线对策与有序可验证的落地路线。
>
> 设计基线（与 DomainPack / README 一致）：本机 Docker（hypha-redis / hypha-mongodb 已跑）、
> Hypha Server 端口 3000 healthy、纯前端数据资产（590 商户 + 32 玩乐点）沿用、**不碰密钥/不发布**。

---

## 1. 总览：分层架构图（ASCII）

```
┌──────────────────────────────────────────────────────────────────────────┐
│  用户 / 浏览器 (h5/)                                                        │
│  main.js 视图路由 ──▶ 意图栏 / 对话入口 ──▶ 发 food-discovery 请求          │
└───────────────┬──────────────────────────────────────────────────────────┘
                │  HTTP (本机 3000) start-run / chat
                ▼
╔════════════════════════════════════════════════════════════════════════════╗
║  L3  客户端集成层 (hypha/integration/agent-client.js, 改 main.js 挂载)       ║
║   - 把意图归一化为 task.food-discovery 入参 → POST 运行端点                  ║
║   - 跑 FSM (Intake→Discover→Detail→Engage→Track→Completed)                 ║
║   - 回传 output.food-recommendation → h() 安全渲染                          ║
╠════════════════════════════════════════════════════════════════════════════╣
║  L2  运行时注册层 (hypha/implementation/activate.cjs)                        ║
║   - loadDomainPackFile / compileDomainPackToHarnessedSystem → processHash   ║
║   - applyDomainAgentPatch → 把 tools/skills/policies 合并进 agent spec       ║
║   - 三个函数均为【纯离线】，不激活 Server；激活需 tool-adapter-profile+重启  ║
║   - 激活进运行中的 Hypha Server (3000)：合并 profiles 进 configs + 重启     ║
╠════════════════════════════════════════════════════════════════════════════╣
║  L1  适配层 (hypha/implementation/src/tools/*.js, 纯函数, 无 DOM)           ║
║   10 个 ToolSpec → 逐个薄适配到 h5 真实函数/数据 (tool 01~10)               ║
║   本地工具服务 (node httpServer, :8788) 暴露 POST /tools/:id                ║
╠════════════════════════════════════════════════════════════════════════════╣
║  L0  契约层 (hypha/manyouwei-food-discovery.domain.yaml)   [已稳, 仅微调]   ║
║   1 task + 6 FSM + 10 ToolSpec + 4 Skill + 3 Policy + output.food-recommendation ║
╠════════════════════════════════════════════════════════════════════════════╣
║  L4  数据/红线层 (贯穿 L1~L3)                                               ║
║   数据质量对策(rating缺67%/reason缺73%/coupon 0%) + 红线 policy.redlines-food║
║   渲染 h() 防 XSS / analytics 剥离 PII / 密钥不进前端                        ║
╚════════════════════════════════════════════════════════════════════════════╝
                │ 工具 HTTP 调用 (本机 :8788)
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  h5/src (只读复用, 不改)  core/query.js · core/ranking.js · core/auth.js   │
│  core/store.js · core/analytics.js · plays/checkin.js · plays/claim.js    │
│  data/merchants.js · ui/detail.js 的 buildAmapUrl (纯函数抽取)             │
└──────────────────────────────────────────────────────────────────────────┘
```

**分层职责一句话**：L0 是图纸（契约），L1 是「机器接电」（把工具绑到真实函数），
L2 是「工厂开机」（把系统激活进运行中的 Server），L3 是「产品连工厂」（前端发意图、收契约、渲染），
L4 是贯穿全层的「安全与质量护栏」。

---

## 2. 分层明细

### L0 契约层（已稳，仅微调）
- **职责**：单一事实来源。声明产品全部受治理构造（id / schema / FSM / 权限 scope / 红线）。
- **输入**：领域需求（已固化在 yaml）。**输出**：`HarnessedAgentSystemSpec` 的编译前声明。
- **涉及文件**：`hypha/manyouwei-food-discovery.domain.yaml`、`hypha/README.md`、`hypha/compile-check.cjs`。
- **与 Hypha 原语映射**：直接是 DomainPack 的 `taskSchemas / outputContracts / tools / allowedSkills+skillPolicies / policies / workflows(FSM) / allowedPromptRefs / deploymentProfile`。
- **微调点（仅建议，非必改）**：`discover.navigate` 当前 `source: http`，但本产品导航只是 URL 拼接（公开 uri.amap.com，无 Key），改为 `source: local` 更贴合「零密钥、本机可跑」，避免 Hypha 把它当外部 HTTP 副作用治理。其余保持。

### L1 适配层（Adapter，薄包装，纯函数、无 DOM）
- **职责**：把 10 个 `ToolSpec` 逐个映射到 h5 真实实现；输入对齐 `ToolSpec.inputSchema`，
  输出对齐 `output.food-recommendation` 相关字段。**不直接碰 DOM/UI**，只复用 `core/` 纯逻辑 + `data/`。
- **输入**：ToolSpec 入参（json）。**输出**：`{ success, output }`（对齐 freight 工具服务返回形状）。
- **涉及文件**：`hypha/implementation/src/tools/*.js`（新增）、`hypha/implementation/src/httpServer.js`（新增，仿 freight）。
- **与 Hypha 原语映射**：每个 adapter 实现 DomainPack 中一个 `tools[i].id`，并自动继承其
  `sideEffectLevel` (read/write) 与 `permissionScope`，由 `policy.readonly` / `policy.user-data-write` 治理。
- **关键约束**：`ui/detail.js` / `ui/map.js` 含 `h()`/DOM，node 不可直接 import；因此只抽取其中的
  **纯函数**（`buildAmapUrl`）和 `core/` 纯模块。`auth.js`/`store.js`/`analytics.js` 自带
  `memoryFallback()`，node 下不崩，可直接 import。

### L2 运行时注册层（编译 + 激活）
- **职责**：**离线编译** DomainPack → 产出 `processHash` / `harnessedSystem` / `agentPatch`；
  并准备把工具适配器经 `tool-adapter-profile` 绑定到本机工具服务（:8788），再加载进运行中的 Server。
- **输入**：DomainPack 文件 + 编译选项。**输出**：编译产物（Spec 指纹）。
- **涉及文件**：`hypha/implementation/activate.cjs`、`hypha/tool-adapter-profiles.yaml`（新增）、
  本机 `~/opt/hypha/configs/`（合并 adapter profile 后需重启 Server）。
- **与 Hypha 原语映射**：`loadDomainPackFile` / `compileDomainPackToHarnessedSystem` / `applyDomainAgentPatch`
  三个 `@hypha/domain` 函数**均为纯离线函数**（已对 `~/opt/hypha/node_modules/@hypha/domain/dist/index.js`
  源码核实）：只 `validate` + 产出 Spec 与 `processHash`，**不向任何运行中的 Server 注册/激活工具**。
  因此「把 10 工具激活进运行 Server」**无法靠这三个函数完成**，必须走 Server 的 tool-adapter-profile 加载机制（见 §4.6）。

### L3 客户端集成层（改 main.js 挂载）
- **职责**：在前端提供「意图入口」，把用户自然语言/结构化筛选发给 Agent，跑 FSM，回传契约后渲染。
- **输入**：用户意图（对话文本或筛选 chips）。**输出**：`output.food-recommendation` 渲染成列表/详情。
- **涉及文件**：`h5/src/main.js`（改：新增 `agent` 视图/意图栏）、`hypha/integration/agent-client.js`（新增，发请求+收契约）。
- **与 Hypha 原语映射**：发起 `task.food-discovery` → 驱动 `workflow.food-discovery` 的 FSM；
  各视图对应 FSM 状态（home→Intake/Discover，detail→Detail，account/wallet→Engage，Track 静默累加）。
- **交互入口方案**：在首页（Home）顶部加一个「意图栏」（输入框 + 快捷 chips：财大南湖周边/武汉全城/宵夜/必吃/签到），
  提交即进入 Agent 会话；其余 6 视图保持，Agent 结果以卡片流插入首页「为你发现」区。无 LLM 强制依赖——
  Intake 由 `skill.intent-parser` 把自然语言归一到结构化参数（可先用规则/轻量解析，对齐 DomainPack 入参）。

### L4 数据/红线层（贯穿全层）
- **职责**：保证推荐质量与合规。数据缺口对策 + 红线强制（policy.redlines-food 永远 deny 4 条 scope）。
- **输入**：源数据 + 运行期工具调用。**输出**：合规、可审计、无 PII 外泄的推荐与事件。
- **涉及文件**：`hypha/manyouwei-food-discovery.domain.yaml` §7 policies、`h5/src/core/analytics.js`（PII 剥离）、
  `h5/src/ui/dom.js`（`h()` 防 XSS）、`h5/src/core/auth.js`（脱敏）。
- **与 Hypha 原语映射**：`policy.redlines-food` 在编译期 + 运行期双重拒绝
  `data.export-pii / nav.fake-coords / coupon.forge / key.expose`；`eval.redline-check` 作为 process 评估。

---

## 3. 工具适配映射表（L1：10 个 ToolSpec → h5 真实实现）

> 适配层一律走纯函数，不引入 DOM。下列 `file:fn` 均为已在 h5 中落地、node 可 import 的实现。

| # | ToolSpec id | sideEffect | 现有 file:fn（真实实现） | 输入映射（ToolSpec.inputSchema → fn 参数） | 输出映射（fn 返回 → ToolSpec.outputSchema） |
|---|-------------|-----------|--------------------------|-------------------------------------------|--------------------------------------------|
| 1 | `discover.filter` | read | `core/query.js:filterMerchants` | `merchants`=全量;`zone`→zone;`categories`→categories;`mealTime`→mealTime;`maxPrice`→maxPrice;`keyword`→keyword | `{ merchants: 筛选后数组 }`（同 schema 字段，zone/category/rating… 原样保留） |
| 2 | `discover.rank` | read | `core/ranking.js:rankMustEat/rankValue/rankLateNight/rankNew` | `merchants`=筛选结果;`board`→选对应 rank 函数;`limit`→limit | `{ merchants: 榜单数组, board }`（对齐 output `ranked_by` 枚举） |
| 3 | `discover.detail` | read | `data/merchants.js` + `core/query.js:parsePrice/distKm/CAMPUS_COORDS` | `merchantId`→`merchants.find(id)` | `{ ...m, distanceKm, rating, reason, signatureDishes, address, lng, lat, has_coupon, coupon_summary }`（对齐 output.merchants 字段） |
| 4 | `discover.geo` | read | `core/query.js:distKm` + `CAMPUS_COORDS` | `merchants`;`fromZone`→取 `CAMPUS_COORDS[fromZone]` 作参考点 | `{ merchants: 附 distanceKm 后按距离排序 }`（distanceKm 写入每条） |
| 5 | `discover.navigate` | read | `ui/detail.js:buildAmapUrl`（**仅抽纯函数**，不引 DOM） | `lng,lat,name`→`buildAmapUrl({lng,lat,name})` | `{ url, name }`（公开 uri.amap.com，**无 Key**；缺坐标返回 null） |
| 6 | `user.favorite` | write | `core/auth.js:LocalAuthProvider.addFavorite/removeFavorite`（幂等） | `merchantId`;`action`→add/remove | `{ ok, favorited }`；scope `user.favorite`，绑定本人 userId |
| 7 | `reward.checkin` | write | `plays/checkin.js:checkinPlugin.participate` + `core/couponIssuer.js:issueCoupon` | `userId`→`activeUserId()` | `{ status:{streak,signedToday}, coupons:[...] }`；同日幂等（canParticipate 拦重） |
| 8 | `reward.view-wallet` | read | `core/store.js:getCoupons` | `userId` | `{ coupons: 本人券列表(已得/已核销/已过期) }`；仅本人 |
| 9 | `reward.claim` | write | `plays/claim.js:claimPlugin.participate` + `issueCoupon` | `userId`;`merchantId` | `{ ok, status:{claimed}, coupons:[...] }`；每商家每用户限 1 张（幂等） |
| 10 | `analytics.track` | read | `core/analytics.js:LocalAnalytics.track` | `event`;`payload` | `{ queued, sampled }`；**内部 sanitize 递归剥离 PII**（user_id/phone/… 不入库） |

**适配层统一返回形状**（对齐 freight 工具服务，便于 Hypha 适配器解析）：
`{ success: true, output: {...} }` 或 `{ success: false, error, hint }`。
工具服务 `httpServer.js` 把 10 个 adapter 挂到 `POST /tools/:id`，`:8788` 监听。

**`discover.geo` 距离口径说明**：仅用 `CAMPUS_COORDS`（财大南湖周边 114.370,30.480），
球面距离做「就近」排序，与 `query.js` 一致；导航用 `discover.navigate` 的公开 URI，二者都不伪造坐标（守 `nav.fake-coords` 红线）。

---

## 4. 运行时注册步骤（L2：本机 3000 可跑）

> ⚠️ **本节已按 `~/opt/hypha` 真实源码回修（首轮构建子代理核实）**。原 4.2/4.4/4.5 中的
> `POST /sessions/:id/commands/start-run` 内联激活、`PromptManager.registerAgentPrompt` 端点
> 均为子代理**推测**，与真实框架不符，已更正如下。

### 4.1 前置（本机已满足）
```bash
bash ~/opt/start-all.sh      # Docker MongoDB+Redis、Hypha Server(3000) 已 healthy
curl -fsS http://127.0.0.1:3000/api/v1/health   # 预期 healthy（或 404 于 /health，但 3000 在监听）
```
> 实测：`http://localhost:3000` 可达（GET `/health` 返回 404，说明 Server 在监听，仅该路由不存在）。

### 4.2 离线编译（`hypha/implementation/activate.cjs`，已跑通）
```js
// 运行：HYPHA_DOMAIN_PKG=/Users/onebilion/opt/hypha/node_modules/@hypha/domain/dist/index.js \
//        /Users/onebilion/.workbuddy/binaries/node/versions/22.22.2/bin/node activate.cjs
const { loadDomainPackFile, compileDomainPackToHarnessedSystem, applyDomainAgentPatch }
  = await import(process.env.HYPHA_DOMAIN_PKG);   // @hypha/domain 是 ESM，须动态 import（CJS 下不可用 require）

const domainPack = await loadDomainPackFile(YAML_PATH);   // 解析 yaml -> DomainPackSpec
const compiled = compileDomainPackToHarnessedSystem(domainPack, { agentRef: 'manyouwei-food-agent' });
console.log('processHash =', compiled.processHash);        // 确定性指纹（首轮实测 sha256:afbfbab2…）
const agent = applyDomainAgentPatch({ id:'manyouwei-food-agent', toolRefs:[], skillRefs:[], policyRefs:[] }, compiled.agentPatch);
// ↑ 三个函数均为【纯离线】编译/合并，只产出 Spec + processHash，不会向 3000 注册任何工具。
```
> 实测首轮 `processHash = sha256:afbfbab26f95d13fa354808258bde08662bbdfb8e00650280d14cdfbb57cbfb5`，
> 10 个 toolRefs 全部编译进 `harnessedSystem`，FSM 状态链完整。

### 4.3 工具适配器 Profile（`hypha/tool-adapter-profiles.yaml`，仿货代）
```yaml
# 合并进 ~/opt/hypha/configs/tools.yaml 的 profiles（kind: http 由 ToolManager.profileToolRegistry 加载）：
profiles:
  - { id: adapter.discover.filter,     kind: http, toolSpecRef: { id: discover.filter,     version: 0.1.0 }, endpoint: http://localhost:8788/tools/discover.filter,     requiredCapabilities: [execute, health] }
  - { id: adapter.discover.rank,       kind: http, toolSpecRef: { id: discover.rank,       version: 0.1.0 }, endpoint: http://localhost:8788/tools/discover.rank,       requiredCapabilities: [execute, health] }
  - { id: adapter.discover.detail,     kind: http, toolSpecRef: { id: discover.detail,     version: 0.1.0 }, endpoint: http://localhost:8788/tools/discover.detail,     requiredCapabilities: [execute, health] }
  - { id: adapter.discover.geo,        kind: http, toolSpecRef: { id: discover.geo,        version: 0.1.0 }, endpoint: http://localhost:8788/tools/discover.geo,        requiredCapabilities: [execute, health] }
  - { id: adapter.discover.navigate,   kind: http, toolSpecRef: { id: discover.navigate,   version: 0.1.0 }, endpoint: http://localhost:8788/tools/discover.navigate,   requiredCapabilities: [execute, health] }
  - { id: adapter.user.favorite,       kind: http, toolSpecRef: { id: user.favorite,       version: 0.1.0 }, endpoint: http://localhost:8788/tools/user.favorite,       requiredCapabilities: [execute, health] }
  - { id: adapter.reward.checkin,      kind: http, toolSpecRef: { id: reward.checkin,      version: 0.1.0 }, endpoint: http://localhost:8788/tools/reward.checkin,      requiredCapabilities: [execute, health] }
  - { id: adapter.reward.view-wallet,  kind: http, toolSpecRef: { id: reward.view-wallet,  version: 0.1.0 }, endpoint: http://localhost:8788/tools/reward.view-wallet,  requiredCapabilities: [execute, health] }
  - { id: adapter.reward.claim,        kind: http, toolSpecRef: { id: reward.claim,        version: 0.1.0 }, endpoint: http://localhost:8788/tools/reward.claim,        requiredCapabilities: [execute, health] }
  - { id: adapter.analytics.track,     kind: http, toolSpecRef: { id: analytics.track,     version: 0.1.0 }, endpoint: http://localhost:8788/tools/analytics.track,      requiredCapabilities: [execute, health] }
```
> 这是把本机 :8788 工具服务暴露给 Hypha Server 的**唯一真实路径**：须把该 profile 落到 Server 配置
> （`configs/tools.yaml` 的 `profiles` 或 `configs/tool-adapter-profiles`），并**重启 Server** 才会被
> `ToolManager.profileToolRegistry` 加载（见 `apps/server/src/core/tools/ToolManager.ts:591`）。

### 4.4 提示模板（4 个 `prompt.food.*`）
- 内容：把 DomainPack `allowedPromptRefs` 的 `prompt.food.intake/discover/detail/reward` 落成简短系统提示
  （意图归一化 / 发现编排 / 详情讲解 / 奖励引导），**不含密钥、不含 PII 占位**。
- 注册方式（**未核实**，原文档称 `PromptManager.registerAgentPrompt` / `POST /api/v1/runtime/agent-prompts`
  为推测，本章不做承诺）：需后续在真实 `runtime.routes.ts` 中确认是否存在该端点，或随 Server 启动从
  prompts 目录加载。本轮**不依赖 prompt** 即可验证工具层。

### 4.5 真实 `start-run` 端点（已核实，非激活工具用）
```bash
# 真实路由（apps/server/src/routes/runtime.routes.ts:87）：
POST /api/v1/sessions/:sessionId/commands/start-run
# - 需要 authMiddleware(true) + 请求头 Idempotency-Key
# - 请求体含 domainPack / react.messages / agentId / workflowRef
# - 返回 HTTP 202 Accepted（异步入队），【不同步返回 output】，须轮询 run 状态取结果
```
> ⚠️ **关键事实（已核实）**：即便把 domainPack 内联进 `start-run` 请求体，Server 的 `ToolManager`
> 也**不会**从内联 domainPack 注册其中的 10 个业务 toolSpec（`listTools` 仅来自 profileToolRegistry +
> 内置/config + MCP + fixture，见 `ToolManager.ts:587-619`）。同时 ReAct 执行需要可用 LLM 后端
> （`config.yaml`: `runtimeProvider: model-provider`、`local.enabled: false`），本机无本地推理、云 provider
> 无密钥即无推理。因此「内联 domainPack 跑一次拿到 output.food-recommendation」**在本机不可达**。

### 4.6 首轮结论：步骤 3 部分完成、步骤 4 BLOCKED
- **步骤 3（编译 + processHash）**：✅ 已跑通，`processHash` 已产出；但「激活进运行 Server」受限于
  §4.3 的 adapter-profile 需写入 `~/opt/hypha/configs` 并重启 Server（改动共享框架基础设施，**首轮子代理
  不擅自执行**，以免误改本机运行中的 Hypha Server）。
- **步骤 4（端到端 output.food-recommendation）**：⛔ **BLOCKED**，根因有两条且相互独立：
  1. 工具未注册：`ToolManager` 不从内联 domainPack 加载自定义 toolSpec，ReAct 循环调用不到我们的 10 工具；
  2. 无推理后端：ReAct 需 LLM，本机 `local.enabled=false`、云 `model-provider` 无可用密钥/端点。
- **解除阻塞所需（建议下一步，待用户确认后执行）**：
  1. 将 §4.3 的 `tool-adapter-profiles.yaml` 合并进 `~/opt/hypha/configs/tools.yaml`（或对应 profiles 目录），
     并重启 Hypha Server，使 10 工具经 `:8788` 被 Server 加载（先验证 `:8788` 10 个 endpoint 的 health 探测）；
  2. 提供可用 LLM 后端（配置 `HYPHA_INFERENCE_*` 指向可达的 model-provider，或开 `local.enabled=true` 起
     ollama/sglang 并 `autoStart=true`）；
  3. 之后再用 `start-run`（202 异步 + 轮询）跑 `food-discovery`，方可拿到 `output.food-recommendation`。
- 注：本机 `:8788` 端口当前被一个外部 `python3.11` 进程（PID 29368）占用，工具服务实测在 `:8799` 验证通过；
  正式接线前需释放/避开 `:8788`。

### 4.7 配置加载机制（2026-08-10 自动化轮次对真实源码核实，修正 PATH-A 预期）
- `apps/server/src/config/index.ts` 启动**只自动读** `configs/agents.yaml` / `configs/tools.yaml` /
  `configs/workflows` / `configs/memory-profiles.yaml`（均为 `z.string().default('./configs/...')`）；
  **不**自动扫描/加载 `configs/domain-packs/` 目录（`minimal.domain.yaml` 仅是参考 fixture）。
- DomainPack 的运行时入口是 `start-run` 请求体的 `domainPack` 字段（`runtime.routes.ts:62`
  `domainPack: z.unknown().optional()`；`ServerProductionSessionCommands.ts:301` 经
  `validateDomainPackSpec` 解码校验），而非配置文件自动加载。
- 工具解析走 `ToolManager.profileToolRegistry`（运行期注册表，**非** inline domainPack 的工具表）：
  即便 inline 传入含 `source:http`+`endpoint` 的 10 工具，ReAct 是否能直接调用它们，**需在 3000 上
  live 验证**（调用工具列举端点确认 10 工具入表）。该验证本身需 LLM 才能跑通 ReAct 端到端，故仍阻塞。
- **激活工具包**：`hypha/activation-kit/` 已生成「服务端就绪」版 DomainPack（10 工具全 `source:http`
  + `endpoint:127.0.0.1:8799/tools/<id>`，`processHash` 与本地一致 `sha256:afbfbab2…`），离线编译 +
  端点校验均通过；落地仅需「授权改配置/或 inline 接入」+「提供 LLM」两步，详见该目录 README。

---

## 5. 客户端集成方案（L3：改 main.js）

**原则**：不重写现有 6 视图，只新增「意图入口 + Agent 结果渲染」，通过 `agent-client.js` 与 3000 通信。

1. **入口**：在 `Home`（`h5/src/ui/home.js`）顶部加一个意图栏组件（纯 `h()` 构建，无 innerHTML）：
   - 文本输入框 + 快捷 chips（财大南湖周边 / 武汉全城 / 宵夜 / 必吃 / 签到得券）。
   - 提交 → 调 `agentClient.discover({ intent, zone, mealTime, ... })`。
2. **agent-client.js**（`hypha/integration/agent-client.js`）：
   - `discover(input)`：POST 到 3000 的 start-run 端点（内联 `domainPack` 或指向已激活 agentRef），
     轮询/流式取回 `output.food-recommendation`。
   - 把契约 `merchants[]` 映射回现有列表卡片（复用 `h5/src/ui/list.js` 的卡片渲染，h() 安全）。
3. **main.js 改造**：在 `render()` 里新增 `view === 'agent'` 分支（或在 Home 内嵌结果区）；
   FSM 状态与视图映射：
   - 意图栏提交 → `Intake`→`Discover`（推荐流插入首页「为你发现」）。
   - 点卡片 → `Detail`（复用 `MerchantDetail`）。
   - 详情页收藏/签到/领券 → `Engage`（复用 `auth`/`checkinPlugin`/`claimPlugin`，经 adapter 走 Agent 治理）。
   - 每次行为 → `Track`（`analytics.track`，静默剥离 PII）。
4. **无 LLM 也能跑**：`skill.intent-parser` 首轮可用规则/正则把「财大南湖周边 便宜 宵夜」归一到
   `{zone:财大南湖周边, maxPrice:?, mealTime:[夜宵]}`，对齐 `task.food-discovery.inputSchema`；
   后续再接轻量模型增强，不阻塞首轮落地。

---

### 5.5 本机运行时实现说明（已落地，2026-08-10）
- **Agent 大脑落在 L1 工具服务**：`hypha/implementation/src/{intent-parser,discovery-engine,orchestrator}.js`
  把 `workflow.food-discovery` 的 FSM（Intake→Discover→Completed）以**确定性**方式执行，`httpServer.js`
  暴露 `POST /run`（body 即 task.food-discovery 入参）→ 回传 `output.food-recommendation`。它复用真实 10 适配器，
  与「经 3000 跑 ReAct」共用同一 DomainPack 契约与适配器；区别仅在于此处用规则版 intent-parser + 确定性编排，
  **不依赖 LLM**（对齐 §8「不依赖任何云端/付费」）。
- **agent-client.js 双后端无缝切换**：默认 `local`（打 `:8799/run`）；待本机 Hypha Server(3000) 完成
  工具注册 + LLM 接入后，`setBackend('server')` 即可改走 3000 的 `start-run`（同一套契约，前端零改动）。
- **步骤 4（真·3000 ReAct）仍 BLOCKED**：根因同 §4.5/§4.6（ToolManager 不从内联 domainPack 注册工具 + 无 LLM 后端）。
  本地 `/run` 已交付「用户可体验闭环」这一里程碑，不阻塞步骤 7 落地。

## 6. 数据质量与红线（L4）

### 6.1 数据缺口对推荐质量的影响与对策
| 缺口 | 现状（来自 DomainPack 基线） | 对 Agent 的影响 | 对策（不改密钥/不伪造） |
|------|------------------------------|----------------|------------------------|
| 评分 `rating` 缺 | 必吃109/推荐85，共 590 → 缺约 **67%** | `discover.rank`(必吃/性价比榜) 大量店落空，`sort:rating` 退化为次级（人均） | rank 函数已有兜底（无评级不进必吃/性价比榜）；前端明示「已评级 X 家」；**不编造 rating** |
| 推荐语 `reason` 缺 | 约 **73%** 缺 | Detail 卡片「推荐理由」空白，体验差 | detail 缺 reason 时回退 `signatureDishes` 或「暂无探店点评」；**不生成伪造文案** |
| 券 `has_coupon` | **0%**（数据无券） | `reward.claim` 无券商户不展示领券按钮；`coupon_summary` 空 | 仅对有 `has_coupon` 商户启用领券；claim 仍走真实 `issueCoupon` 发**默认专属券**(amount=5)，不伪造满减档 |
| 坐标 `lng/lat` 缺 | 部分商户缺 | `discover.geo` 距离无法算、`discover.navigate` 降级 | geo 跳过缺坐标店并在 summary 标注「N 家缺坐标」；nav 缺坐标返回 null（按钮禁用），守 `nav.fake-coords` |

**总体对策**：Agent 输出契约 `summary` 必须带 `total_matched` 与降级说明；缺字段一律「显式缺省 + 不伪造」，由 `eval.output-contract` 校验契约完整性。

### 6.2 红线（由 `policy.redlines-food` 强制，编译期 + 运行期双重拒绝）
- `data.export-pii`：工具/适配器**不得**返回他人隐私；`analytics.track` 已递归剥离 PII 字段。
- `nav.fake-coords`：导航只用数据原始 GCJ-02 坐标 + 公开 URI，绝不改写坐标。
- `coupon.forge`：所有券经 `issueCoupon`（统一结构、真实 code），不发伪造/篡改券。
- `key.expose`：高德 Key / 微信 AppSecret / JWT 只在 env/后端代理，绝不下发前端、绝不在 adapter 明文。
- **渲染防 XSS**：所有 DOM 经 `h()`（无 innerHTML）；`agent-client` 渲染契约字段同样走 `h()`。
- **埋点不带 PII**：`analytics.track` 的 `sanitize()` 已剥离 `user_id/phone/name/token/...`，adapter 不改此逻辑。
- **不 git push / 不发布 / 不改密钥**：本设计全部本地验证；密钥由本机 `.env` 持有，文档不写明文。

---

## 7. 实施路线图（有序、可独立验证）

> 依赖顺序自上而下。★ 为首轮落点（最小可跑通闭环）。验证方式三选一：
> `node 测试`（L1 纯函数）、`curl 端到端`（L2/L3 对 3000）、`预览 200`（L3 前端）。

### 步骤 1 ★ 搭 L1 工具服务骨架（`hypha/implementation/`）
- 改：`hypha/implementation/src/tools/*.js` + `httpServer.js`（仿货代，:8788）。
- 完成条件：`node src/httpServer.js` 起；`curl localhost:8788/health` 返回 `{ok:true, tools:10}`；
  `curl -X POST localhost:8788/tools/discover.filter -d '{"merchants":[...]}'` 返回筛选结果。

### 步骤 2 ★ 写 10 个工具适配器（纯函数绑定）
- 改：`hypha/implementation/src/tools/{filter,rank,detail,geo,navigate,favorite,checkin,wallet,claim,track}.js`。
- 完成条件：`node` 单测覆盖 10 个 adapter：输入 ToolSpec.schema → 输出对齐 output 字段；
  `discover.navigate` 返回无 Key 的 `uri.amap.com` URL；`analytics.track` 入参含 `user_id` 时出参不含。

### 步骤 3 ★ L2 编译 + 内联激活（`activate.cjs`）
- 改：`hypha/implementation/activate.cjs` + `hypha/tool-adapter-profiles.yaml`。
- 完成条件（首轮实测）：运行后打印 `processHash`（sha256:afbfbab2…，确定性）；
  `activate.cjs` 实测可加载 yaml → 编译 → 10 toolRefs 进 harnessedSystem → Server(3000) 可达。
- ⚠️ 「激活进运行 Server」**未自动执行**（需改 `~/opt/hypha/configs` + 重启 Server，属共享基础设施改动，
  首轮子代理不擅自进行）。见 §4.6。

### 步骤 4 ★ 端到端跑通一次 food-discovery（Discover 状态）
- 改：无（用 curl 验证）。
- 完成条件（首轮：**BLOCKED**）：内联 `domainPack` 的 `start-run` 无法让 Server 注册并执行 10 工具
  （ToolManager 不从内联 domainPack 加载 toolSpec），且 ReAct 需可用 LLM（本机无）。详见 §4.5/§4.6。
  解除阻塞后，`curl POST /sessions/:sid/commands/start-run` 带 `react.messages=[{role:user,content:"财大南湖周边附近便宜的宵夜"}]`，
  轮询 run 回包含 `output.food-recommendation.merchants[]` 且 `summary.total_matched>0`、`ranked_by` 合法。

### 步骤 5 注册 4 个 `prompt.food.*` 模板 ✅（本机本地交付已完成）
- 改：`hypha/implementation/prompts/{intake,discover,detail,reward}.md`（4 模板，本地事实来源）
  + `hypha/implementation/src/{prompts,provenance}.js`（loadPrompts + buildGuidance + 溯源常量）
  + `orchestrator.js` 注入 `summary.guidance` / `summary.provenance`；前端 `home.js` 渲染导览+溯源徽标。
- 完成条件（已达成）：4 模板齐全且无密钥/PII；`/run` 产出 `guidance`（品牌化一句话导览）
  + `provenance`（driver=hypha-fsm / processHash / fsm 路径 / prompts[4] / deterministic）；前端可见「Agent 驱动·可回放审计」。
- 注：Server 侧 `~/opt/hypha/apps/server/src/prompts` 注册随 **步骤 9（PATH-A 固化）** 一并完成
  （需改共享设施 + 重启 Server，待用户授权）；本地确定性路径已无需 Server 即完整消费这 4 个模板。

### 步骤 6 Detail / Engage 状态打通（收藏/签到/领券经 Agent 治理）
- 改：`agent-client.js` 暴露 `favorite/checkin/claim/viewWallet` 调用；适配器已就绪（步骤 2）。
- 完成条件：curl 调 `user.favorite`(add)→`reward.checkin`→`reward.claim`→`reward.view-wallet`，
  分别返回预期；同日重复 checkin 被幂等拦截；`policy.user-data-write` 仅放行本人 scope。

### 步骤 7 L3 客户端集成（意图栏 + 渲染）
- 改：`h5/src/main.js`（加 agent 视图/入口）、`h5/src/ui/home.js`（意图栏）、`hypha/integration/agent-client.js`。
- 完成条件：本地预览首页出现意图栏；输入「财大南湖周边 宵夜」→ 发起请求 → 首页「为你发现」渲染契约卡片（h() 安全）；
  预览首页 HTTP 200、无 console 报错、无 XSS（字段均经 h()）。

### 步骤 8 红线回归 + Track 状态 + 数据缺口标注
- 改：无核心代码（核对 + 少量 summary 文案）。
- 完成条件：用 `eval.redline-check` 跑 4 条红线 scope 均被 deny；`analytics.track` 抽样事件无 PII；
  推荐 `summary` 含 `total_matched` 与「N 家缺坐标/缺评级」降级说明；`processHash` 与前序一致（可回放）。

### 步骤 9（可选）PATH-A 配置驱动固化
- 改：把 domainPack 落到 `~/opt/hypha/configs/domain-packs/`，合并 `tool-adapter-profiles` 进 `configs/tools.yaml`，重启 `npm run dev`。
- 完成条件：重启后 3000 自动加载 agent，步骤 4 的 curl 不再需要内联 `domainPack`（用 `agentRef` 即可）。

### 步骤 10（可选）意图解析增强
- 改：`skill.intent-parser` 接轻量模型/规则增强自然语言→结构化参数。
- 完成条件：复杂意图（「带朋友吃湖北菜，人均不过百」）正确归一为 `{category:湖北菜, maxPrice:100}`，FSM 走通。

---

## 8. 首轮落点小结
首轮（步骤 1–4）即形成**最小可跑通闭环**：本机工具服务(:8788) + 编译激活进 3000 + 一次
food-discovery 端到端返回推荐契约。不依赖任何云端/付费，密钥零改动，红线由 `policy.redlines-food` 守门。
后续步骤 5–8 补齐 prompt、写入类状态、前端入口与回归；步骤 9–10 为固化与增强（可选）。
