# 架构与技术栈 (Architecture)

_记录系统架构、技术选型、模块边界、关键依赖。保持可维护，随架构演进更新。_

## 高层架构
- **三层**：`h5/`（前端，纯函数放 `core/`，UI 放 `ui/`，必须用 `ui/dom.js` 的 `h()` 构建 DOM，禁 `innerHTML` 拼动态内容）+ `hypha/implementation/`（智能体编排，默认确定性 FSM、无 LLM）+ `assets/foodmap-data/` + `scripts/`（数据管线）。
- **数据流**：`assets/foodmap-data/{wuhan,campus,play}.js` → `scripts/normalize-data.mjs`（**自动生成器**）→ `h5/src/data/merchants.js`（**AUTO-GENERATED，禁止手改**）+ `places.js`。
- **编排链路**：`intent-parser.js`(parseIntent) → `orchestrator.js`(runFoodDiscovery → synthesizeDecision + buildTrace) → `discovery-engine.js`(runDiscovery → 附加 reason/factors) → `tools/{filter,rank,geo}.js` → `runtime.js`(projectMerchant 投射输出契约)。
- **后端**：`hypha/implementation/src/httpServer.js` 监听 :8799。`/run`=确定性引擎（默认，0 token）；`/agent`=LLM 路径（需 `DEEPSEEK_API_KEY`，`LLM_ENABLED=!!process.env.DEEPSEEK_API_KEY`）。`/health`。
- **前端**：vite 开发服务器 :5173。`MYWO_DATASOURCE` 注册表（sample 默认 / wuhan / …）决定数据源。

## 技术栈
- 语言 / 框架：前端原生 ES Modules + vite；后端 Node 22（managed）；无重型框架。
- 存储：本地 JSON 商户数据 + localStorage（前端账号/收藏）；后端无持久库（v1.5 后 RewardStore 抽象含 LocalStore/BffStore）。
- 消息 / 缓存：DeepSeek 提示前缀缓存（system+tools 静态，命中率极高）。
- 部署：未部署（红线）。规划：后端可放国内云（国内 LLM）或出海节点（海外 LLM）。

## 模块边界
- 引擎/纯逻辑 → `h5/src/core/`、`h5/src/plays/`；UI → `h5/src/ui/`（必须 h()）。
- 视觉只用 `h5/src/styles/tokens.css` 的 CSS 变量。
- 新"得券玩法"= `h5/src/plays/*.js` 实现 `PlayPlugin` 契约并 `register()`，不改引擎/券包。
- 数据访问走 `RewardStore`（`store.js`）；埋点走 `analytics.js` 单例 + `EVENTS`。
- 账号/收藏走 `auth.js` 的 `AuthProvider` 抽象（`LocalAuthProvider` v0.5 / `BffAuthProvider` v1.5 预留）；`activeUserId()` 解析当前用户。

## 关键依赖与约束（红线，最高优先级）
- **不 git push / 不部署公网 / 不改密钥·环境变量 / 不删数据 / 不付费 / 不 git 改写历史 / 不可逆操作** —— 一律先问 Robin 授权。
- **输出安全**：禁含 PII（`user_id`/`token`/`phone` 关键词）、假坐标、伪造券、暴露密钥。**字段名避 `phone`/`token`/`user_id`**（已用 `tel` 替代）；数据不编造，`verified` vs `estimated` 必须标注（`needsEnrichment` 标记待核验）。
- **防 XSS**：渲染用 `h()` + `textContent`，用户输入校验（空值/类型/长度），DB 参数化；不靠注释代码/吞异常/降级安全让任务"通过"。
- **密钥不进前端包**：高德 Key / 微信 AppSecret / JWT 经 env 或后端代理注入（见 M11 高德 Key 安全）。

## 业务模型（见 layers/decisions.md D-20260810-01/02）
- 反广告=排序不出卖（信任内核，锁定，可验证）；变现=纯 CPS/到店核销分润（单一线）；用户订阅已砍；透明赞助位暂不接。
- Job：日常"今天吃啥"快决策（高频·低介入·校园先行）；辅助决策 ≠ 替代决策。
