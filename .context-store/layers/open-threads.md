# 未结线程 / 风险 / 阻塞 (Open Threads)

> 用 `- [ ]` 标记未结项；解决后改为 `- [x]` 并留一行结论（不要整行删除，保留轨迹）。
> 脚本按 `- [ ]` 数量统计未结线程数。

## 未结（按优先级）
- [x] **push 授权**：`git commit 0d38e8b`（数据层+算法层，111 文件）已提交本地。**已 push**（2026-08-13 Robin 授权，含本会话 roadmap/scripts/context-store）。
- [x] **LLM 选型落地**：2026-08-13 定**先用 DeepSeek 付费档** + 允许实跑 `/agent` 实测成本/延迟（D-20260813-01）；可插拔接口保留，第二家延后。
- [ ] **estimated 数据升级**：583 家 `estimated` 商户口味/环境为算法推导，待真实探店采集升级为 `verified`。当前诚实标注 `needsEnrichment:true`。
- [x] **前后端数据源口径统一**：后端 wuhan 数据源读 `merchants.js`（实测 625），前端列表/地图用 `allMerchants`（实测 857，含 robin-99/web-stalls）。差异 = 前端独有 293（robin-99 87 + web-stalls 206，坐标全 null·无伪造）+ 后端内 61 组重名被合并去重吞掉。**已授权 2026-08-15（D-20260815-02）**：S2 实施中（重名治理 + 摄入 → 857），实施依据 `docs/datasource-reconcile.md`，完成标志 = reconcile 双端同口径。
- [ ] **M15 排行榜演进 + 新玩法**：legacy 路线图待开发。
- [ ] **M16 手册互嵌**：legacy 路线图待开发。
- [ ] **Hypha 3000 共享设施**：真·3000 原生运行时仍 BLOCKED（MCP 工具未注册/治理拒写动作），非本项目缺陷，且已放弃作为主路径（走自有 :8799 Path B）。仅记录，不投入。

## 风险（非阻塞）
- [ ] **免费档限流**：任何海外/智谱免费档都不扛真实高并发，规模一来必付费（但极便宜，DeepSeek ≈2 分钱/次）。勿把免费档用于生产。
- [ ] **高德 Key 残留风险**：明文 Key 曾在 git 历史，建议高德控制台重置（M11 已移除当前引用改为 env 注入）。

## 已结（保留结论）
- [x] 数据层补全（625 商户全字段 + 40 真实核验）—— 2026-08-11 完成，`normalize-data.mjs` 增强 + `build-enrichment-map.mjs` + 4 份 enrichment JSON。
- [x] 算法层透明化（逐店理由 + 推理时间线）—— 2026-08-11 完成，`explain.js` + 全链路 wiring + UI，7 套单测全绿 + 新增 `reason.test.mjs`。
- [x] token 成本测算 —— 确定性 `/run` 0 token/¥0；典型 LLM 调用 ≈3,481 token，DeepSeek ≈¥0.0024–0.0075/次，1 万次≈¥24（缓存命中）。
- [x] 后端/前端本地预览起好 —— :8799(wuhan 确定性) + :5173(vite)，`/run` 实测主推带 5 因子 + 决策理由 + 时间线 why 步骤。
