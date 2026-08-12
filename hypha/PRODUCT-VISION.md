# =============================================================================
# 蛮有味 · 美食发现 Agent — 产品愿景与基座决策（PRODUCT-VISION）
# -----------------------------------------------------------------------------
# 本文档以 Hypha 方式（与 manyouwei-food-discovery.domain.yaml 同套心智模型与
# 术语）整理两件事：
#   1）Robin 明确的产品主张：以「智能体 + 大模型」为产品基座，而非仅规则引擎；
#   2）当前工程现状快照 + 把"大模型基座"从设想变成可运行系统的收口路径。
#
# 定位：本文是「战略层 / 产品层」单一事实来源（SOF）；
#        manyouwei-food-discovery.domain.yaml 是「执行层 / 契约层」单一事实来源。
# 两者关系：domain.yaml 早已声明本系统应是"Hypha 运行时托管的真·智能体（ReAct
# + FSM + 受治理副作用）"；本文把 Robin 的基座决策钉死，并指明当前在跑的确定
# 性运行时只是"价值探针 / 降级态"，必须收口到 LLM 基座。
#
# 安全红线（与项目一致，贯穿全文）：DeepSeek Key 仅服务端 env 持有，不入库、
# 不进前端包、不写明文；渲染防 XSS；不碰付费发布。
# =============================================================================

id: doc.manyouwei-product-vision
version: 0.1.0
status: DRAFT（待 Robin 评审后转 ACTIVE）
date: 2026-08-10
author: WorkBuddy（整理 Robin 口述 + 工程现状）
basis:
  - hypha/manyouwei-food-discovery.domain.yaml   # 执行层契约（Hypha DomainPack）
  - hypha/ITERATION-LOG.md                        # 工程迭代事实（含 DeepSeek 实测）
  - .workbuddy/memory/MEMORY.md（M17 段）          # 项目长效笔记
  - 2026-08-10 多轮对话（方向 A / 先 h5 后小程序 / 框架先行数据后灌 / 本决策）

# -----------------------------------------------------------------------------
# 0. TL;DR（给创始人 30 秒看懂）
# -----------------------------------------------------------------------------
# - 产品形态已定：方向 A「纯决策助手」+ 载体「先 h5 后微信小程序」+ 数据「框架先行
#   → 灌 590 → 未来做智能体采集」。（见 2026-08-10 决策）
# - 基座决策（本文核心，纠正此前临时判断）：本产品**必须以智能体 + 大模型为地基**，
#   不是"先用规则跑、以后再说 AI"。规则引擎只是当前在跑的降级态 / 价值探针。
# - 大模型基座的可行性已被实证：DeepSeek 链路实测 200 / ~1.2s 可达（ITERATION-LOG:24、:175）。
# - 落地推荐路线：在我们**自己的 Node 后端（:8799）里跑 DeepSeek 工具调用循环（ReAct）**，
#   复用现有 10 工具 + FSM + provenance 契约；Key 走服务端 env，不依赖被 BLOCK 的
#   共享 Hypha 3000 设施。前端零改动即可从"规则大脑"切到"LLM 大脑"。
# - 现状风险：当前线上在跑的是**确定性规则运行时（无 LLM）**，与"LLM 基座"目标存在
#   差距，本文即为此差距的收口计划。

# -----------------------------------------------------------------------------
# 1. Domain（产品域）
# -----------------------------------------------------------------------------
domain:
  name: 蛮有味·美食发现 Agent
  oneLiner: >-
    用户说一句带约束的话（在哪 / 预算 / 忌口 / 时段 / 场景），Agent 替他做"今天吃啥"
    的决定，并讲清为什么——而不是甩一堆列表让他自己选。
  jobToBeDone: >-
    当用户"不知道吃啥 / 选择太多 / 怕踩雷"时，雇佣这个 Agent 把模糊诉求收敛成
    一个可信的、带理由的推荐结论，并衔接导航 / 收藏 / 后续动作。
  differentiatorVsPlatforms: >-
    不做又一个大众点评 / 小红书 / 美团。核心差异点 = 反广告且"排序不出卖"：任何商户
    付费字段都不得进入推荐逻辑代码，分润只在用户选定后于渲染层后挂，排序永不被出价
    影响、且可静态审计验证。叠加 替你决策 + 可解释（每张卡写明"为什么推荐这家"）
    + 越用越懂你。这是与大众点评 / 美团的根本信任差异（详见 PRODUCT-REQUIREMENTS.md §1.3）。
  targetUser:
    primary: 财大南湖周边学生与周边食客
    expansion: 武汉全城（先窄后宽，数据密度高、冷启动便宜）
  battlefield: 校园 Local 生活（窄而深，跑通后再扩全市）

