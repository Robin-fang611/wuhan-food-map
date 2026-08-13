# 蛮有味 · 美食发现 Agent —— 产品技术规格（SPEC）

> **本文定位**：项目**唯一事实来源（Single Source of Truth）**。所有代码、规划、验收、对外沟通均以本文为准。
> 旧文档（手册时代规划、早期产品方案、迭代计划等）已归档至 `docs/archive/`，不再作为执行依据（见 §10）。
> **版本**：v1.0（2026-08-13 起生效）· **作者**：Robin + AI · **维护**：守门智能体按本文件 §7 推进。

---

## 0. 本文与配套文档

| 文档 | 角色 | 状态 |
|------|------|------|
| **`docs/SPEC.md`（本文件）** | 唯一事实来源：定位 / 架构 / 里程碑 / 验收 / 风险 / 下一步 | 现行 |
| `docs/README.md` | 文档索引（指向本文件与保留文档） | 现行 |
| `docs/status-2026-08-13.md` | 实查状态快照（代码核查，非 roadmap 勾选） | 现行（点状记录，随 §4 更新） |
| `docs/BFF接口契约.md` | V4 后端 Route Handlers 契约（后端落地唯一依据） | 现行 |
| `docs/高德Key安全接入.md` | 高德 Key 安全红线与代理方案 | 现行 |
| `docs/ranking-audit.md` | 反广告排序审计（可重跑，PASS 结论） | 现行（自动生成） |
| `docs/datasource-reconcile.md` | 数据源口径核对（857 vs 625，可重跑） | 现行（自动生成） |
| `docs/collect-visit-guide.md` | 探店采集：用户上传店铺 + 高德校验入库流程 | 现行（见 §7.4） |
| `hypha/*.md`（ARCHITECTURE / PRODUCT-VISION / MONETIZATION-MODEL / ITERATION-LOG） | 智能体技术规格与演进日志 | 现行（Agent 专属，补充本文件） |

---

## 1. 一句话定位与边界

- **产品**：蛮有味（Manyouwei）—— 武汉 & 财大周边的 **AI 美食发现 Agent**。
- **一句话**：「今天吃啥？问蛮有味。」—— 你说一句偏好（心情 / 预算 / 和谁吃 / 片区），它用真探过的店给你**一个主推 + 2~3 备选，每家都带为什么**。
- **Job（核心场景）**：日常「今天吃啥」快决策——**高频、低介入、校园先行**。
- **价值主张**：辅助决策，**不是替代决策**——把人「照亮 / 收窄」，让人更快更敢做决定；最终拍板权在用户。
- **信任内核（不可动摇）**：**推荐排序不出卖**——排序与入选只由信任信号（评分 / 距离 / 人均 / 真实点评 / 场景）与用户意图决定，**绝不**因任何商户付费或分润关系改变。可验证（见 §5）。
- **当前形态**：纯前端 H5（Vite 原生 JS，零运行时依赖）+ 自有 Node 后端（:8799）跑 LLM；账号 / 发放 / 核销为前端原型（localStorage），**未接真后端**（见 §4）。

---

## 2. 已锁定决策（未经 Robin 重新拍板不得更改）

