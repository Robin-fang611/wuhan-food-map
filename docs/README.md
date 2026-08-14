# 蛮有味 · 文档索引

> **本文是索引，不是事实来源。** 项目唯一事实来源是 **[SPEC.md](SPEC.md)**——定位、架构、里程碑、验收、风险、下一步全部以它为准。

## 现行文档（执行依据）

| 文档 | 作用 |
|------|------|
| [SPEC.md](SPEC.md) | **唯一事实来源（v2.0，智能体产品标准）**：定位 / 智能体行为规范 / 架构 / 指标 / 里程碑 / 验收门禁 / 风险 / 下一步开发清单 |
| [status-2026-08-15.md](status-2026-08-15.md) | 实查状态快照（源码核查，非 roadmap 勾选） |
| [BFF接口契约.md](BFF接口契约.md) | V4 后端 Route Handlers 契约（后端落地唯一依据） |
| [高德Key安全接入.md](高德Key安全接入.md) | 高德 Key 安全红线与后端代理方案 |
| [ranking-audit.md](ranking-audit.md) | 反广告排序审计（可重跑，PASS 结论） |
| [datasource-reconcile.md](datasource-reconcile.md) | 数据源口径核对（857 vs 625，可重跑） |
| [collect-visit-guide.md](collect-visit-guide.md) | 探店采集升级 estimated→verified 流程 |

## 智能体技术规格（hypha/ 目录，补充 SPEC）

`hypha/ARCHITECTURE.md`（4 层 + L0–L4 + 10 步）、`hypha/PRODUCT-VISION.md`（产品愿景，含反广告差异化）、`hypha/MONETIZATION-MODEL.md`（纯 CPS 模型 + 防火墙）、`hypha/ITERATION-LOG.md`（步骤状态，含 BLOCKED 订正）。

## 守门智能体工作流（2026-08-15 更新）

1. 读 `SPEC.md` §11 下一步清单，挑第一个可执行项。
2. 实现 → 跑对应测试（`h5/test/`、`hypha/implementation/test/`、`hypha/integration/`）→ `node --check` → 静态服务 200。
3. 对照 SPEC §8 质量门禁与 §10 里程碑验收逐条确认；标注「待 Robin」的不擅自越线。
4. **审阅**：每次代码文件更新后逐条审阅（diff + 测试 + 红线扫描），审阅通过后更新 `status-*.md` 与 `.workbuddy/memory/` 当日日志。
5. **推送**：审阅通过后直接 `git commit + push` 至 GitHub（origin master）——2026-08-15 Robin 已授权（D-20260815-01），覆盖旧「不 push」红线。
