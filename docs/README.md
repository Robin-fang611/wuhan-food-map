# 蛮有味 · 文档索引

> **本文是索引，不是事实来源。** 项目唯一事实来源是 **[SPEC.md](SPEC.md)**——定位、架构、里程碑、验收、风险、下一步全部以它为准。

## 现行文档（执行依据）

| 文档 | 作用 |
|------|------|
| [SPEC.md](SPEC.md) | **唯一事实来源**：产品定位 / 架构 / 里程碑 / 验收门禁 / 风险 / 下一步开发清单 |
| [status-2026-08-13.md](status-2026-08-13.md) | 实查状态快照（源码核查，非 roadmap 勾选） |
| [BFF接口契约.md](BFF接口契约.md) | V4 后端 Route Handlers 契约（后端落地唯一依据） |
| [高德Key安全接入.md](高德Key安全接入.md) | 高德 Key 安全红线与后端代理方案 |
| [ranking-audit.md](ranking-audit.md) | 反广告排序审计（可重跑，PASS 结论） |
| [datasource-reconcile.md](datasource-reconcile.md) | 数据源口径核对（857 vs 625，可重跑） |
| [collect-visit-guide.md](collect-visit-guide.md) | 探店采集升级 estimated→verified 流程 |
| [v3.4-growth-plan.md](v3.4-growth-plan.md) | 校园增长实验框架（占位草稿，待拍板） |
| [v3.4-copywriting.md](v3.4-copywriting.md) | 首批增长文案（占位，待审阅） |

## 智能体技术规格（hypha/ 目录，补充 SPEC）

`hypha/ARCHITECTURE.md`（4 层 + L0–L4 + 10 步）、`hypha/PRODUCT-VISION.md`（产品愿景，含反广告差异化）、`hypha/MONETIZATION-MODEL.md`（纯 CPS 模型 + 防火墙）、`hypha/ITERATION-LOG.md`（步骤状态，含 BLOCKED 订正）。

## 归档（docs/archive/）

手册时代（pre-2026-08-09 产品转向前）的规划、迭代计划、早期 v0.3 产品方案——已过时，**非执行依据**，可随时回退。是否永久删除待 Robin 确认。

## 守门智能体工作流

1. 读 `SPEC.md` §7 下一步清单，挑第一个可执行项。
2. 实现 → 跑对应测试（`h5/test/`、`hypha/implementation/test/`）→ `node --check` → 静态服务 200。
3. 对照 SPEC §6 验收门禁逐条确认；标注「待 Robin」的不擅自越线。
4. 更新 `status-*.md` 与 `.workbuddy/memory/` 当日日志；遇阻改 `受阻` 并写明根因。
