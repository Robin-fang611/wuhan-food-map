# 蛮有味 · 美食发现 Agent — 迭代待办（自动循环 PLAN 阶段单一输入）

> 本文件是「自动迭代循环」的 PLAN 阶段事实来源。每条含：设计依据、目标文件、可验证验收条件、状态标记。
> 状态：`[ ]` 待做 / `[x]` 已完成 / `[~]` 进行中 / `[!]` 受阻（需授权/外部依赖）。
> 设计稿单一事实来源：`hypha/PHASE5-DELIVERABLE.md` + `hypha/PRODUCT-REQUIREMENTS.md`（PRD §3）。
> 循环门禁：`hypha/dev-loop.cjs`（node --check + vite build + Hypha compile-check processHash 不变式）。

## 当前验证结论（2026-08-11 前端 vs 设计稿）

✅ 已对上：B 形态对话流骨架、决策卡（★主推+备选+一键导航/去核销）、推理叙事面板、可回放审计溯源行、CPS 标签、MVP_MODE 隐藏奖励飞轮（符合 PRD §5.2 MVP 范围）、h() XSS-safe 渲染、agentChat 后端切换、vite build 41 模块通过。

❌ 差距（见下 G1–G3，均为设计稿明确要求、前端未实现）：

---

## G1 口味记忆面板 + 一键清空（缺失）
- **设计依据**：PRD §3.3「记忆模型·长期口味档案」+ PHASE5 §一「口味记忆面板 + 一键清空」。
- **现状**：数据层已具备（`hypha/integration/agent-client.js` 的 `getMemory/clearMemory` + 后端 `memory-store.js` 按 sessionId 隔离），但 `home.js` 未渲染任何记忆 UI；新文件 `h5/src/ui/taste.js`（localStorage 版）完全未被引用（orphan）。
- **目标文件**：`h5/src/ui/home.js`（接入 `getMemory/clearMemory`）+ `h5/src/styles/app.css`。
- **验收条件**：
  1. 首页有可展开的「口味」面板，展示当前 sessionId 的口味档案（辣度/预算带/忌口/常去片区/收藏）。
  2. 面板含「一键清空」按钮，调用 `clearMemory(sessionId)`，清空后 UI 同步。
  3. 后端不可用（:8799 未起）时降级为静默/提示，不白屏、不抛未捕获异常。
  4. 全程 `h()` 渲染，无 `innerHTML`、无 Key 泄露。
- 状态：`[x]`

## G2 冷启动确定性入口（常去 / 收藏 / 附近）（缺失）
- **设计依据**：PRD §3.1「顶部一条确定性入口：常去 / 收藏 / 附近，缓解冷启动空屏焦虑」。
- **现状**：`home.js` 顶部仅 `我的 / 地图` 导航；无确定性入口行。
- **目标文件**：`h5/src/ui/home.js` + `h5/src/styles/app.css`。
- **验收条件**：
  1. 对话区上方有一条确定性入口：常去 / 收藏 / 附近 三个按钮。
  2. 常去 / 收藏 点击拉取 `getMemory(sessionId)` 的 `frequentZones` / `favorites` 并以卡片/气泡呈现；附近 触发 `ask('附近好吃的')`。
  3. 与现有 `renderQuickStart()` 情境 chips 不冲突（分层：确定性入口在上、情境 chips 在下）。
  4. 后端不可用时优雅降级（按钮仍可见，点击给友好提示）。
- 状态：`[x]`

## G3 情境快捷 chips 文本不符（部分）
- **设计依据**：PRD §3.1「几个情境快捷 chip（心情不好 / 想省钱 / 带人吃饭 / 不知道吃啥）」。
- **现状**：`home.js` 的 `QUICK_INTENTS` 为 `财大南湖周边 / 武汉全城 / 宵夜 / 必吃 / 人均不过百`（是区域/榜单 shortcut，非设计要求的情境 shortcut）。
- **目标文件**：`h5/src/ui/home.js`（`QUICK_INTENTS`）。
- **验收条件**：
  1. 冷启动 chips 改为设计要求四条：`心情不好 / 想省钱 / 带人吃饭 / 不知道吃啥`，各带合理意图文案。
  2. 原区域/榜单 shortcut 可降级为次级入口或并入 G2 的「附近/常去」，不强制保留为首屏 chips。
- 状态：`[x]`

## G4 输入框占位符文本不符（轻微）
- **设计依据**：PRD §3.1「输入框 +『今天想吃啥？』」。
- **现状**：`home.js` 输入框 `placeholder: '还想怎么调？'`（首轮误用后续轮占位符）。
- **目标文件**：`h5/src/ui/home.js`。
- **验收条件**：首轮占位符为「今天想吃啥？」；多轮后动态切换为「还想怎么调？」。
- 状态：`[x]`

