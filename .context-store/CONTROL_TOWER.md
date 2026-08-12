# 控制塔 (Control Tower)

> 精简状态视图，目标 < 1500 tokens。细节一律进 layers/，这里只做导航。每次阶段性结论后立即更新本文件。

## 项目一句话
**蛮有味（Manyouwei）**——面向武汉（校园先行）的 AI 智能体美食发现产品。非技术创始人 Robin。当前阶段：数据层 + 算法层已补全并通过测试，本地可玩；尚未 push / 部署；正在定 LLM 选型与部署拓扑。

## 当前焦点
- 当前版 V1(LLM 基座实跑):Robin 已拍板 ① **授权 push**(本回合执行) ② **LLM 先用 DeepSeek 付费档 + 允许实跑**实测成本/延迟(D-20260813-01)。架构结论已定：**生产环境优先国内 LLM，海外模型走后端出海**（详见 D-20260812-01）。

## 版本路线图（详情 layers/roadmap.md）
- 当前版:**V1 · LLM 原生基座落地**(Path B 实跑)。地基 v0 已完成(数据层+算法层,本地可玩,未 push)。
- 五版弧线:v1 LLM 基座 → v2 信任内核产品化 → v3 增长+账号/券闭环 → v4 商户网络+CPS 平台(BFF) → v5 规模化+出海/多城。
- 驱动:每小时"迭代管家"自动化按路线图"检测/升级/反馈"推进安全可逆任务;碰红线一律停等 Robin(见 iteration-log.md)。

## 关键决策（最近 3 条，详情见 layers/decisions.md）
- 2026-08-12：D-20260812-01 生产 LLM 优先国内（DeepSeek/智谱付费档）—— 后端可放国内云，零跨境零合规风险；海外顶级模型走后端出海（HK/SG/东京），用户不需梯子、不需额外中转。免费档仅开发联调用。
- 2026-08-10：D-20260810-01 LLM 为产品地基（锁定 Path B）—— 自有 Node 后端 :8799 跑 DeepSeek tool_calling，规则引擎退为兜底/熔断；不依赖被 BLOCK 的共享 Hypha 3000 设施。
- 2026-08-10：D-20260810-02 反广告=排序不出卖（信任内核，锁定）+ 变现=纯 CPS/到店核销分润（单一线），用户订阅已砍掉。

## 阻塞 / 风险（详情见 layers/open-threads.md）
- 未结线程数：5（运行 health_scan 查看；push 授权、LLM 选型已结）。含 estimated 数据待探店升级、前后端数据源口径统一(832 vs 590)、 legacy 路线图 M15/M16、Hypha 3000 设施 BLOCKED。另 2 风险非阻塞（免费档限流 / 高德 Key 残留）。

## 红线（最高约束，见 layers/architecture.md）
- 不 git push / 不部署 / 不改密钥·环境变量 / 不删数据 / 不付费 / 不改写历史 / 不可逆操作 —— 一律先问 Robin。
- 输出禁含 PII（user_id/token/phone 关键词）、假坐标、伪造券、暴露密钥；字段名避 phone/token/user_id（用 tel）。数据不编造，verified vs estimated 必须标注。

## 指针（真相在源工件）
- 架构与技术栈：layers/architecture.md
- 关键决策与理由：layers/decisions.md
- 接口 / 数据契约：layers/api-contracts.md
- 未结线程 / 风险 / 阻塞：layers/open-threads.md
- 进度日志：layers/progress.md
- 最近交接：handoffs/（最新一份 2026-08-12-2350.md）