1. **LLM 为地基（最高优先级）**：产品以「智能体 + 大模型（DeepSeek）」为基座，不是「先证价值再谈 AI」。规则引擎（intent-parser 关键词 / 正则）只是当前在跑的**降级态 / 价值探针**，退居兜底 / 熔断层。
2. **正常后端形态**：客户端 → 自有 Node 后端（:8799 类）→ DeepSeek API。**Key 仅存服务端 env，前端永不直接持 Key**（解决密钥暴露与项目红线冲突）。不走「客户端直连 + BYOK」—— BYOK 摩擦大且构建注入 Key 违反红线。
3. **反广告 = 排序不出卖（信任内核，锁定）**：Agent 推荐排名永不被出价 / 赞助 / 分润影响，且可验证。这不是「绝不商业化」，是「商业化不污染排序」。
4. **变现 = 纯 CPS / 到店核销分润（单一线）**：用户订阅已砍掉（校园付费意愿低且非信任必需）；透明赞助位暂不接（后备，非主轴）。成本覆盖完全由 CPS 承担 → 商户签约网络 + 核销转化体验是单位经济唯一命门。
5. **框架先行、数据后灌**：当前数据层是抽象层，默认 `sample`（7 条合成数据，非真实），`wuhan` 数据源 opt-in 接 `ALL_MERCHANTS`（`setDefaultDataSource(createDataSource('wuhan'))` 或 `MYWO_DATASOURCE=wuhan`）。先搭框架再灌数据。
6. **成本可控（已证）**：DeepSeek 极便宜 + 规则引擎兜底 50–70% 简单 query → 校园月推理约 ¥100–300。「成本包不住」是**收入端**问题非成本端——瓶颈是增长 / adoption，不是 AI 贵。
7. **安全红线（绝不越界）**：高德 Key / 微信 AppSecret / JWT 密钥不入库、不进前端包、不 `git push`、不部署公网、不改密钥环境变量、不删数据、不碰付费 / 对外发布。

---

## 3. 产品架构

### 3.1 总体拓扑
```
浏览器 H5 (Vite 原生 JS, 零依赖)
   ├─ 首页意图栏 (home.js) ──goReasoning──▶ 推理页 (reasoning.js)
   │                                          │  L3 集成层 agent-client.js
   │                                          ▼  HTTP (CORS)
   │                         自有 Node 后端 :8799 (hypha/implementation)
   │                           ├─ POST /run   确定性 FSM (Intake→Discover→Completed)
   │                           │                → output.food-recommendation (0 token)
   │                           ├─ POST /agent  LLM 大脑 (DeepSeek ReAct tool_calling)
   │                           │                LLM 不可用 → 自动降级 /run (R1 熔断, 前端无感)
   │                           ├─ POST /tools/:id  单工具调用 (10 领域工具 adapter)
   │                           ├─ /memory/:sid     后端化口味档案 (去标识化偏好)
   │                           └─ DeepSeek API (Key 仅服务端 env)
   │
   └─ 数据访问：RewardStore 抽象 (LocalStore 默认 / BffStore 预留 v1.5)
```
- **双脑可切换**：前端 `setBackend('server' | 'local')` 零改动切 LLM 大脑 / 本地规则大脑；两者都走 :8799，仅端点不同（`/agent` vs `/run`）。**Agent 对话需 :8799 后端**；无 Key 时 `/agent` 自动降级 `/run`，体验无感。其余 H5 模块（列表 / 详情 / 券包 / 核销本地原型）不依赖后端也能跑。

### 3.2 智能体运行时（Path B 后端核心）
- **FSM（6 状态）**：`Intake → Parse → Discover → Reason → Finalize → Completed`（`orchestrator.js` 确定性实现，供 `/run`）。
- **10 领域工具**（domain.yaml 对齐，httpServer 工具表）：`discover.filter / rank / detail / geo / navigate` + `user.favorite` + `reward.checkin / view-wallet / claim` + `analytics.track`。模型经 **facade** 调工具，只拿投影候选集，不直接触原始数据。
- **ReAct 循环**（`agent-loop.js`）：收自然语言 → DeepSeek tool_calling → 调 facade 工具 → `finalize_recommendation` 提交决策（1 主推 + 2~3 备选 + 理由 + 导览）。模型输出不可信 → `resolveDecision` 校验商户 id 存在性，幻觉 id 丢弃 → 红线校验 `redlineCheck` → 装配 `output.food-recommendation`（与 `/run` 同契约）。
- **数据源抽象**（`datasource/`）：`FoodDataSource` 基类 + 注册表；`sample`（默认 7 条合成）+ `wuhan`（opt-in，`ALL_MERCHANTS`）。5 套单测证明可插拔。
- **可验证性**：`provenance.js` 记录 `processHash / fsm / prompts`；`explain.js` 为每条推荐附确定性因子 / 评分拆解 / 置信度；推理轨迹 `trace.steps` 可回放审计。