# -----------------------------------------------------------------------------
# 2. Vision（战略定位：LLM-Agent 原生，而非规则插件）
# -----------------------------------------------------------------------------
vision:
  statement: >-
    本产品以「智能体 + 大模型」为基座。Agent 是产品的水，不是加进去的一勺糖：
    对话即界面、推荐 / 导航 / 收藏 / 打卡 / 未来预订都由 Agent 串起，记忆是一等公民，
    能主动推送（"你常去那家今天有券"）。
  whyLlmIsFoundation:
    - 规则引擎（intent-parser 的关键词 / 正则 / 口语同义词映射）是人工 heuristic，
      叠在 590 数据结构上，**不是学出来的**——它只能理解设计好的约束句式，抓不住
      "今天心情不好想吃点治愈系暖暖的"这类自由语境。
    - 真正的"懂用户、会聊、能处理模糊与多轮"必须靠大模型的自然语言理解。
    - 确定性规则保留为**降级 / 兜底 / 可审计层**，不是主路径。
  correctionNote: >-
    此前"先证价值、再谈 AI 原生"是分阶段临时判断；Robin 现明确：基座本身就是
    LLM Agent。故阶段顺序调整为：先以规则运行时证"用户愿不愿交决定"（已基本证成），
    立刻收口到 LLM 基座，规则退为兜底。
  aiNativeEndstate:
    - 对话线程优先，弱化传统首页 / 列表视图（"脸"随形态演进，不阻塞）。
    - Agent 串起推荐 → 导航 → 收藏 → 打卡 → 拼单 → 记账 → 主动推送。
    - 本地 + 可选云端记忆，越用越准。

# -----------------------------------------------------------------------------
# 3. Current State（现状快照，事实口径）
# -----------------------------------------------------------------------------
currentState:
  built:
    - 数据抽象层（hypha/implementation/src/datasource/）：FoodDataSource 接口 + 注册表，
      默认 sample（7 条合成数据，非真实），wuhan（590）opt-in，MYWO_DATASOURCE 切换。
    - 确定性 Agent 运行时（:8799 /run）：自然语言 → FSM（Intake→Discover→Completed）
      → 编排 10 工具 → 卡片流；processHash 可回放审计。
    - 前端 MVP（h5）：多轮追问（换一家 / 再便宜点 / 换个附近）、本地口味记忆
      （localStorage 辣度/预算/忌口）、样例数据信任徽标、方向 A 收口（隐藏签到/券包）。
    - 红线守约：h() 防 XSS；密钥未入库；未发布公网。
  live:
    - :8799 工具服务（sample 默认）+ :5180 h5 预览，可体验。
  provenButBlocked:
    - DeepSeek 大模型链路：实测 200 / ~1.2s 可达（ITERATION-LOG:24），推理链路已通。
    - 但"真·Hypha 3000 原生 ReAct 接管"被 BLOCK：需改共享设施 ~/opt/hypha
      （config.yaml 注册 MCP server + 提治理副作用天花板）+ 重启共享 Server（中断
      同机其他 Hypha 项目如货代），且需授权。此为**共享设施改动**，非本项目逻辑。
  keyStatus:
    provider: DeepSeek（V4 Flash）
    provided: 是（Robin 提供，见 ITERATION-LOG:175，哈希前缀 sk-7f73…）
    storedInRepo: 否（仅历史测试用过，未落库，符合红线）
    howToUseNext: 接入时仅服务端 env 持有，绝不进前端 / 仓库。
  gap: >-
    当前线上在跑 = 确定性规则运行时（无 LLM）。与"LLM 基座"目标之间存在差距，
    本文 §5–§6 为收口计划。

# -----------------------------------------------------------------------------
# 4. Foundation Decision（基座决策：把 LLM 接进来，且放对位置）
# -----------------------------------------------------------------------------
foundation:
  decision: 以智能体 + 大模型（DeepSeek）为产品基座；确定性运行时降级为兜底。
  routes:
    routeA_selfHostedBackend:
      label: 自有 Node 后端跑 LLM 工具调用循环（推荐）
      where: 在我们的 :8799 httpServer（自有进程）内新增 Agent Loop，调 DeepSeek
             Chat Completions（tool_calling / function_calling）驱动现有 10 工具。
      pros:
        - 完全可控，不依赖被 BLOCK 的共享 Hypha 3000 设施，不中断他人项目。
        - Key 服务端 env 持有，天然满足安全红线。
        - 复用 domain.yaml 的 10 工具 + FSM + provenance 契约，前端零改动切换。
        - 确定性运行时保留为"LLM 不可用 / 超时 / 成本熔断"时的兜底。
      cons:
        - 需自行实现 ReAct / tool-calling 编排（已有 FSM 骨架可改）。
        - 需接后端代理（避免前端直连、控成本、控速率）。
    routeB_sharedHypha3000:
      label: 共享 Hypha 3000 原生 ReAct（domain.yaml 既定目标形态）
      where: ~/opt/hypha 注册 MCP server + 提治理天花板 + 重启。
      pros: 与 domain.yaml 完全对齐，框架原生托管。
      cons: 改共享设施、重启中断他人、需授权；当前 BLOCKED。
  recommended: routeA_selfHostedBackend
  security:
    - DeepSeek Key 仅服务端 env（如 DEEPSEEK_API_KEY），绝不进前端 bundle / 仓库。
    - 前端经自有 :8799 后端中转，前端永不持有 Key、永不直连模型 API。
    - 后端做速率 / 成本 / 超时熔断；LLM 失败时回退确定性运行时。
    - 渲染仍走 h() 防 XSS；模型输出做校验，不把模型文本当可信 HTML。

