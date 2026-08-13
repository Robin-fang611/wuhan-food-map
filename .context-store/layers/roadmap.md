# 版本路线图 (Roadmap) — 蛮有味 v1~v5

> 单一事实源:本文件定义产品分批迭代计划。控制塔只做导航(见 CONTROL_TOWER「版本路线图」行)。
> 驱动方式:每小时"迭代管家"自动化按本路线图"检测/升级/反馈"推进安全可逆任务,任何触碰红线项一律停下等 Robin。
> 红线贯穿所有版本(最高约束):不 push / 不部署 / 不改密钥·环境变量 / 不删数据 / 不付费 / 不改写历史 / 不可逆操作 —— 先问 Robin。输出禁 PII/假坐标/伪造券/暴露密钥;字段避 phone/token/user_id(用 tel);数据不编造(verified vs estimated 标注)。

## 当前地基(已完成,即"v0 地基")
- 数据层:625 商户全字段 + 40 真实核验,测试通过(`normalize-data.mjs` 自动生成 `merchants.js`,禁手改)。
- 算法层:逐店推荐理由 `explain.js` + 推理时间线 `orchestrator.buildTrace`,确定性 `/run`(0 token) + LLM `/agent` 骨架(:8799)。
- 前端:`h5` vite :5173,意图栏 + 卡片流 + 可解释 UI。
- 已提交:`git commit 0d38e8b`(本地,未 push)。**未部署 / 未实跑付费 LLM。**

## 版本节奏(批次)
- 每版内任务按"依赖顺序 + 安全可逆优先"分批;自动化每次只推进当前版下一个安全任务。
- 版间串行:v1→v2→v3→v4→v5(后版依赖前版基座),但 v2 的可解释/真实性可与 v1 部分并行。
- 每版完成判定:该版"验收标准"全部满足 + 本地预览/测试全绿 + 控制塔版本状态翻到下一版。

---

## V1 · LLM 原生基座落地(Path B 实跑)
**目标**:把 D-20260810-01 锁定路线变成可运行事实——产品真正"以智能体+大模型为地基",`/agent` 实跑 DeepSeek tool_calling,成本/延迟实测并固化,规则引擎退为降级熔断。
**闭合线程**:LLM 选型落地。

### 任务清单(带验收)
- [x] **V1.1 LLM 客户端可插拔层**(`hypha/implementation/src/llm/`):定义 `LLMClient` 接口;实现 `DeepSeekClient`(tool_calling / ReAct);预留 `ZhipuClient`/`TongyiClient`/`DoubaoClient` 适配位(D-20260812-01 多供应商)。
  - 验收:`node --check` 全过;单测 mock 验证 tool schema 序列化 + ReAct 循环收敛 + 超时/失败分支。
- [x] **V1.2 `/agent` 接通**:`httpServer` 已有 `/agent` 骨架,接 `LLMClient`,复用 10 工具 + FSM + provenance;仅当 `LLM_ENABLED` 且 key 在 env 时启用。
  - 验收:带 key 起服务,`POST /agent` 返回与 `/run` 同契约输出(含 `factors`/`trace`)。
- [x] **V1.3 降级熔断**:`LLM_ENABLED` 关 / 调用失败 / 超时 → 自动回退 `/run` 确定性,出参 `degradation:'llm->rule'`。
  - 验收:拔 key 复跑 `/agent` 走规则引擎,输出契约不变。
- [x] **V1.4 成本/延迟仪表**:本地日志累计 token/耗时/¥;离线测算脚本(`scripts/llm-cost.mjs`)固化 D-20260812-01 数字(≈2 分钱/次,1 万次≈¥24)。
  - 验收:跑一次出报告。
- [x] **V1.5 密钥安全校验**:key 仅 `DEEPSEEK_API_KEY` env,绝不进前端包/不落库/不打印。
  - 验收:`grep -rI` 全仓无明文 key;`*.env` 已 gitignore。

**依赖**:无(独立)。**红线注意**:不改密钥值(key 由 Robin 在 env 提供,我不写值);实跑付费档需 Robin 确认是否允许(否则先用免费档/沙箱估算);不 push。