## G5 降级路径决策「一句话理由」缺失（待评估）
- **设计依据**：PRD §3.4「主推必须可解释 + 承认不知道」。
- **现状**：`/run` 确定性降级无 `trace.finalize.reason` 时，`buildReasonLines` 退回「已按你的条件智能筛选」，主推卡无独立理由行。
- **目标文件**：`hypha/implementation/src/orchestrator.js`（`synthesizeDecision` 补 reason）+ `home.js` 渲染。
- **验收条件**：即便降级路径，主推也至少有一句基于筛选条件生成的可解释理由（如「离你最近 + 人均最低」）。
- 状态：`[ ]`

---

## 后续方向（非本次阻塞，F 类，来自 PRD §5.3）
- **F1 CPS 真实签约商户集**：`cps.js` wuhan 默认空，需 M8 商户网络 + 后端全局查码（BFF 接口契约 §4）。状态：`[!]` 受阻（外部依赖）。
- **F2 微信小程序分发**：待 h5 MVP 验证后启动。状态：`[ ]`。
- **F3 Path A 共享 Hypha 3000 原生 ReAct**：`~/opt/hypha` 治理天花板+无 LLM 后端，BLOCKED，需 Robin 授权改共享配置+重启。状态：`[!]` 受阻（共享设施改动，需明确「go」）。

> 红线（任何迭代不得破坏）：不暴露 Key/PII；不伪造坐标/券；渲染走 h()；排序不出卖（CPS 仅渲染层后挂）。

---

## G6 首页默认改地图（首屏视觉冲击）
- **设计依据**：Robin 2026-08-11 调整指令（首屏视觉冲击力 & 地图单独优化 UI/交互）。
- **现状**：`main.js:16` `let view = 'home'` 默认; 地图页 M9 已就绪但需要从二级入口升首屏。
- **目标文件**：`h5/src/main.js`（改 1 行 `view` 默认）+ 新 `h5/src/ui/mapHeader.js`（对话胶囊或搜索浮层，防止进地图后找不到 B 形态）+ `h5/src/styles/app.css`（地图全屏 + 浮层样式）。
- **验收条件**：
  1. 进入首页 `/` 直接渲染地图页（HTTP 200 路径验证）。
  2. 地图上叠加一个可折叠的「对话胶囊」入口，触发后切回 B 形态对话流。
  3. 590 + 99 商户标记点（坐标非空）正确显示；坐标 null 的店（99 家全部）不显示标记但保留在列表。
  4. 所有跳转/切换走已有 `goHome/goMap/goDetail` 路由，零重复。
- 状态：`[ ]`（待 Robin 拍板 ↦ DATA-EXPANSION-PLAN §3）

## G7 地图页 UI/交互优化（聚类 + 街道维度）
- **设计依据**：DATA-EXPANSION-PLAN §3.2 第二期（也可只做第一期就来）。
- **现状**：map.js 是基本等距投影; 拥挤区域(光谷/江汉路)点重叠严重; 无街道色块; 无聚类。
- **目标文件**：`h5/src/ui/map.js` + `h5/src/styles/app.css` + `h5/src/core/cluster.js`（新工具，纯函数）。
- **验收条件**：
  1. 同一像素半径内 ≥3 个点 → 合并为数字徽章，点击展开该簇列表。
  2. 顶部 zone 过滤 pill：武汉全城 / 财大南湖周边（与两类分区模型一致）。
  3. 标记点 hover → 气泡显示店名 + 招牌菜前 8 字 + 跳转详情。
  4. 不引入高德 Key(可选第二阶段); 当前阶段继续走 M9 离线等距投影。
- 状态：`[ ]`

## F4 数据扩到 1000+（三方案见 DATA-EXPANSION-PLAN §2.2）
- **99 家店已入库**：`h5/src/data/robin-99.mjs` (r0001–r0099)，坐标 null 待补。
- **311 条新增可选路径**：A. 不联网填空（推荐） / B. DeepSeek 摘要+审计 / C. 实地采集。
- **目标文件**：`h5/src/data/merchants.js`（或衍生 `extended.mjs`）+ `scripts/normalize-data.mjs`（验证反射）+ 邻接去重脚本（`scripts/merge-robin-590.mjs`）。
- **验收条件**：
  1. 总量 ≥ 1000 条 + 99 与 590 去重后实际数 dry-run；
  2. 描述字段（reason/lng/lat/avgPrice）一律为 null 而非空字符串占位，UI 显式标"待补"；
  3. coordinate 100% 标注 GCJ-02（合规于高德坐标系）；
  4. 跑 `node hypha/compile-check.cjs` 仍产出 processHash=sha256:5305add2…（Hypha 域不变式不变）。
- 状态：`[ ]`（待 Robin 拍板 A/B/C 路径）