### 3.3 反广告防火墙（信任内核技术落地）
- CPS 商户签约集合（`cps.js`）**只决定卡片是否挂「可核销优惠」展示标**，**绝不被** discovery-engine / intent-parser / filter / rank / orchestrator 导入；排序从不读取该集合；不影响入选或位置。
- 系统提示明确「排序只基于信任信号，绝不因付费 / 分润改变」（`agent-loop.js`）。
- 审计脚本 `scripts/ranking-audit.mjs` 可重跑，结论 PASS（零商业加权命中）。

### 3.4 前端（h5）
- 主流程：列表 → 详情 → 领券 → 券包 / 收藏 → 到店核销 CPS，全通且有测试。
- 信任内核 UI：因子权重可视化、真实性徽章、反广告审计、探店采集工具，均真实实现。
- 工程约束：引擎 / 纯逻辑在 `core/`、`plays/`；UI 在 `ui/` 且**必须用 `dom.js` 的 `h()` 构建 DOM，禁止 `innerHTML` 拼动态内容**；视觉只用 `styles/tokens.css` 变量（蛮有味色板）。

---

## 4. 当前状态实查（2026-08-13，基于源码核查）

> 完整版见 `status-2026-08-13.md`。结论：代码地基已完整，**21 套单测全绿（h5 13 + hypha 8）**，V1–V3 代码级任务已全部真实落地并测试通过。**V4 后端形态已拍板（耦合单进程，范围收窄为账号 + 数据）**；V1 真跑验收待 Robin 提供 `DEEPSEEK_API_KEY`（将存服务端 env，不进仓库 / 前端）；券 / 核销 / 支付分润延后。工作区改动已于 2026-08-13 推送（commit 259e9bf / 327499a），本轮文档清理 + 新增契约测试将于 2026-08-13 提交。

| 层 | 状态 | 说明 |
|----|------|------|
| 数据层 | ✅ | `merchants.js`=625（后端事实源）；`all-merchants.js`=857（含 robin-99 87 + web-stalls 206，坐标全 null 未伪造）；置信度 41 verified + 1 partial + 583 estimated；**61 组重名被合并吞掉**（待治理，Robin 已授权 2026-08-13） |
| 算法层 | ✅ | 确定性 `/run`（0 token）+ LLM `/agent` 骨架（:8799）；`explain.js` 逐店理由 + 推理时间线 |
| 前端 h5 | ✅ 核心闭环 | 列表 / 详情 / 领券 / 券包 / 收藏 / 核销 CPS 全通；信任内核 UI 全实现；增长看板 + 文案占位 |
| 本地 Agent 运行时 | ✅ 代码 / ⛔ 真跑 | 10 工具 + 数据源抽象 + DeepSeek 客户端（真实 fetch + tool_calling）+ ReAct + 降级熔断；**真跑需 env `DEEPSEEK_API_KEY`** |

### 路线图完成度
| 版本 | 状态 | 关键说明 |
|------|------|----------|
| V1 LLM 基座 | 代码✅ / 真跑⛔ | `deepseek.js` + `/agent` 已写好；真跑验收需 `DEEPSEEK_API_KEY`（沙箱无 Key） |
| V2 信任内核 | ✅ 全交付 | V2.1–2.4 落地 + 测试 |
| V3 增长 + 账号 / 券 | ✅ 全交付 | V3.1–3.4 落地 + 测试（账号 / 券 / 核销为**前端原型**） |
| V4 BFF 后端 | 🟡 形态/范围已定 | 形态=耦合单进程（形态一）；**当下范围=账号 + 数据**（已授权治理）；券 / 核销延后（未谈商家）；支付分润隔离为独立项目，跑通后像积木拼上 |
| V5 规模化 / 出海 | ⛔ 未启动 | 依赖 V4 |