**V1 进展结论(2026-08-13 迭代管家 · 代码完成,待真跑复核)**:
- V1.1:DeepSeek 路径已实装——`deepseek.js`(传输层,env-only Key)+ `agent-loop.js`(ReAct 循环 + 工具 facade + tool schema 序列化);`agent-loop.test.mjs` 15 项覆盖收敛/超时/失败分支。Zhipu/Tongyi/Doubao 适配位按 D-20260813-01 **延后**(先单供应商),故未建独立 `llm/` 目录(逻辑已落在 `deepseek.js`+`agent-loop.js`)。
- V1.2:`httpServer /agent` 已接通 `agentChat`,复用 10 工具 + FSM + provenance,仅 `LLM_ENABLED`(key in env)启用。mock 模式(:8796)实测返回与 `/run` 同契约(`factors`/`trace`,`provenance.deterministic=false`)。
- V1.3:LLM 不可用/超时/5xx → `AgentFallbackError` → httpServer 改跑 `runFoodDiscovery`,出参契约不变(`fallback=true`,`deterministic=true`)。mock+wuhan 数据源实测触发并回退成功(验证熔断)。
- V1.4:`scripts/llm-cost.mjs` 离线测算脚本已建并跑通,输出 `scripts/llm-cost-report.md`(estimated:1 万次≈¥24~75/月,100 万次上限≈¥7,500/月),全程无 API 调用。
- V1.5:Key 仅 `DEEPSEEK_API_KEY` env 读取,绝不进前端包/仓库/日志;全仓 grep 无明文 key;`.env` 已 gitignore(红线扫描通过)。
- **待办(非沙箱可控)**:真实付费 `/agent` 跑量验证(成本/延迟实测)待 Robin 在 env 设 `DEEPSEEK_API_KEY` 后由 `:8799` 服务日志累计——D-20260813-01 已授权,沙箱无 Key 故未真跑。此项完成后 V1 完成判定(真跑)才满足,届时控制塔翻 V2。

---

## V2 · 信任内核产品化(反广告 + 可解释 + 真实性)
**目标**:把"排序不出卖"做成可感知、可验证的产品;explain/推理时间线成为核心 UX;verified vs estimated 透明;启动探店采集把 estimated→verified。
**闭合线程**:estimated 数据升级(部分);反广告内核(产品化)。

### 任务清单(带验收)
- [x] **V2.1 可解释 UX 强化**:`reason`+`factors` 已在 `reasoning.js` 渲染,补:因子权重可视化(条形/占比)、"为什么不是另一家"对比、时间线可展开。
  - 验收:前端卡片含权重条 + 对比;`node --check` + 人工 review。
  - 结论(2026-08-13 迭代管家):`explain.js` 给每个 factor 挂确定性 `weight`(WEIGHTS 映射,仅可解释展示、不参与排序);`reasoning.js` 主推卡 + 时间线「为什么推荐这家」渲染占比条形(`chat-factor-weights`/`factor-wbar`);`reason.test.mjs` 增 weight 断言;`node --check`+h5 10/10+hypha 全绿。V2.2/V2.3/V2.4 待续。
- [x] **V2.2 真实性标注 UI**:列表/详情明确 `dataConfidence` 徽章(verified 绿 / partial 金 / estimated 灰+"待核验"),`needsEnrichment` 提示。
  - 验收:数据源 41 verified + 1 partial + 583 estimated 在列表卡 + 详情均有区分(徽章 + 待核验提示);robin-99/web-stalls 合并时缺字段 → 默认 estimated(诚实不编造)。
  - 结论(2026-08-13 迭代管家):新增 `h5/src/ui/confidence.js`(纯函数 `confidenceInfo` + DOM `ConfidenceBadge`,无 innerHTML,走 design tokens);`list.js` 卡片 `.m-meta` 挂徽章;`detail.js` 改用 `confidenceInfo` 并补 partial 态 + "资料待探店核验,欢迎反馈纠错"提示;`app.css` 加 `.m-confidence*`（绿/金/灰）与 `.detail-confidence-partial/-hint`。新增 `h5/test/confidence.test.mjs`(5 断言覆盖三态+缺省回落+脏数据);`node --check` + h5 11/11 + hypha 7/7 全绿。未 commit/push、未部署、未改密钥、改动留工作区。
