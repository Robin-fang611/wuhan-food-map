# 控制塔 (Control Tower)

> 精简状态视图，目标 < 1500 tokens。细节一律进 layers/，这里只做导航。每次阶段性结论后立即更新本文件。

## 项目一句话
**蛮有味（Manyouwei）**——面向武汉（校园先行）的 AI 智能体美食发现产品。非技术创始人 Robin。当前阶段：V1–V3 已全交付（LLM 基座真跑✅ / 信任内核✅ / 账号券闭环✅原型），V4 实施中（账号子系统✅ / 数据统一已授权待实施），SPEC v2.0 已重构（智能体产品标准）。

## 当前焦点
- **2026-08-15 起**：SPEC v2.0（唯一事实来源，docs/SPEC.md）已重构完成；Robin 三项拍板入册（D-20260815-01 推送授权 / D-20260815-02 数据统一授权+顺序 S2→S6）。
- **下一步清单（按序推进，见 SPEC §11）**：S2 数据统一 V4.4（重名治理+摄入 robin-99/web-stalls→857）→ S3 账号持久化（内存→文件）→ S4 收藏跨设备同步（user.favorite 后端化）→ S5 pending 上传治理 → S6 对话体验打磨（chat-first）。
- **守门智能体工作流（2026-08-15 更新）**：实现 → 测试全绿 → node --check → 红线扫描 → **审阅 diff** → 更新 status 文档 → **直接 commit + push GitHub**（已授权）。
- 已结：V1 真跑（.env 有 DEEPSEEK_API_KEY，4/4 真模型）；V2/V3 全交付；§7.4 探店采集三分支真跑验收；§7.4.1 账号体系（13/13 单测）；push 授权；LLM 选型。

## 版本路线图（详情 layers/roadmap.md 与 SPEC §10）
- V1 LLM 基座 ✅（代码+真跑）→ V2 信任内核 ✅ → V3 增长+账号/券 ✅（前端原型）→ **V4 商户网络+CPS 平台(BFF) 🟡 实施中**（账号✅ / 数据统一 S2 已授权 / 券核销支付延后）→ V5 规模化+出海 ⛔ 未启动。
- 驱动：守门智能体按 SPEC §11 顺序推进；每步完成=验收全过+审阅+推送。

## 关键决策（最近 3 条，详情见 layers/decisions.md 与 SPEC §12）
- 2026-08-15：D-20260815-02 V4.4 数据统一授权 + 下一步顺序 S2→S6（改数据/构建，不伪造坐标不引 PII）。
- 2026-08-15：D-20260815-01 GitHub 推送授权——审阅通过后直接 commit+push（覆盖旧「不 push」红线）。
- 2026-08-13：D-20260813-01 LLM 选型落地——主攻 DeepSeek 付费档（V4 Flash）走 Path B；授权真跑测试。

## 阻塞 / 风险（详情见 layers/open-threads.md 与 SPEC §13）
- 未结线程：estimated 数据升级（583 家待实地探店）、M15/M16 legacy、Hypha 3000 BLOCKED（已放弃主路径，仅记录）。数据口径统一线程已授权开跑。
- 风险：R1 账号内存存储（S3 治理中）/ R2 核销仅本地（等商家载体）/ R3 数据完整度 / R4 0 商户绑券 / R8 短信网关未生产化 / R9 微信未配置。

## 红线（最高约束，见 SPEC §7）
- 密钥不入库 / 不进前端包 / 不改密钥 env / 不部署公网 / 不删数据 / 不付费 / 不改写历史 —— 一律先问 Robin。
- **推送已授权（D-20260815-01）**：审阅通过后直接 commit + push origin master，无需再问。
- 输出禁含 PII（user_id/token/phone 关键词）、假坐标、伪造券、暴露密钥；字段名避 phone/token/user_id（用 tel）。数据不编造，verified vs estimated 必须标注。

## 指针（真相在源工件）
- 唯一事实来源：docs/SPEC.md（v2.0）· 文档索引：docs/README.md · 状态快照：docs/status-2026-08-15.md
- 架构与技术栈：layers/architecture.md · 关键决策：layers/decisions.md · 接口/数据契约：layers/api-contracts.md
- 未结线程：layers/open-threads.md · 进度日志：layers/progress.md · 最近交接：handoffs/（最新一份 2026-08-15-0000.md）
