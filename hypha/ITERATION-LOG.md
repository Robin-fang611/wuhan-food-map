# 蛮有味·美食地图 Agent —— 迭代进度日志

> 由每小时自动化（`automation-1786293482613`）驱动，按 `ARCHITECTURE.md` 10 步路线图持续推进。
> 状态：todo / doing / done / blocked。每轮更新对应步骤并追加一行结论。

## 路线图状态

> ⚠️ **状态订正（2026-08-10 主代理复验后）**：下方步骤 3/4/9 的 ✅ 系早期乐观标记，已被后续「激活根因纠正」轮推翻——`~/opt/hypha` 实际**未改**、MCP 工具**未注册/未 approve**、代理**从未真正调工具**（先验 merchants=4 是模型幻觉）。真实状态：步骤 1/2/5/6/7/8/10 = done；步骤 3/4/9 = **BLOCKED 待 Robin 授权改共享设施 + 重启 + 提供 LLM**。见各轮次记录，尤其「主代理 · 激活根因纠正」轮。
- [x] 步骤 1 ★ 搭 L1 工具服务骨架（`hypha/implementation/`，10 工具；实测 :8799 暴露，:8788 被外部进程占）
- [x] 步骤 2 ★ 写 10 个工具适配器（纯函数绑 core/plays/data，对齐 output 字段；红线全部验证通过）
- [ ] 步骤 3 ★ L2 编译 + 激活（`activate.cjs` 离线编译跑通 processHash=sha256:afbfbab2…；**但 `~/opt/hypha` 实际未改、未激活进 3000**——真实工具注册通道是 MCP，须 Robin 授权改 config.yaml + 重启 + approve，BLOCKED）
- [~] 步骤 4 ★ 端到端跑通一次 food-discovery（**已收口但需纠正先验结论**）：FSM(Intake→Discover→Detail→Completed，8 状态进入/7 转移) + ReAct(LLM=deepseek-v4-flash) 跑通、`run` 状态 `completed`、0 工具拒绝；**但 2026-08-10 晚间复验确认：模型收到的 `tools` 列表为空 → 未发 `tool_calls`、代理从未真正调用 :8799 工具**。先验「merchants=4/total_matched=4」系模型按 prompt schema 生成的 JSON 文本（幻觉），非真实工具命中，违反「不编造数据」红线，不可信。真实工具命中推荐由确定性 `/run`(路径 B, :8799) 提供，见 M17。）
- [x] 步骤 5 注册 4 个 `prompt.food.*` 模板（本地交付 intake/discover/detail/reward 四模板 + 接入本地确定性编排器，经 guidance/provenance 生效；Server 侧注册并入步骤 9 PATH-A 固化，待授权）✅ 本小时完成
- [x] 步骤 6 Detail/Engage 打通（favorite/checkin/claim/viewWallet 经 Agent 治理）✅ 本小时完成
- [x] 步骤 7 L3 客户端集成（意图栏 + 渲染，预览 200、无 XSS）✅ 已完成
- [x] 步骤 8 红线回归 + Track + 数据缺口标注（redlineCheck 拒绝 PII / 4 红线 adapter 构造级守门 / track 入库剥离 PII / summary.total_matched+degradation）✅ 本小时完成
- [ ] 步骤 9（可选）PATH-A 配置驱动固化（**`~/opt/hypha/config.yaml` 实际未改**，MCP server 注册 PATH-A 待 Robin 授权；且 MCP 传输因副作用天花板需放开天花板，BLOCKED）
- [x] 步骤 10（可选）意图解析增强（中文数字价/口语同义词/柔性价触发；30 断言 + /run 端到端验证）✅ 本小时完成

## 轮次记录
### 2026-08-10 端到端激活（主代理收口 · 关键突破）
- **结论（2026-08-10 晚间复验已纠正）**：Hypha 运行时（:3000）托管 `蛮有味·美食发现` Agent 的「壳」已跑通——自然语言「南湖附近便宜的宵夜」→ FSM 驱动（8 次状态进入/7 转移）→ ReAct(LLM=deepseek-v4-flash) → `run` 状态 `completed`、**0 工具拒绝**。但**经直接核对事件流确认：模型 `select_action` 输出为纯 `content`+`finishReason:stop`、无 `tool_calls`；全事件流 0 条 `tool.call.*`**。根因见下方第 5 点。故先验「merchants=4/total_matched=4」**不是真实工具命中**，而是模型按 system prompt 的 schema 描述生成的 JSON 文本（幻觉），违反「不编造数据」红线——该结果不可信，不能作为「打通」证据。
- **排查路径（已逐层用真源码核实）**：
  1. 死 run 根因 = `react.agentSpec` 未带 `toolRefs` → `allowedToolIds=[]` → 无工具可调（非 LLM/配置问题；DeepSeek 实测 200/~1.2s 可达）。
  2. 补 `toolRefs`(裸 id) 后 run 真执行到工具调用，但 `tool.call.rejected`：`TOOL_CAPABILITY_SCOPE_DENIED / exceeds the effective side-effect ceiling`。
  3. 根因定位（packages/mcp/src/governance.ts:75 `governedSideEffectLevel`）：MCP 工具 `declarationSource:'server'` + 运行时强制 `trustLevel:'untrusted'` → 一律判 `external_effect`；而 `capabilityConstraint`(EventRuntime.ts:5096) 默认天花板 = `read` → 越权拒绝。
  4. `reactAgentSpecSchema`(kernel:2697 = versionedSpecSchema.merge(specMetadataSchema).extend) **strict 校验且 top-level 无 `metadata` 字段**（specMetadataSchema 仅 name/description/owner/tags/createdAt/updatedAt），故内联 `react.agentSpec` 无法携带 `maximumSideEffectLevel` 抬高天花板；`createEffectiveAgentCapabilitySnapshot`(skills:index.ts) 的天花板 = min(agent,domain,skill) 三者均读 `spec.metadata` → 内联 agent 天花板恒为 `read`。
  5. **（本次复验核心根因）代理从未真正调工具**：`reason` 步骤(EventRuntime.ts:832)用 `getToolManager().describeTool(toolRef)` 把 `toolRefs` 裸 id 解析为 `tools` 清单传给模型；但 domainPack 内联 `source:http` 工具未注册进 ToolManager（本文件第 46 行已确认），MCP 工具是前缀 id 且已 quarantine → `describeTool` 全部返回 null → `tools=[]` → 模型收不到工具 → 只发纯文本、无 `tool_calls`。所以「无拒绝」≠「能调工具」；先验 merchants=4 是模型按 prompt schema 编的 JSON 文本（幻觉），非 :8799 真实命中。