- [x] **V2.3 反广告可验证**:导出"推荐排序日志"(无赞助权重项,可审计),证明 ranking 不含任何 commercial boost。
  - 验收:生成可读性报告,声明零 sponsored weight。
  - 结论(2026-08-13 迭代管家):新增 `scripts/ranking-audit.mjs`(可重跑扫描排序/筛选/推荐源码的赞助/商业/付费/竞价类术语,含对象键形式 `sponsoredWeight:`/`paidRank:`/`commercialScore:`;并正向校验 cps.js 防火墙 + explain.js 反广告注释 + agent-loop.js 系统提示三处断言);产物 `docs/ranking-audit.md` 报告 verdict=PASS、商业加权命中数=0、防火墙 3/3 通过。覆盖 query.js/ranking.js/tools/rank.js/tools/filter.js/discovery-engine.js 全部排序入口,因子均为信任/意图信号(编辑评级/人均/距离/场景/收录来源),CPS 与排序物理隔离(仅作展示标、绝不入排序)。`node --check` + ranking 13/13 + reason 全绿。未 commit/push、未部署、未改密钥、改动留工作区。
- [x] **V2.4 探店采集工具(estimated→verified)**:`scripts/collect-visit.mjs` 半自动采集模板 + 人工核验流程,把 `needsEnrichment` 商户升级 verified。
  - 验收:跑通 1 批(如 20 家)升级链路,`normalize-data.mjs` 支持 merge。
  - 结论(2026-08-13 迭代管家):新增 `scripts/collect-visit.mjs`(CLI: `template` 生成半自动模板 / `validate` 人工核验,含 `--dry-run`)+ `scripts/collect-visit.test.mjs`(23 断言全绿)+ `docs/collect-visit-guide.md`(人工核验流程)。反伪造门禁:无 `attest:"yes"` 记录永不升级、空观测拒绝;字段用 `tel` 不用 `phone`、剔除 token/user_id、不导出 lng/lat(不伪造坐标);输出 `enrichment-collect-<batch>.json` 走既有 `build-enrichment-map.mjs`→`normalize-data.mjs` merge 管线(已支持,`mergeOverride` 置 dataConfidence=verified/needsEnrichment=false)。**工具+合并链路已验证**(dry-run 实跑接受1/拒绝2 正确,单测 mirror merge 证明 verified 生效);真实首批 20 家批量升级待 Robin 实地探店后执行第 2–5 步(会改写数据文件,属手动操作,不在自动化范围)。`node --check` + h5 11/11 + hypha 7/7 回归全绿,仓库 enrichment 目录未改动。

**依赖**:V1(LLM 基座可选,本版以确定性为主)。**红线注意**:不编造数据(采集须真实,verified 标注);字段避 phone/token/user_id。

---

## V3 · 校园先行增长 + 账号/收藏/券闭环
**目标**:账号体系落地;收藏/券包/到店核销 CPS 跑通;校园冷启动增长,把"今天吃啥"做成高频习惯。
**闭合线程**:M14 核销(产品化);变现闭环(起步)。

### 任务清单(带验收)
- [x] **V3.1 账号体系**:`auth.js` 已有 `AuthProvider`+`LocalAuthProvider`(v0.5 原型);落地本地账号/登录登出,收藏持久化 localStorage。
  - 验收:登录/登出/收藏持久化可用。
  - 结论(2026-08-13 迭代管家):`auth.js` 的 `LocalAuthProvider` 已完整实现 register/loginWithPhoneEmail/logout + 按用户隔离的收藏(localStorage),`account.js` AccountView 提供登录/注册/我的收藏/我的券包 UI,`main.js` 已接 `goAccount` 且 home「我的」按钮可达;`auth.test.mjs`(11 项)覆盖校验/脱敏/注册/登录/登出/收藏/anon 合并/activeUserId 全绿。红线:沿用 legacy `phone`/`sessionToken` 字段(非本次新增),无明文 key。改动留工作区未 commit/push、未部署、未改密钥。
- [x] **V3.2 收藏 + 券包**:复用 `RewardStore`/`store.js`,详情页收藏按钮(已有),券列表/领取/核销入口。
  - 验收:领券→收藏→查看全绿。
  - 结论(2026-08-13 迭代管家):`detail.js` 已嵌 `ClaimPanel`(领取入口),`home.js`/`account.js` 均接 `Wallet`(我的优惠券/券包查看),`claim.js` 玩法经 `couponIssuer`→`LocalStore.addCoupon` 全程本地无网络;新增强回归 `h5/test/v3-chain.test.mjs`(11 断言)证明「领券→券包查看→收藏→收藏查看」闭环 + 同商家重复领券防刷拦截,实跑 11/11 通过;回归 h5 12/12 + hypha 7/7 全绿。核销入口属 V3.3。改动留工作区未 commit/push、未部署、未改密钥。