---

## 5. 信任内核（反广告）验证结论

- `scripts/ranking-audit.mjs` 扫描全部排序 / 筛选 / 推荐源码路径：商业加权术语命中 **0** → **PASS**。
- 防火墙正向控制三处已就位：CPS 物理隔离（`cps.js`）、核验只增信不增权重（`explain.js`）、LLM 提示约束（`agent-loop.js`）。
- 声明：**蛮有味的推荐排序不出卖（zero sponsored weight）**。营收（CPS 分润）与排序正交，仅在结果生成后以展示标呈现，且默认无真实签约商户（诚实留空，待 Robin 真实签约后填 env）。

---

## 6. 里程碑路线图（诚实状态 + 验收门禁）

| 版本 | 目标 | 验收门禁（Done 定义） | 状态 |
|------|------|----------------------|------|
| **V1 LLM 基座** | 真跑 `/agent`：自然语言 → ReAct → 真实推荐 | 设 `DEEPSEEK_API_KEY` 后 `/agent` 实跑产出 `output.food-recommendation`，累计真实成本 / 延迟达标 | 代码✅ / 真跑⛔ |
| **V2 信任内核** | 反广告排序 + 真实性徽章 + 探店工具 | `ranking-audit` PASS；UI 因子可视化上线 | ✅ |
| **V3 增长 + 账号 / 券** | 签到 / 玩法得券 / 券包 / 核销 / 增长看板（前端原型） | 10 套 h5 测试全绿；前端闭环可跑 | ✅（原型） |
| **V4 BFF 后端（收窄）** | 账号真后端 + 数据源统一（当下）；券 / 核销 / 支付分润延后 | 账号跨设备生效；857↔625 统一口径；支付分润作为独立可插拔模块后续接入 | 🟡 形态/范围已定，待实施 |
| **V5 规模化 / 出海** | 数据驱动榜 + 小程序壳 + 付费推荐位（后置） | — | ⛔ 未启动 |

---

## 7. 下一步开发清单（按优先级）

> 守门智能体按本表从上到下推进；标注「待 Robin」的需决策 / 授权后动工，不擅自越线。

### 7.1 V1 真跑验收【待 Key · 当前可先做无 Key 验证】
- **现在可做（无需 Key）✅ 已验证（2026-08-13）**：起 `:8799` 后端，验证 `/health`（10 工具）、`/run`（确定性，0 token，返回真实商户）、`/agent`（设 `MYWO_AGENT_MOCK=1` 离线演示模式，返回真实商户）端到端连通；ReAct + 工具 facade + 红线校验均通过。另加 `hypha/integration/agent-client.test.mjs`（15 断言）锁定前端↔后端响应契约。
- **待 Key**：在跑后端的环境设 `DEEPSEEK_API_KEY`（可经 `DEEPSEEK_BASE_URL` 指向本地网关 / 直连官方），实跑 `/agent` 累计真实成本 / 延迟，满足 V1 Done 定义。
- 前端联动 ✅ 已验证（2026-08-13）：`reasoning.js` 已接 `agent-client.js`（`discover`/`agentChat`/`setBackend`），`home.js` 意图栏经 `goReasoning` 跳转推理页调用；`vite build` 确认跨目录 import 编译通过（47 模块）。注：实际接入口是 `reasoning.js` 而非 `home.js` 直接 import（架构不变，仅调用点差异）。