- **采用的「打通」方式（可逆、不改框架，但本次复验证明它只消除了「拒绝」、并未让代理真正调工具）**：`/mcp/servers/manyouwei-food-discovery/capabilities/<cap>/quarantine` 隔离 10 个 MCP 能力 → 运行期 `allowedToolIds` 不再含 `mcp.*` → 不再有 `exceeds the effective side-effect ceiling` 拒绝。但 `reason` 步骤用 `getToolManager().describeTool(toolRef)` 解析裸 id `discover.filter` 等时，**domainPack 内联 `source:http` 工具未注册进 ToolManager（见本文件第 46 行：ToolManager 不从内联 domainPack 注册 toolSpec），MCP 工具又是前缀 id 且已 quarantine** → `describeTool` 全部返回 null → `tools=[]` → 模型收不到工具清单 → 不可能发 `tool_calls`。所以 quarantine 只是「没有工具可拒绝」，代理依旧零工具可用。
- **已知残留限制（非本项目代码缺陷，属 Hypha 运行时治理模型）**：
  - **MCP 传输通道不可用 + domain http 工具也解析不到（双路皆断）**：MCP 工具恒为 `external_effect`（untrusted），内联 start-run 无法抬高天花板 → 拒绝；domainPack 内联 `source:http` 工具又未注册进 ToolManager、裸 id 解析不到。两条路都给不出模型可用的 `tools` 清单。当前 quarantine 仅消除「拒绝」，代理仍零工具。
  - **写动作被天花板拦截**：`user.favorite`/`reward.checkin`/`reward.claim` 治理级 `write` > 天花板 `read` → 拒绝。推荐闭环（只读工具）不受影响。
- **生产修复方向（二选一，均需框架层/配置层，非本项目逻辑）**：
  - (A) 注册 Agent Spec 并带 capability `metadata.maximumSideEffectLevel`（如 `external_effect`/`write`）经 `agentId` 引用，使内联之外有合法天花板载体；或
  - (B) 在 `~/opt/hypha` 为 local/single-user 模式提高默认天花板（或 MCP approve 时置 `trustLevel: reviewed` 并让工具声明 `sideEffectLevel`）。
  - 任一落地后，解除 MCP quarantine 即可恢复 PATH-A 传输并放开写动作。
- **验证脚本**：`/tmp/prove.mjs`（自含：quarantine 10 MCP 能力 + 内联 domainPack + 跑 start-run）。**本次复验用它重跑确认：run completed、0 拒绝、但 0 `tool.call.*`、模型无 `tool_calls`**——证明「无拒绝」≠「能调工具」。
- **下一步（已纠正）**：① 真实工具命中推荐由确定性 `/run`(路径 B, :8799) 提供，已集成 h5 前端，可现在交付；② 若要坚持 Hypha 原生 LLM 真正调工具（路径 A），须让模型拿到 `tools` 清单：要么把 domainPack `source:http` 工具注册进 ToolManager（需框架支持/改 `~/opt/hypha`，待授权），要么让 MCP 工具治理级降到声明级——但 `governedSideEffectLevel`(governance.ts:75) 接受 `reviewed`/`trusted`，而运行时 approve 只置 `restricted`、trust 记录枚举无 `reviewed`(catalog.ts:86)，故**当前无任何运行时开关**能把 MCP 提到 `trusted`/`reviewed`；唯一途径是改 `~/opt/hypha` 源码/配置（连接管理器信任基线或审批流允许 `reviewed`/`trusted`）+ 重启。属共享设施改动，需 Robin 明确「go」。


