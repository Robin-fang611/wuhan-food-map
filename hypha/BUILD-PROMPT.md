# 蛮有味 · 美食发现 Agent — 构建交接提示词（Phase 5 落地）

> 把下面的「提示词正文」整段复制，粘贴到一个**新的 WorkBuddy 窗口**，即可让它按产品文档把 Phase 5 全部需求跑完。
> 战略决策已经锁死，新窗口只需照着实现，不要重新讨论方向。

---

## 提示词正文（复制下面到 `---PROMPT---` 之间的全部内容）

---PROMPT---
你是蛮有味·美食发现 Agent 项目的构建负责人。目标：按产品需求文档把 Phase 5 全部需求落地成一个可运行、可体验的 MVP。不要重新讨论战略——决策已锁定，照着实现、验证、交付即可。

## 单一事实来源（动手前先读这 4 个文件）
1. hypha/PRODUCT-REQUIREMENTS.md —— 主需求文档（Phase 0–5 全决策，本任务的权威范围）
2. hypha/PRODUCT-VISION.md —— 战略层（LLM 基座、Path B 路线、红线、differentiatorVsPlatforms 已写「排序不出卖」）
3. hypha/MONETIZATION-MODEL.md —— 纯 CPS 变现 + 防火墙（排序不出卖）
4. hypha/manyouwei-food-discovery.domain.yaml —— 执行契约（10 工具 + FSM + provenance，processHash 已定 sha256:afbfbab2…，勿改契约）

## 已锁定的决策（不要再辩论）
- 基座 = 智能体 + 大模型（DeepSeek V4 Flash）；规则引擎仅作降级 / 兜底。
- 架构 = Path B 自有 Node 后端（:8799）跑 DeepSeek tool_calling 循环（ReAct）；复用现有 10 工具 + FSM + provenance，前端零改动切 setBackend('server')。不要碰 Path A（共享 Hypha 3000，BLOCKED，非本任务）。
- 首页形态 = B（对话 + 轻量侧栏 常去 / 收藏 / 附近）。
- 记忆：短期会话内 + 长期口味档案（后端按会话 id 隔离，不采 PII）。
- 决策输出 = 1 主推 + 理由 + 2~3 备选 + 一键导航 / 领券 / 核销。
- 变现 = 纯 CPS；推荐逻辑代码不得导入任何付费字段；排序永不被出价影响。
- 载体：先 h5 后小程序（本任务只做 h5）。

## 执行步骤（Phase 5，按顺序）
1. R0 后端接 DeepSeek：在 hypha/implementation/src/ 下新增 Agent Loop（可扩展 httpServer.js 或新建 agent-loop.js），收自然语言 → 调 DeepSeek Chat Completions(tool_calling) → 解析工具调用 → 复用 10 工具 adapter → 回卡片流。Key 仅服务端 env（如 DEEPSEEK_API_KEY），从 env 读，绝不硬编码 / 进前端 / 进仓库。
2. R1 降级与熔断：LLM 超时 / 5xx / 成本超限 → 自动回退现有确定性运行时（/run），前端无感。
3. 多轮对话 API：intake→clarify→discover→recommend→engage→track；前端 h5/src/integration/agent-client.js 切 setBackend('server')。
4. R2 数据灌入：确认 MYWO_DATASOURCE=wuhan 一键切真实 590（datasource 已支持），验证情绪语境意图在真实数据上的命中。
5. 记忆后端化：口味档案按会话 id 存自有后端（不进第三方、不落前端包、可一键清除）。
6. B 形态首页 + 决策契约：对话 + 轻量侧栏 + 「1 主推 + 理由 + 备选」输出格式。
7. 跑 PRD §2.4 廉价验证：20–30 条情境意图测试集，离线盲评 DeepSeek 原型 vs 规则引擎，用 PRD §2.3 判定线（≥65% 懂我胜率 & ≥15pp 决策完成率）证 LLM>规则。
8. CPS 商户签约 + 推荐卡片挂核销标（复用 M14 核销：hypha/implementation/src/redemption.js + h5/src/ui/redeem.js）。

## 红线（违反即停）
- DeepSeek Key 仅服务端 env；前端永不持有 Key、永不直连模型 API。
- 不编造坐标 / 券；不泄露 PII；渲染走 h() 防 XSS；模型输出当不可信文本校验。
- 推荐逻辑代码不导入任何商户付费字段；排序不被出价影响（可静态审计）。
- 不 git push / 不发布公网 / 不改密钥环境变量 / 不删数据 / 不碰付费。

## 环境
- Node：/Users/onebilion/.workbuddy/binaries/node/versions/22.22.2/bin/node
- 端口：:8788 被占用，工具服务用 :8799（MYWO_PORT 可覆盖）；h5 预览 :5180。
- 现有单测：hypha/implementation/test/*.mjs（5 套全绿）；门禁 verify-loop.mjs。
- :8799 已可跑 /run（sample 默认）；DeepSeek Key 由 Robin 提供（sk-7f73…dfd8），接入时仅服务端 env。

## 验收（完成条件）
- node --check 全过；5 套单测 + verify-loop.mjs 全绿。
- :8799 重启后 /run 在 sample 与 wuhan 两种数据源下均产出合法 output.food-recommendation（含 guidance+provenance），且 LLM 路径能真调工具。
- vite build 成功；preview :5180 → HTTP 200；B 首页对话可走通推荐闭环。
- 廉价验证出结论（LLM>规则 或 回退规则主），把结果写回 PRD §2.3。
- 红线事件 = 0；推荐逻辑对付费字段导入 = 0（可审计）。

## 交付
完成后用 present_files 给出：改动文件清单 + 本地体验方式（:8799 / :5180 启动命令）+ 验证结果 + 残留风险。遇阻塞先汇报再停，不要绕过红线或靠重复试参数硬闯。
---PROMPT---

---

## 使用说明
1. 新建一个 WorkBuddy 窗口（与当前窗口无关，它读不到本对话历史）。
2. 把上面 `---PROMPT---` 之间的正文整段粘贴进去发送。
3. 它会先读 4 个产品文档对齐范围，再按步骤 1–8 构建、验证、交付。
4. 本窗口（Robin 当前对话）已完成的动作：PRD 撰写、VISION 回写「排序不出卖」、本文档。构建本身不在此窗口执行。
