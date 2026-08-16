# 控制塔 (Control Tower)

> 精简状态视图，目标 < 1500 tokens。细节一律进 layers/，这里只做导航。每次阶段性结论后立即更新本文件。

## 项目一句话
**蛮有味（Manyouwei）**——面向武汉（校园先行）的 AI 智能体美食发现产品。非技术创始人 Robin。当前阶段：V1–V3 已全交付（LLM 基座真跑✅ / 信任内核✅ / 账号券闭环✅原型），V4 实施中（账号子系统✅ / 数据统一已授权待实施），SPEC v2.0 已重构（智能体产品标准）。

## 当前焦点
- **2026-08-15**：SPEC v2.0；S2–S6 完成；**上线路线图 W1–W8 纯代码全部完成并推送**（W5 安全 / W1 双轨 / W2 界面重构 / W3.1 坐标补全 58→138 / W4 注册流程 / W7 部署准备 / W8 隐私+引导+拆包）；54 测试全绿。
- **2026-08-15 晚间**：修复线上「连不上 Agent 后端」（agent-client.js 硬编码 127.0.0.1:8799 绕过 apiBase + discover 15s<后端 25s 升级护栏 + 3 处 :8799 文案），65 测试全绿；**已部署阿里云并线上实测通过**（对话「心情不好」→ 主推 m0448）；vite preview 补 /api 代理。
- **2026-08-15 深夜 · S7 Demo 收尾（Robin 拍板）**：探店采集双入口（修复 FAB 被 Tab 栏盖住 + 我的页入口）；管理员审核面板（admin.js + GET /upload/audit）；SPEC §11 剩余项转「下一阶段升级点」表 U1–U10，**Demo 功能冻结**。
- **2026-08-15 深夜 · S8 采集升级（Robin 拍板）**：野店上传支持图片（压缩/落盘/鉴权）+ 已有店铺补充照片描述（extras 审核流 + 详情页展示 + 管理面板图片预览）；65 测试全绿；**已部署阿里云并线上验收通过**。
- **下一步（待 Robin 睡醒补充外部依赖）**：R1 服务器 · R2 域名+备案 · R3 短信密钥+模板 · R4 微信凭据 · R5 首批实地探店 · R6 品牌资产；另 .env 补 AUTH_DATA_KEY/ADMIN_TOKEN/ALLOWED_ORIGINS（生产）。补齐后：W7 部署 → W8 验收 → W9 灰度。
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
