# 进度日志 (Progress)

> 按时间记录里程碑、完成项、卡点。新会话靠它快速对齐"到哪了"。

## 2026-08-09 ~ 08-10（M17 Hypha 重构，历史背景）
- 完成：DomainPack FSM + 10 适配器 + 本地编排器 + httpServer :8799 + h5 意图栏；确定性 `/run` 落地，可回放审计。
- 复验纠正：真·3000 原生运行时代理从未真调工具（MCP 拒 external_effect + domainPack http 工具未注册），BLOCKED；确立 Path B（自有 Node 后端跑 DeepSeek）。
- 战略锁定：LLM 为地基（D-20260810-01）；反广告+纯 CPS（D-20260810-02）；框架先行数据后灌（D-20260810-03）。

## 2026-08-11（数据层 + 算法层补全）
- 完成【数据层】：`normalize-data.mjs` 增强派生全字段；`build-enrichment-map.mjs` + 4 份 enrichment JSON（早/宵夜/湖北菜/火锅，40 真实名店）；重生成 `merchants.js`=625 家（583 estimated + 41 verified + 1 partial）。
- 完成【算法层】：新增 `explain.js` 确定性逐店理由引擎；`intent-parser` 加 mood/taste；`discovery-engine` 附 reason/factors；`orchestrator` 加「为什么推荐这家」时间线步骤；`runtime.projectMerchant` 透传富字段；`agent-loop`(LLM 路径) 同产出 factors；前端 `reasoning.js`/`detail.js` 渲染。
- 测试：7 套后端单测全绿（~96 断言）+ 新增 `reason.test.mjs`（27 断言）。
- 提交：`git commit 0d38e8b`（111 文件，本地，未 push）。

## 2026-08-12（成本测算 + 架构决策 + 上下文库初始化）
- 完成：token 成本实测（确定性 0 token/¥0；LLM ≈3,481 token/次，DeepSeek ≈2 分钱/次）。免费选项核实：智谱 GLM-4-Flash 永久免费(30 并发, function calling)；海外 Mistral/Gemini/Groq 实测限额与可达性。
- 决策 D-20260812-01：生产优先国内 LLM，海外模型走后端出海（用户不需梯子、不需额外中转）。
- 初始化 `.context-store/` 共享上下文库（project-context-orchestrator），回填控制塔 + 5 层 + 本交接摘要，支持跨对话接棒。
- 卡点：`git push` 待 Robin 授权；LLM 选型待拍板（多供应商可插拔 vs DeepSeek 付费档实测）。
- 下一步：等 Robin 拍板 push 与 LLM 落地路线；之后可做多供应商 LLM 客户端或多数据源口径统一。