### 7.2 V4 后端落地【已拍板 · 2026-08-13】
- **形态（已定）**：选**形态一（耦合单进程）**——在现有 `:8799` 后端上复用 `BffStore` / `BffAuthProvider` 接口扩写，一个 Node 进程全包（账号 + 数据 + Agent）。不另起服务。
- **当下范围（已定）**：只做**账号 + 数据**。`券` / `核销` 延后——当前还没谈商家，无真实载体（风险 R4）。`支付 / 分润` 延后——本身复杂，Robin 将**隔离为独立项目**，跑通后像积木一样拼上来（CPS 展示标已物理隔离，拼装成本低）。
- **本地联调（已授权）**：允许在开发 / 沙箱环境（非公网）启动 `:8799` 做真跑与联调；不部署公网。
- 落地依据：`docs/BFF接口契约.md`（Route Handlers 唯一契约）。

### 7.3 数据统一治理 V4.4【待授权 · 数据修改】
- 方向 A（推荐）：后端 `wuhan` 数据源摄入 `robin-99` + `web-stalls`，使后端 = 前端 = 857，Agent 返回 id 已 ⊂ 前端集合，零破坏。
- 前置：先治理 61 组后端重名（去重 / 修正店名），避免合并后计数漂移。
- 红线：不得伪造外源坐标、不得引入密钥 / PII。详见 `datasource-reconcile.md`。

### 7.4 探店采集（用户上传 + 高德校验）【已实施 · 2026-08-13】
- **新形态（Robin 2026-08-13）**：前端新增「上传店铺」功能——用户填店铺（名称 / 地址或定位 / 描述 / 分类），提交后**后端调高德 API 自动校验**：
  - 高德搜到该店（POI 匹配）→ 入**正式数据库**；
  - 高德没搜到 → 看上传人描述：**流动摊 / 路边摊**类（描述明确）→ 也直接入正式库（坐标取上传定位，不伪造）；
  - 既搜不到、又非摊类 → 存为**待核验**数据并打标注，**不删除**，留待人工判断。
- **依赖**：后端调高德需服务端 `高德 Key`（Robin 2026-08-13 提供新的 Web 服务 Key，已验证可用、未降级，置于服务端 `.env` 的 `AMAP_SERVER_KEY`，不进前端 / 仓库）。若暂缺 Key，校验降级为「全部进待核验」。
- **数据落点**：当下方进程 `:8799` 的 `merchant-uploads.json`（gitignored，verified / pending 分离数组），与 `ALL_MERCHANTS` 解耦；待核验与正式分离存储。
- **价值**：把「探店采集」从「Robin 实地 + 脚本」变成「用户众包 + 智能体校验」，直接补 R3 数据完整度。
- **实施要点 / 验收**：
  - 后端 `hypha/implementation/src/upload.js` + `httpServer.js` 的 `POST /upload`；前端 `h5/src/ui/uploadShop.js`（上传表单/结果态视图 + main 路由 + `app.css` 样式）。**入口位置（Robin 2026-08-13 决策）：放在地图页右下浮动按钮（`.map-fab`，`map.js` 内），不在首页——避免抢占首页主流量；首页 `home.js` 已移除该入口。**
  - **相关性闸门（防误判，2026-08-13 修复）**：高德 `place/text` 模糊返回不简单等同「找到该店」。`verifyWithAmap` 须通过 ①店名相似度 ≥ 0.5（归一化 + bigram Jaccard + 包含判定）②若用户给了定位则 POI 须在其 3km 内，二者皆过才判定 `verified`；否则返回 null，逻辑自然落到 `verified_stall` / `pending`。
  - **真跑三分支验收（真实 Key）**：①长子热干面→`verified`(10m)；②南湖后门流动煎饼摊·isStall→`verified_stall`；③zzz虚构店铺测试123·非摊→`pending`。均符合三分支契约。
  - 设计先行：`docs/design/shop-upload-design.md` + `shop-upload-mockup.html`（子代理产出，已对齐契约）。
  - 测试：`hypha/implementation/test/upload.test.mjs`（22 项）、`hypha/integration/agent-client.test.mjs`（含 `/upload` 路由契约，18 项）全绿。