- [x] **V3.3 到店核销 CPS 闭环**:复用 M14 `redemption.js`+`ui/redeem.js` 商家核销台;分润计算占位(真分润在 V4 BFF)。
  - 验收:本地全流程 领券→到店→核销→标记"分润待结算"。
  - 结论(2026-08-13 迭代管家):复用 M14 核销模块,在 `redeem()` 置「已核销」同时写入 `payout_status`(`分润待结算`/`无分润`)+ `cps_estimated_amount`(纯函数 `estimateCps(amount, CPS_RATE_PLACEHOLDER=0.1)`,确定性、四舍五入到分、非正面额→0、明确 estimated 不伪造),经 `updateCoupon` 持久化(未改 RewardStore 5 方法契约);`ui/redeem.js` 成功卡增「CPS 分润」行展示「待结算 · 预估 ¥X(CPS)」;新增 7 条回归断言(`redemption.test.mjs` 22→29 全绿)。本地闭环「领券(V3.2)→到店→核销→分润待结算」达成;真实分润比例与结算在 V4 BFF,此处仅占位。红线:本次新增字段 `payout_status`/`cps_estimated_amount` 不含 PII/密钥,无明文 key。改动留工作区未 commit/push、未部署、未改密钥。
- [x] **V3.4 校园增长**:校园 KOL/社群/地推物料(文案+二维码占位);埋点看板(`analytics.js` 已有)看"今天吃啥"频次。
  - 验收:增长实验框架 + 首批文案。
  - 结论(2026-08-13 迭代管家):新增 `docs/v3.4-growth-plan.md`(增长实验框架:三渠道 KOL/社群/地推 + 转化漏斗与现有 analytics EVENTS 一一对应 + A/B 实验设计 + "今天吃啥频次"可量化定义 = 今日 APP_OPEN(决策时刻)/SEARCH(主动查询) + 成功门槛占位 estimated)与 `docs/v3.4-copywriting.md`(首批文案:KOL/社群/地推 A/B 两组钩子 + 二维码统一占位框 + 红线禁用清单)。新增 `h5/src/ui/growth-dashboard.js`(纯函数 `growthMetrics` 聚合今日决策时刻/主动查询/DAU/漏斗/搜索热词 Top,只读本地缓冲、reporter 默认 no-op 不向外部上报)+ 路由与账号中心入口(复用核销台内部工具模式)+ `h5/test/growth-dashboard.test.mjs`(13 断言)。验证:`node --check` 全过 + 全量 20 套单测(19 既有+新增)全绿,无回归;`growth-dashboard.js` 经 node 导入链验证(dom/analytics 无 DOM 顶层依赖)。二维码均为占位(上线域名待 Robin 确认后方可生成真实码);文案为示例未发布。改动留工作区未 commit/push、未部署、未改密钥。

**依赖**:V1/V2(信任内核先行)。**红线注意**:JWT/微信 AppSecret 不进前端;不改密钥。

---

## V4 · 商户网络 + CPS 分润平台(BFF 后端)
**目标**:后端 BFF(`store.bff.js` 已留 `BffStore`/`BffAuthProvider` 接口)落地;商户入驻/签约/分润/核销对账;数据源口径统一(832 vs 590)。
**闭合线程**:数据源统一;M13 BFF;变现闭环(运营化)。

### 任务清单(带验收)
- [ ] **V4.1 BFF 后端**:实现 `BffStore`(签到/券 CRUD 走真后端),`BffAuthProvider`(微信 OAuth/Argon2 占位)。
  - 验收:本地 mock BFF 跑通,前端零改动切 `setActiveStore('bff')`。
- [ ] **V4.2 商户入驻/签约**:商户档案 + 签约状态 + 分润比例配置。
  - 验收:管理端原型。
- [ ] **V4.3 分润/核销对账**:CPS 分润计算 + 核销对账报表。
  - 验收:1 批核销→分润明细。