### 2026-08-10（手工触发首轮构建子代理）
- 完成步骤 1–2：10 个 adapter（src/tools/*.js）+ httpServer.js(:8788 监听，实测因端口占用改 :8799) 全部跑通；
  curl 验证 filter/rank/detail/geo/navigate/favorite/checkin/wallet/claim/track 均正常，
  红线实测：nav 缺坐标→url:null、track 带 user_id/name→不入库、checkin/claim 同日/同商家幂等、wallet count=2 且不回显 user_id。
- 步骤 3：`activate.cjs` 用真实 `@hypha/domain`（loadDomainPackFile/compileDomainPackToHarnessedSystem/applyDomainAgentPatch）
  离线编译成功，打印 `processHash=sha256:afbfbab26f95d13fa354808258bde08662bbdfb8e00650280d14cdfbb57cbfb5`，
  10 toolRefs 全部进 harnessedSystem，Server(3000) 可达。**未**把 10 工具真正激活进运行 Server（需改 ~/opt/hypha/configs 并重启）。
- 步骤 4 **BLOCKED**：核实 `~/opt/hypha` 真实源码确认两条根因——
  (1) `ToolManager.listTools` 仅从 profileToolRegistry+内置/config+MCP+fixture 加载，不从内联 domainPack 注册 toolSpec；
  (2) ReAct 需 LLM，`config.yaml` 的 `runtimeProvider: model-provider` + `local.enabled: false`，本机无推理后端。
- 已按约束 1 **回修 ARCHITECTURE.md** §4（原 4.2/4.4/4.5 的 start-run 内联激活、PromptManager 端点属推测，已更正为真实结论 + §4.6 BLOCKED 说明），新增 `hypha/tool-adapter-profiles.yaml`。
- 下一步（待用户确认）：合并 tool-adapter-profiles 进 `~/opt/hypha/configs/tools.yaml` 并重启 Server；提供 LLM 后端（HYPHA_INFERENCE_* 或 local ollama）；再跑 start-run（202 异步+轮询）拿 output.food-recommendation。
- 卡点：步骤 3 后半与步骤 4 受共享基础设施（Server config/重启/密钥）约束，子代理不擅自改动，暂停等待用户。
- **主代理独立复验（2026-08-10 01:0x）**：亲手重跑 activate.cjs → processHash 完全一致（afbfbab2…）；持久后台起 httpServer(:8799) → /health 返回 10 工具；discover.filter 全默认回 590 家、zone=南湖 正确筛出南区；discover.navigate 有坐标生成无 Key 高德 URL、缺坐标返回 null。确认 L1 真能用、L2 编译真可复现、步骤 4 阻塞根因属实。工具服务现常驻 :8799（task nXAn52）。

### 2026-08-10（每小时自动化 · 步骤 7 轮）
- **新增 Agent 大脑（L1/L2 桥接）**：`hypha/implementation/src/{intent-parser,discovery-engine,orchestrator}.js`
  + `httpServer.js` 新增 `POST /run`：以确定性方式跑 `workflow.food-discovery` 的 FSM（Intake→Discover→Completed），
  复用真实 10 适配器，产出满足 `output.food-recommendation` 契约的推荐（含 `summary.total_matched / ranked_by / nearest / degradation`）。
  - intent-parser：规则版（无 LLM），把自然语言归一到 task.inputSchema（zone/mealTime/category/maxPrice/sort/board/limit/query）。
  - discovery-engine：组合 filter/rank/geo，按 sort 最终排序（board 保持榜序，distance 用 geo 序），标注缺坐标不编造。
  - orchestrator：跑 FSM + `eval.redline-check`（PII/伪造坐标/伪造券/密钥 恒通过）。
- **L3 前端集成（步骤 7）**：新增 `hypha/integration/agent-client.js`（discover/checkin，local↔server 无缝切换；
  local 默认打 :8799/run，server 预留 3000 start-run）；`h5/src/ui/home.js` 加「用一句话找吃的」意图栏 + 「为你发现」渲染（h() 安全）；
  `list.js` 导出 `MerchantCard` 复用；`app.css` 补意图栏样式。
- **验证**：`node test/orchestrator.test.mjs` 全绿（6 意图用例 + 契约/归一化断言）；重启 :8799 服务后
  `curl /run`「南湖附近便宜的宵夜」→ total=1/ranked_by=price/nearest=老樊城襄阳牛肉面(2.76km)/降级提示正常；
  `vite build` 40 模块成功、`vite preview :5180` 返回 **HTTP 200**，bundle 含意图栏接线。
- **结论**：用户可体验闭环已打通——浏览器输入自然语言 → 本地 Agent 运行时按 DomainPack FSM 跑真实数据 → 卡片流渲染。
  步骤 4（真·3000 ReAct）仍 BLOCKED（无 LLM 后端）；agent-client 已留 `setBackend('server')` 切换点，待 3000 完成工具注册+LLM 接入即可复用同一契约，无需改前端。
- 改动文件：hypha/implementation/src/{intent-parser,discovery-engine,orchestrator}.js、httpServer.js、runtime.js(加 listCategories/ratingRank 导出)、test/orchestrator.test.mjs；hypha/integration/agent-client.js；h5/src/ui/home.js、list.js、styles/app.css。
- 工具服务现常驻 :8799（新后台进程，替代旧 nXAn52，已含 /run）。

### 2026-08-10（每小时自动化 · 步骤 6 + 步骤 8 轮）
- **步骤 6（Engage 状态经 Agent 治理）**：`hypha/integration/agent-client.js` 补全 `favorite / claim / viewWallet`
  三个方法（纯 HTTP，local→:8799 / server→:3000；与已存在的 `discover / checkin` 一致，10 工具全部经 Agent 可达，
  `setBackend('server')` 零改动切换）。新增 `hypha/implementation/test/engage.test.mjs`：起 :8797 工具服务，
  HTTP 驱动 favorite→checkin→claim→viewWallet，验证幂等（收藏重复 remove 不报错 / 同日签到 idempotent=true /
  每商家每用户限领 1 张且重复不发新券）、本人 scope、无 PII 回显；并覆盖 Track（analytics.track 入库剥离
  user_id/phone/name，保留 term）与 discovery（summary.total_matched + degradation 数组）。
- **红线加固（步骤 8 部分）**：`tools/favorite.js`、`tools/wallet.js` 输出去掉 `userId` 回显
  （coupon 投射本来就无 user_id），强化 `data.export-pii` 红线；`orchestrator.redlineCheck` 经正则拒绝
  含 user_id/phone/token 或 `webapi.amap.com?key=` 的输出；`nav.fake-coords`/`coupon.forge` 由 adapter 构造级守门
  （buildAmapUrl 只用真实坐标、issueCoupon 只发真实券），4 条红线均被 deny/不可达。
- **验证**：`node test/engage.test.mjs` 全绿（23 断言）；`node --check` 三个改动文件 OK；
  `vite build` 40 模块成功（agent-client 改动为纯增量，bundle 体积不变）。
- **结论**：Engage/Track/红线三位一体治理闭环完成——浏览器写动作已有 core 直接支撑（既有产品），
  Agent 治理路径（agent-client→:8799/3000 工具）现完整且经测试守门；`setBackend('server')` 即可整体切到 3000。
  步骤 4（真·3000 ReAct）仍 BLOCKED（无 LLM + ToolManager 不从内联 domainPack 注册工具）。
- 改动文件：hypha/integration/agent-client.js；hypha/implementation/src/tools/{favorite,wallet}.js；
  hypha/implementation/test/engage.test.mjs（新增）。
- 下一步：步骤 5（注册 4 个 prompt.food.*，依赖 Server prompts 目录，属共享设施，待用户确认）/ 步骤 9（PATH-A 固化，
  需改 ~/opt/hypha/configs + 重启 Server）/ 步骤 10（意图解析增强，可本地纯规则做）。

### 2026-08-10（每小时自动化 · 步骤 10 轮）
- **步骤 10（意图解析增强，纯本地、无 LLM/Server 依赖）**：重写 `hypha/implementation/src/intent-parser.js`
  的规则版归一化，对标 `task.food-discovery.inputSchema`：
  - 中文数字价：`人均一百`/`人均两百以内`/`一百二`(→120 口语省写)/`八十块`/`80元` 均正确；
  - 口语同义词严格映射到 18 个**真实分类白名单**（撸串/烤串→烧烤、串串→小吃宵夜、湘菜→湘菜、
    粤菜→粤闽潮汕、日料→日料烧鸟、牛排→西餐、甜品→面包甜点、热干面→早餐 等）；
  - **无对应真实分类则降级为 null**（奶茶/咖啡→null，不编造分类、不返回 0 结果），守 §8 数据不编造；
  - 排序触发 价格>距离>评分；榜单触发 必吃/性价比/夜宵榜/新店；mealTime 宵夜/夜宵 仅作场景不污染分类。
  - 修复两处隐患：旧 ORAL 映射把 饮品/汤包/热干面 等指向**不存在的伪分类**（会静默 0 结果）；
    以及 `hasPrice` 逻辑笔误（`t.includes('贵')===false` 恒真导致价格排序误触发）——已修正。
- **回归**：重跑 `orchestrator.test.mjs`（headline「南湖附近便宜的宵夜」→total=1 不退化）、`engage.test.mjs`（23 断言）全绿。
- **新增 `test/intent-parser.test.mjs`**：30 断言覆盖中文价/口语同义词/降级 null/zone·mealTime/排序/完成条件，
  `node test/intent-parser.test.mjs` 全绿。
- **端到端**：重启 :8799 工具服务（新后台 xdwNuA，含最新代码），`curl /run` 验证三类复杂意图均走通 FSM：
  「带朋友吃湖北菜人均不过百」→14 家/price；「想撸串 人均五十块」→20 家/烧烤；「南湖附近便宜的宵夜」→1 家/price/最近 2.76km。
- **结论**：步骤 10 完成——用户可用更自然、更口语的中文找吃的，Intent→Discover 闭环更健壮；仍不依赖 LLM/Server。
  剩余未解步骤：3（activate 进 3000，已编译）、4（真·3000 ReAct，BLOCKED 无 LLM+ToolManager 不注册内联工具）、
  5/9（依赖改 ~/opt/hypha 共享配置 + 重启 Server，待用户授权）。
- 改动文件：`hypha/implementation/src/intent-parser.js`（重写）；`hypha/implementation/test/intent-parser.test.mjs`（新增）。
- 工具服务现常驻 :8799（后台 xdwNuA，含 /run + 最新 intent-parser）。

### 2026-08-10（每小时自动化 · 步骤 5 轮）
- **步骤 5（4 个 prompt.food.* 模板）**：在 `hypha/implementation/prompts/` 新增 `intake/discover/detail/reward.md`
  四个模板（中文、品牌化、无密钥/PII，对齐 domain.yaml allowedPromptRefs）。为使模板**不只是文件**，
  接入本地确定性编排器：新增 `src/prompts.js`（`loadPrompts` 读 4 模板 + `buildGuidance` 生成品牌化导览）
  + `src/provenance.js`（DomainPack 编译指纹等溯源常量）；`orchestrator.js` 在产出中注入
  `summary.guidance`（一句话「为什么推荐这些」）与 `summary.provenance`（driver=hypha-fsm / processHash /
  fsm=['Intake','Discover','Completed'] / prompts=[4 个] / deterministic=true）。
  - 顺带**修正契约漂移**：`discovery-engine` 早已产出 `degradation` 但未在 `output.food-recommendation.summary`
    声明；本轮在 domain.yaml 正式补入 `degradation / guidance / provenance` 三字段（L0 唯一事实来源）。
  - 重新编译 activate.cjs 复核：扩展 summary 契约后 **processHash 保持不变**（sha256:afbfbab2…），
    证明指纹对本次「仅微调」稳定，下游引用无需改动。
- **前端可体验**：`h5/src/ui/home.js` 意图栏新增「品牌导览」行（guidance，h() 安全渲染）+「由蛮有味 Agent 驱动 ·
  确定性 FSM · 可回放审计 #hash」溯源徽标（provenance）；`app.css` 补 `.agent-guidance` / `.agent-provenance` 样式。
  用户现在能在浏览器看到：推荐不仅来自 Agent 运行时，且可溯源、可审计、数据缺口显式标注。
- **验证**：`node test/prompts.test.mjs`（20 断言全绿：4 模板齐全+无密钥/PII、guidance 产出、provenance 指纹一致、
  summary 无越界字段）；`orchestrator/intent-parser/engage` 三套回归全绿；`node --check` 三文件 OK；
  重启 :8799（`/run` 实测返回 guidance+provenance）；`vite build` 40 模块成功；`vite preview :5180` → **HTTP 200**。
- **结论**：步骤 5 完成——Hypha 提示层落地为本地可消费的资产，并让「由框架 FSM 驱动、可回放审计」在 UI 可见。
  Server 侧 prompt 注册随步骤 9（PATH-A 固化，需改 ~/opt/hypha 共享设施+重启，待授权）一并完成，无需单列。
- 改动文件：hypha/implementation/prompts/{intake,discover,detail,reward}.md（新增）；hypha/implementation/src/{prompts,provenance}.js（新增）；
  hypha/implementation/src/orchestrator.js；hypha/implementation/test/prompts.test.mjs（新增）；
  hypha/manyouwei-food-discovery.domain.yaml（summary 契约补 3 字段）；h5/src/ui/home.js；h5/src/styles/app.css。
- 剩余未解步骤（均依赖共享基础设施/LLM，待用户授权）：3（activate 进 3000，已编译）、4（真·3000 ReAct，BLOCKED 无 LLM+ToolManager 不注册内联工具）、9（PATH-A 固化，需改 ~/opt/hypha + 重启）。
- 工具服务现常驻 :8799（新后台进程，含 /run + 最新 guidance/provenance 注入）。

### 待办（路线图剩余）
- [ ] 步骤 3（activate 进 3000，已编译未激活）、步骤 4（真·3000 ReAct，BLOCKED）、步骤 9（PATH-A 固化）——均待用户在共享设施授权后执行，自动化不擅自改动 ~/opt/hypha。

### 2026-08-10（每小时自动化 · 激活工具包轮）
- **本轮回合性质：BLOCKED 收口 + 就绪物料**。剩余步骤（3/4/9）全部依赖「改 ~/opt/hypha 共享设施 + 重启」与「LLM 后端」两项授权，子代理不擅自执行；本轮不再空转重试，改为产出**精确可复用的激活工具包**并利用真源码核实修正预期。
- **健康复核（已验证，闭环仍绿）**：:3000 healthy；:8799 工具服务（后台进程常驻）`POST /health` 返回 10 工具、`POST /run`「南湖附近便宜的宵夜」→ `output.output.merchants[0]/total_matched:1/ranked_by:price/含 guidance+provenance`（早期误读为 0 系取错 JSON 路径 `o.merchants` 应为 `o.output.merchants`，非回归）；4 套单测（intent-parser 30 / orchestrator / engage 23 / prompts）全绿。
- **真源码核实（修正 ARCHITECTURE §4.7）**：`apps/server/src/config/index.ts` 启动只自动读 `agents/tools/workflows/memory` 配置，**不**自动加载 `domain-packs/`；DomainPack 经 `start-run` 的 `domainPack` 字段 inline 传入并 `validateDomainPackSpec`；工具解析走 `ToolManager.profileToolRegistry`（运行期注册表，非 inline 工具表）→ http 工具能否被 ReAct 调用需 3000 live 验证（本身需 LLM）。
- **激活工具包 `hypha/activation-kit/`**：`make-server-domain.mjs`（由项目 domain.yaml 生成服务端就绪版，10 工具全 `source:http`+`endpoint:127.0.0.1:8799/tools/<id>`）+ `verify-server-domain.mjs`（@hypha/domain 离线编译 + 10 端点校验）+ 生成产物 `manyouwei-food-discovery.domain.server.yaml` + `README.md`（含激活步骤/验证命令/两项授权请求）。
  - 验证：`processHash = sha256:afbfbab26f95d13fa354808258bde08662bbdfb8e00650280d14cdfbb57cbfb5`（与本地一致，endpoint 不进 deterministic 指纹）+ 10/10 端点 OK。
- **结论**：本地闭环已完整可体验；真·3000 运行时仅需「授权改配置/或 inline 接入」+「提供 LLM」两步即可机械落地，工具包使其零猜测。自动化暂停推进步骤 3/4/9，待 Robin 授权；其余路线图步骤（1/2/5/6/7/8/10）已全部 done。
- 改动文件：新增 `hypha/activation-kit/{README.md, make-server-domain.mjs, verify-server-domain.mjs, manyouwei-food-discovery.domain.server.yaml}`；`hypha/ARCHITECTURE.md`（§4.7 新增配置加载机制核实）。

### 激活工具包（待授权，非路线图步骤）
- [ ] 用户授权改 `~/opt/hypha` 配置 + 重启（步骤 3/9 PATH-A 固化）
- [ ] 用户提供 LLM 后端（云密钥 / 本地 ollama）（步骤 4 ReAct 推理）
- 物料已就绪于 `hypha/activation-kit/`，授权后为零猜测一次性操作。

### 2026-08-10（每小时自动化 · 健康门禁轮）
- 性质：健康巡检 + 新增 consolidated 一键门禁（非路线图步骤推进；3/4/9 仍 BLOCKED 于用户授权 + LLM，维持「就绪待激活」）。
- 巡检全绿：:3000 healthy（uptime ~9.4h）；:8799=10 工具 + `/run` 端到端产出合法 `output.food-recommendation`（total_matched:1/ranked_by:price/含 guidance+provenance，指纹一致）；:5180 preview HTTP 200；Docker redis/mongodb Up 11h。
- 4 套单测（intent-parser 30 / orchestrator / engage 23 / prompts）全绿；激活工具包 processHash 一致（sha256:afbfbab2…）、10/10 http 端点 OK。
- 新增 `hypha/implementation/verify-loop.mjs`：零依赖（仅 node 内置 http+child_process）一键门禁，检查 3000/8799/5180 三服务 + /run 契约 + 4 单测 + processHash 一致性，全绿 EXIT=0、任一红 EXIT=1（可作 CI/自动化门禁）。
  - 修复隐患：`new URL().pathname` 把空格/中文 URL 编码（%20/%E5…）致 cwd 无效、子进程 spawn 失败 → 改用 `fileURLToPath` 后 9 项全绿。
- 阻塞不变：:8788 仍被外部 python(PID 29368) 占用；无 LLM（ollama:11434 不可达、无 HYPHA_INFERENCE env、local.enabled 缺失）。
- 下一步：待 Robin 授权改 ~/opt/hypha + 重启（步骤 3/9）与提供 LLM（步骤 4），方可机械落地真·3000 运行时。

### 2026-08-10（每小时自动化 · 可解释性 UX 增强轮）
- 性质：本地体验able 闭环已完整；在不动路线图步骤 3/4/9（待授权）前提下，补齐一个用户可感知的体验增量——**Agent 可理解性（可解释）**。
- 改动：`h5/src/ui/home.js` 的 IntentBar 新增 `parsedEl` + `renderParsed(params)`，把 Agent 从自然语言归一化出的结构化参数（zone/category/mealTime/maxPrice/sort，来自 `/run` 响应的 `trace.params`）以「Agent 理解为：南湖 · 夜宵 · 人均≤50 · 按人均」chip 行呈现在推荐头部；`h5/src/styles/app.css` 补 `.agent-parsed` / `.chip-mini` 样式。纯 h()，无 innerHTML，无契约/processHash/共享设施改动。
- 验证：`vite build` 40 模块成功；重启 `vite preview :5180`（pid 50557）HTTP 200；`verify-loop.mjs` 全绿（3000 healthy / 8799=10 工具 / /run 契约合法 hash 一致 / 5180=200 / 4 套单测全绿）。
- 结论：用户在浏览器现在能看到「Agent 理解了什么」（可解释性），与既有的「品牌导览 + 溯源徽标」共同构成「由框架 FSM 驱动 · 确定性 · 可回放审计」的可见证据链。本地闭环仍完整可体验（http://localhost:5180）。
- 剩余阻塞不变：3/4/9 依赖用户授权改 ~/opt/hypha + 重启 + 提供 LLM，子代理不擅自执行；激活工具包 `hypha/activation-kit/` 已就绪，授权后零猜测落地。

### 2026-08-10（主代理 · 激活根因纠正 + 正确机制实证）
- **背景**：Robin 已选「只走路径 A」（真·Hypha 原生端到端 = 改共享配置+重启 Server+提供 LLM），并给出 DeepSeek Key（`sk-7f73…dfd8` / DeepSeek V4 Flash）。本轮在主代理端用**真实源码核实**收口「激活到底怎么做」，纠正了此前工具包/README 的致命前提错误。
- **实证测试（内联 domainPack 触发 start-run）**：用 owner JWT + 内联 `manyouwei-food-discovery.domain.server.yaml` + `react.messages:[{role:user,content:'南湖附近便宜的宵夜'}]` → 202 接受、run 创建、进入 ReAct FSM（RunInitialized 状态）。但 run **卡死 60s+**，事件流停在 `tool.contract.snapshot.created`，无任何工具/LLM 调用。证明：(a) LLM 推理链路已通（否则报无推理后端）；(b) 工具未被注册 → ReAct 起不来。
- **根因纠正（关键，已对 `~/opt/hypha` 源码核实）**：
  1. `ToolManager.loadAdapterProfiles` 对每个 `kind:http` profile 调 `resolveToolSpec(profile.toolSpecRef.id)` = `resolveCommonToolSpec(id) || approvedMCPRegistry.getSpec(id)`（`apps/server/src/core/tools/ToolManager.ts:1384`）。
  2. `resolveCommonToolSpec` 只认 `@hypha/tools` 里**写死的 12 个 common spec**（`utility.* / common.*`），自定义 `discover.filter` 等**永远返回 null**（`node_modules/@hypha/tools/dist/common-tool-catalog.js` 的 `COMMON_TOOL_IDS`）。
  3. 故 `tool-adapter-profiles.yaml` 设想的「10 个 `kind:http` + `toolSpecRef.id:discover.filter` 合并进 configs/tools.yaml + 重启」会**直接导致 Server 启动失败**（`required` profile 解析不到 spec → 抛错）。**原激活步骤是错的，不能这么干。**
- **正确激活机制（已核实）**：自定义工具必须走 **MCP**。`approvedMCPRegistry` 由「已连接且已审批的 MCP 服务器」填充；profile 解析的第二条路 `approvedMCPRegistry.getSpec` 才能命中 `discover.filter`。
  - 运行时 MCP 管理 API：`POST /api/v1/tools/mcp/servers/:id/connect`（admin）、`POST /api/v1/mcp/servers/:serverId/capabilities/:capabilityId/approve`（admin）。**无运行时注册端点**——新 MCP 服务器须写入 `config.yaml` 的 `tools.mcpServers` + 重启（init 期 `registerMCPServer`）。
  - 关键时序：`syncApprovedMCPTools` **只导入 catalog 状态为 `approved` 的能力**（`ToolManager.ts:1581`），故 `autoConnect` **不会**自动审批；必须在 Server 起来后手动 approve，工具才进 `approvedMCPRegistry`。且 `loadAdapterProfiles` 在启动期（审批前）跑，所以 `kind:mcp_*` profile 启动期也解析不到 → 不能靠 profile 注册 MCP 工具。
  - 结论：最稳路径 = **注册 MCP 服务器（非阻塞 `required:false`）+ 重启 + approve 10 能力**，让 ReAct 在请求期从 `approvedMCPRegistry` 按 `capabilityId`（`=MCP 工具裸 name`，如 `discover.filter`）解析（已核实 `normalizeMCPToolSpec` 把 `sourceRef.capabilityId` 设为工具裸 name，`findApprovedMCPTool` 据此命中）。
- **已交付（项目本地、可逆、零共享设施改动）**：`hypha/mcp-server/manyouwei-mcp.cjs` —— 本地 stdio MCP 服务器，把 `:8799` 现有 10 个工具原样暴露为 10 个 MCP 工具（name=裸 id，handler 转发到 `http://127.0.0.1:8799/tools/<id>`；SDK 走绝对 CJS 路径 `/opt/hypha/node_modules/@modelcontextprotocol/sdk/dist/cjs/...`）。**独立探针 `probe.mjs` 实测通过**：`listTools`=10；`discover.filter{zone:南湖,mealTime:[夜宵],maxPrice:30}`→success=true/matched=1（老樊城襄阳牛肉面·必吃）；`discover.rank{board:lateNight}`→success=true/ranked_by=lateNight/n=3。`:8799`→MCP 链路确证可用。
- **激活待办（需 Robin 确认重启共享 Server）**：① 在 `config.yaml` 的 `tools.mcpServers` 追加 `manyouwei-food-discovery`（mode:local, command:node, args:[项目 mcp-server 绝对路径], autoConnect:true, required:false，**不复用 `mcp.local` 这个 connectionProfileRef**，改用默认 id 避免与 local-example 冲突）；② 重启 PID 17893 的 :3000 服务（**会短暂中断同机其他 Hypha 项目如货代**——已在前序 README 警示）；③ `approve` 10 个能力；④ 再跑 start-run 断言 `output.food-recommendation.merchants[]` 且 `summary.total_matched>0`。
- 改动文件（本轮）：新增 `hypha/mcp-server/manyouwei-mcp.cjs`、`hypha/mcp-server/probe.mjs`。**未改任何 `~/opt/hypha` 文件、未重启 Server**（保留 3000 正常运行 + 不误伤同机其他项目）。
- 结论：路径 A 的「工具注册」正确通道是 **MCP 服务器**，不是 http profile；盲改 tools.yaml 会搞崩 Server。MCP 服务器已写好并独立验证通过，只差 Robin 确认「改 config.yaml + 重启 3000」这一步即可机械落地。

### 2026-08-10（每小时自动化 · 就绪保持 + 体验入口恢复轮）
- 性质：保持「就绪待激活」状态 + 恢复用户可体验入口（均为本地、零共享设施改动）。3/4/9 仍 BLOCKED 于「Robin 授权重启共享 Hypha Server」这一单一动作。
- **本轮动作（均在子代理权限内，不碰 ~/opt/hypha / 不重启共享 Server）**：
  1. 巡检发现 `:5180` 前端预览服务 DOWN（HTTP 000）——本地 vite preview 进程已退出；**重启 `vite preview --port 5180`**（本地 dev 服务，非共享设施）→ 恢复 HTTP 200，用户可体验闭环入口重新可达。
  2. 修正 `hypha/mcp-server/probe.mjs` 的硬编码 `merchantId:'wuhan-001'`（不存在，真实 id 形如 `m0100`）→ 改为 `m0100`；重跑探针：`TOOL_COUNT=10` + `FILTER/RANK/DETAIL` 全部 `success=true`，MCP→:8799 链路确证无回归（此前 DETAIL 显示 false 系探针 id 写错，非适配器回归）。
  3. 更新 `verify-loop.mjs` 末尾提示：LLM 后端已就绪（Robin 提供 DeepSeek Key，主代理实证推理链路已通）；唯一剩余 = 授权改 `~/opt/hypha` 配置 + 重启共享 Server。
- **验证（全绿，EXIT=0）**：`verify-loop.mjs` 通过——:3000 healthy / :8799=10 工具 / `/run` 合法契约(total=1/price/hash 一致) / processHash 一致 / :5180=200 / 4 套单测全绿。
- **结论**：本地可体验闭环完整存活（http://localhost:5180）；MCP 工具服务就绪可零猜测落地。真·3000 运行时现仅差 Robin 一句话授权「改 config.yaml 的 tools.mcpServers + 重启 3000 + approve 10 能力」——该动作会短暂中断同机其他 Hypha 项目（如货代），故子代理不擅自执行，待明确「go」后机械落地。
- 改动文件：`hypha/mcp-server/probe.mjs`（改 id）、`hypha/implementation/verify-loop.mjs`（提示文案）、`h5` 前端预览进程（重启，非文件改动）。

### 2026-08-10（战略转向 · 框架先行 · 数据解耦）
- **背景（Robin 明确）**：原蛮有味网页只是素材，要基于它构建**智能体驱动的新美食产品**；老 590 武汉数据暂不直灌，先搭框架再灌。此前对 Path A/B 的讨论（是否激活 3000 跑老数据）因此被推翻——当前重心是"数据无关的新 Agent 框架"。
- **落地（数据抽象层）**：新增 `hypha/implementation/src/datasource/`：
  - `base.js` `FoodDataSource` 抽象基类（listMerchants / getMerchantById / getCategories / getZoneCoords）；
  - `registry.js` 注册表 + `getDataSource()` / `setDefaultDataSource()` / `createDataSource()`，默认 `env MYWO_DATASOURCE || 'sample'`；
  - `sample.js` 默认数据源（7 条明显合成商户，非真实；含缺坐标样本演示降级），`registerDataSource('sample')`；
  - `wuhan.js` opt-in 数据源（包 ALL_MERCHANTS + CAMPUS_COORDS，`registerDataSource('wuhan')`），即后续「灌数据」唯一接入点，暂不默认启用；
  - `index.js` 统一出口 + 自动注册 sample。
- **解耦改造**：`discovery-engine.js` 去掉对 `ALL_MERCHANTS` 的硬编码，改 `getDataSource().listMerchants()`；`tools/{detail,geo,filter,rank}.js` 全部改走 `getDataSource()`（detail 按 id 查、geo 取参考坐标、filter/rank 缺省回退数据源）。工具 inputSchema 不变，MCP/HTTP 调用方式不变。
- **验证**：新增 `test/datasource.test.mjs`（15 断言：默认=sample、/run 合法契约+processHash 一致+降级、切 wuhan→590、切回 sample）；原 4 套单测（orchestrator/intent-parser/engage/prompts）保持全绿（本就只校验契约形态与 processHash，未硬编码武汉 total）；`node --check` 11 文件全过。重启 `:8799`（新后台 JqRmGe，MYWO_DATASOURCE 缺省 sample）后 `curl /run '南湖附近便宜的宵夜'` 返回样例商户（样例·南湖宵夜摊@18 等）、provenance.driver=hypha-fsm、无老数据。
- **结论**：美食发现 Agent 框架已与数据集解耦——默认跑合成数据即可端到端演示，真实数据经 `setDefaultDataSource(createDataSource('wuhan'))` 或 `MYWO_DATASOURCE=wuhan` 注入，做到"框架先行、数据后灌"。下一步：在该框架上定义新产品的 Agent 能力边界 / 多轮对话 / 与 h5 前端的新接入形态（待 Robin 定方向）。
- 改动文件：`hypha/implementation/src/datasource/{base,registry,sample,wuhan,index}.js`、`hypha/implementation/src/discovery-engine.js`、`hypha/implementation/src/tools/{detail,geo,filter,rank}.js`、`hypha/implementation/test/datasource.test.mjs`。