### 7.4.1 账号登录体系（手机验证码 + 图形验证码 + 微信）【已实施 · 2026-08-13】
- **目标（Robin 决策）**：做「小程序式」登录——图形验证码（人机验证）+ 短信验证码（安全验证）+ 微信网页授权并行；密钥只在服务端，前端零密钥、零 innerHTML。
- **后端（Path B，`:8799`，零外部依赖）**：`hypha/implementation/src/auth-server.js` + `httpServer.js` 路由：
  - 图形验证码（人机验证）：服务端自绘 SVG（字母+数字，去除易混字符），一次性、5 分钟过期、常量时间比对；`POST /auth/captcha` 返回 `{token, svg}`（token 不含答案）。
  - 短信验证码（安全验证）：`POST /auth/sms/send` 须先过图形验证，再走服务端频控（1 分钟 1 次 / 1 小时 ≤5 / 24 小时 ≤10）；6 位安全随机码、10 分钟过期、一次性失效、常量时间比对；返回 `{ok, devCode?}`。
  - 登录：`POST /auth/login` 用短信码换 JWT（HMAC-SHA256 内联签发，零依赖，30 天）；返回 `{ok, token, user{id, nickname, phoneMasked}}`（**完整手机号永不下发前端**，隐私最小化）。
  - 微信：`GET /auth/wechat/url`（拼授权页，AppSecret 仅服务端）+ `GET /auth/wechat/callback`（code→openid/unionid→JWT→302 回前端落地页带 token+state）；`GET /auth/me` 凭 token 取用户。
  - **安全红线落地**：未配置 provider 时如实报错、不假装成功——生产环境（`NODE_ENV=production`）未配真实短信网关 → `/auth/sms/send` 报「短信服务未配置」；未配微信 AppID/AppSecret → 微信接口报「未配置」；未配 `AUTH_JWT_SECRET` → 不签发 token。JWT 密钥 / 微信 AppSecret / 短信密钥仅 env、不进前端不进仓库（`.env` 已 gitignore，`AUTH_JWT_SECRET` 为本地随机）。
  - 存储为内存 Map（原型，重启清空；后续可平滑换 Redis/DB，接口不变）。
- **前端（h5）**：`h5/src/api/auth-client.js`（封装 6 端点 + token 本地存取 + `apiBase` 可配）+ `h5/src/ui/login.js`（`LoginView`：手机+图形+短信+提交 状态机 + 微信按钮，全 `h()` 构建无 innerHTML）+ `h5/src/ui/account.js`（用 `LoginView` 替换原本地原型登录）+ `h5/src/core/auth.js`（`applyRemoteSession` 把后端会话写入本地存储，favorites/wallet 按 id 隔离零改动）+ `h5/src/main.js`（微信 callback 落地消费 token）+ `h5/src/config.js`（`VITE_API_BASE`）+ `h5/src/styles/app.css`（登录样式，全引用 tokens）。
- **真跑验收（进程内单测 13/13 全绿 + 负路径 HTTP 200/400/401 实测）**：图形→短信(ok+devCode)→登录(ok+JWT+脱敏手机号)→`/me`(ok)；错误图形码→400「图形验证码错误」；无短信码登录→400「验证码不存在或已使用」；重复用码→400「已使用」；非法 token→`/me` 401；微信未配置→400「未配置」。
- 设计先行：`docs/design/account-auth-design.md` + `account-auth-mockup.html`（子代理产出，已对齐契约）。

### 7.5 增长实验【文件已删 · 2026-08-13】
- Robin 决定删除增长框架 / 文案占位文件（`v3.4-growth-plan.md` / `v3.4-copywriting.md`），增长实验暂缓；待后续单独规划（试点校区 / 域名 / 节奏另议）。

---

## 8. 风险与待办（严格口径）