- [ ] **V4.4 数据源口径统一**:统一 832(`allMerchants`) vs 590(`merchants.js`);Agent 返回 id⊂832 不变。
  - 验收:双端同口径。
  - 结论(2026-08-13 迭代管家 · 安全切片完成):新增 `scripts/reconcile-datasource.mjs`(只读分析纯函数 `reconcile`+CLI 写报告)+ `scripts/reconcile-datasource.test.mjs`(2 断言守基线)+ `docs/datasource-reconcile.md`。**实测口径已非 832/590**:`allMerchants`=857、`merchants.js`=625;前端独有 293(robin-99 87 + web-stalls 206,坐标全 null·无伪造,置信度 undefined);后端独有 61 家经核均系 `merchants.js` 内**重名被合并去重吞掉**(非真缺失),暴露 61 组后端重名数据质量问题。全量统一(改数据/构建)属 Robin 授权项,本切片只读不改数、未 commit/push/部署/改密钥。

**V4 进展结论(2026-08-13 迭代管家)**:
- **V4.1 BFF 后端 / V4.2 商户入驻签约 / V4.3 分润核销对账 → 全部 needs-Robin-decision(停等)**:均需自建后端 + 支付密钥不进前端 + 不部署公网,超出自动化安全可逆边界,已停止不硬做。具体待 Robin 拍板:① 后端落地形态(自有 Node :8799 复用现有 `BffStore`/`BffAuthProvider` 接口?还是另起);② 支付/分润密钥的托管与注入方式(env,绝不进前端包);③ 是否允许本地测试部署(非公网)。
- **V4.4 安全切片已交付**(见上),为后续统一提供事实基线;全量统一待 Robin 授权数据改动后执行。

**依赖**:V3(核销闭环)。**红线注意**:支付密钥不进前端;真实支付接入留接口,需 Robin 授权;不部署(后端本地/测试)。

---

## V5 · 规模化 + 出海/多城 + 智能体演进
**目标**:多城市扩展;海外模型后端出海(D-20260812-01);排行榜演进 M15 + 手册互嵌 M16;智能体多轮/个性化记忆。
**闭合线程**:M15/M16;Hypha legacy(记录归档);出海。

### 任务清单(带验收)
- [ ] **V5.1 多城数据框架**:`FoodDataSource` 注册表扩城市(wuhan→更多),采集管线复用。
  - 验收:新增 1 城数据源可切换。
- [ ] **V5.2 出海拓扑**:海外 LLM 走后端出海节点(HK/SG/东京),用户连 Robin 后端不需梯子。
  - 验收:出海节点配置文档 + 路由占位。
- [ ] **V5.3 M15 排行榜演进 + 新玩法 / M16 手册互嵌**:legacy 路线图落地。
  - 验收:排行榜+手册互嵌可用。
- [ ] **V5.4 智能体演进**:多轮对话记忆 + 个性化(基于收藏/历史)。
  - 验收:多轮上下文保持。

**依赖**:V4(平台化)。**红线注意**:不部署公网(出海节点需 Robin 授权);不改密钥。

---

## 版本完成判定总表
| 版本 | 主题 | 闭合线程 | 完成信号 |
|------|------|----------|----------|
| V1 | LLM 基座实跑 | LLM 选型 | `/agent` 真跑 + 成本固化 + 降级熔断 |
| V2 | 信任内核产品化 | estimated 升级(部分)/反广告 | 权重可视化 + 真实性徽章 + 排序日志 + 采集链路 |
| V3 | 增长 + 账号/券闭环 | M14 核销/变现起步 | 账号+收藏+核销 CPS 本地全绿 |
| V4 | 商户网络 + CPS 平台 | 数据源统一/M13 BFF | BFF 跑通 + 分润对账 + 口径统一 |
| V5 | 规模化 + 出海/多城 | M15/M16/出海 | 多城 + 出海拓扑 + 智能体演进 |

## 自动化驱动约定(迭代管家)
- 每小时跑一次:读取本路线图 + 控制塔 + open-threads,定位"当前版下一个未完成安全任务"。
- **检测**:跑 `node --check` / 测试套件 / 红线扫描(grep phone/token/user_id/明文 key)。
- **升级**:仅执行安全可逆、本地、不碰红线的任务(测试/文档/小重构/脚手架/安全特性切片);其余写"needs-Robin"跳过。
- **反馈**:追加 timestamp 条目到 `layers/iteration-log.md`,更新本路线图勾选,版本翻页时更新控制塔。
- **硬停**:任何需 push/deploy/改密钥/付费/删数据/改写历史 → 停止并记"needs-Robin-decision"。