# -----------------------------------------------------------------------------
# 5. Contract Reuse（复用既有 Hypha 契约，前端零改动）
# -----------------------------------------------------------------------------
contractReuse:
  tools: 复用 domain.yaml 的 10 工具（filter/rank/detail/geo/navigate/favorite/
         checkin/wallet/claim/track）——LLM 通过 tool_calling 调用，与规则编排同接口。
  fsm: 复用现有 FSM（Intake→Discover→Detail→Completed），LLM 接管 Intake 的自然语言
       理解，Discover 仍由 discovery-engine 编排工具。
  provenance: 沿用 processHash + 可解释参数 chip，LLM 决策同样需产出"为什么"（增强可信）。
  redlines: 四条红线（不泄露隐私 / 不伪造坐标 / 不伪造券 / 不泄露密钥）继续由运行时强制。
  frontend: h5 的 IntentBar 已支持"自然语言意图"与"结构化 params"两种入口；切到
           LLM 后端只需 agent-client 切 setBackend('server')，UI 不变。

# -----------------------------------------------------------------------------
# 6. Roadmap（让 LLM 基座落地的步骤）
# -----------------------------------------------------------------------------
roadmap:
  - step: R0 后端接 DeepSeek（routeA）
    detail: 在 :8799 内新增 Agent Loop：收自然语言 → 调 DeepSeek tool_calling →
           解析工具调用 → 复用 10 工具 → 回卡片流。Key 走服务端 env。
    blocking: 需 Robin 提供 / 确认服务端 DeepSeek Key 落位方式（env 名、代理）。
  - step: R1 降级与熔断
    detail: LLM 超时 / 5xx / 成本超限 → 自动回退现有确定性运行时，前端无感。
  - step: R2 数据灌入
    detail: MYWO_DATASOURCE=wuhan 一键切真实 590（框架已支持，零代码改动）。
  - step: R3 载体演进
    detail: 验证 h5 价值信号后，做微信小程序做校园分发（先 h5 后小程序已定）。
  - step: R4 智能体采集新数据
    detail: 在 Agent 内加"用户补充 / 纠错商户"回灌数据源的能力（未来功能，已记）。
  - step: R5（可选）升级共享 Hypha 3000
    detail: 若需框架原生托管，再走 routeB（授权改共享设施 + 重启）。

# -----------------------------------------------------------------------------
# 7. Open Questions（待 Robin 拍板）
# -----------------------------------------------------------------------------
openQuestions:
  - LLM 成本模型：每次对话 token 成本多少、校园量级下月费区间、是否需要缓存/限流？
  - 记忆策略：本地记忆（已做）够不够，何时需要云端账号记忆？
  - 兜底阈值：LLM 失败回退规则的触发条件与用户提示话术。
  - 数据质量：灌 590 前是否先清洗空缺 / 不准字段，避免首屏砸信任。

# -----------------------------------------------------------------------------
# 附录：关键事实与出处
# -----------------------------------------------------------------------------
# - DeepSeek 实测可达：hypha/ITERATION-LOG.md:24（"DeepSeek 实测 200/~1.2s 可达"）。
# - Key 提供记录：hypha/ITERATION-LOG.md:175（"Robin 提供 DeepSeek Key sk-7f73…dfd8"）。
# - 规则来源：hypha/implementation/src/intent-parser.js（ORAL_CATEGORY_MAP / 价格触发词
#   为人工 heuristic，非学习所得）。
# - 数据解耦：hypha/implementation/src/datasource/（sample 默认 / wuhan opt-in）。
# - 执行层契约：hypha/manyouwei-food-discovery.domain.yaml（DomainPack，10 工具 + FSM）。
# - 安全红线：docs/高德Key安全接入.md、项目 MEMORY（M17 段）。