| # | 风险 | 等级 | 说明 / 建议 |
|---|------|------|--------------|
| R1 | 账号体系为前端原型 | 🔴 | `LocalAuthProvider`，无微信 OAuth / Argon2 / 云端同步，不跨设备。对外不可称「已上线账号系统」 |
| R2 | 核销后台仅本地 | 🔴 | 按码查依赖扫描本地券桶，跨用户 / 跨商家无法核销。需 V4 BFF 全局查码 + 服务端幂等 |
| R3 | 数据完整度 | 🔴 | 评分缺失 67%、推荐语缺失 73%，直接削弱榜单与详情体验（详见历史实测指标版） |
| R4 | 0 商户绑券 | 🟠 | 合作发券闭环无真实商家载体，当前券全为引擎发放 |
| R5 | 校区覆盖薄 | 🟠 | 首义 + 南湖仅 147/590（24.9%），「就近」价值被全城稀释 |
| R6 | Key 下发浏览器 | 🟠 | 静态部署固有，依赖高德域名白名单 + 安全密钥；彻底解决待 V4 代理 |
| R7 | V4 后端范围收窄 | 🟠 | 形态已定（耦合单进程）；当下只做账号 + 数据，券 / 核销 / 支付延后；真闭环进度取决于独立支付项目何时拼上 |
| R8 | 工作区改动待提交 | 🟢 | 已审查；2026-08-13 提交（含新增契约测试 + 文档清理） |
| R9 | 高德 Key 历史残留 | ⚪ | Robin 决定不重置（免费 Key，暴露无碍）；git 历史清理（不可逆）亦不做 |

---

## 9. 验收与质量门禁（通用）

- **纯逻辑改动**：在 `h5/test/` 或 `hypha/implementation/test/` 增 / 改 `*.test.mjs`，运行 node 须全绿。
- **所有 JS**：`node --check` 语法校验全过。
- **UI / 页面改动**：起静态服务后 `curl` 校验返回 200；DOM 用 `h()` 构建、无 `innerHTML`。
- **红线（绝不越界）**：不 `git push` / 不部署 / 不改密钥 env / 不删数据；涉及付费、对外发布、不可逆操作先停。密钥不入库不进前端包。
- **可重跑审计**：`node scripts/ranking-audit.mjs`（反广告）、`node scripts/reconcile-datasource.mjs`（数据口径）须 PASS / 对齐。

---

## 10. 文档体系整理说明（本次清理）

**保留（现行，见 §0 表）**：SPEC.md、README.md、status-2026-08-13.md、BFF接口契约.md、高德Key安全接入.md、ranking-audit.md、datasource-reconcile.md、collect-visit-guide.md。

**已归档至 `docs/archive/`（过时噪音，非执行依据）**：
- 手册时代规划（pre-2026-08-09 产品转向前）：`产品方向总纲.md`、`架构方案-两产品一套后台.md`、`增长与社群运营计划.md`、`手册体验改版计划.md`、`手册重构实施计划.md`、`重构执行规范.md`、`新智能体交接-第6轮续做.md`、`迭代计划/`（×5）、`提取/校园生活全攻略.md`。
- 已被取代的早期产品方案：`美食集散平台产品方案.md`（pre-pivot，M 状态已失准）、`蛮有味·产品文档（实测指标版）.md`（2026-08-08 基线，数据口径与 Agent 转向已过时）。
- 归档原因：原「两个产品一套后台 / 手册钩子」策略已被锁定的「智能体驱动美食产品」取代；上述文档描述的手册前端打磨、多轮迭代、早期 v0.3 方案均不再指导当前开发。其中奖励引擎 / 优惠券闭环等**仍有效的架构要点已提炼进本文 §3**。

> 归档 = 物理移动到 `docs/archive/`，**非删除**，可随时回退。是否永久删除归档目录，待 Robin 确认。

---

*本文件为蛮有味项目唯一事实来源，自 2026-08-13 生效。任何与旧文档冲突处，以本文为准。*
