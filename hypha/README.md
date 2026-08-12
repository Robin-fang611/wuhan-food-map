# 蛮有味·美食发现 Agent — Hypha 重构说明

> 本目录把 wuhan-food-map（纯前端 H5）现有的「场景/口味发现 → 榜单 → 详情 →
> 高德导航 → 收藏/签到得券 → 埋点」闭环，重写成 **Hypha（CodeSoul-co/Hypha）严格
> 智能体框架** 的原生表达。目标：让这个系统从「一组前端模块 + 纯函数」变成
> 「框架自有运行时托管的真·智能体」——带 ReAct 循环、显式状态机（FSM）、受治理的
> 工具/技能/记忆副作用、确定性 processHash、回放、审计与恢复。
>
> 本项目是「美食发现/推荐 Agent」方向（用户 2026-08-09 选定），与货代项目的
> 「线索采集 Agent」是同一套 Hypha 方法论的两个落地实例。

## 为什么这样重构

| 维度 | 之前（纯前端 H5） | 现在（Hypha DomainPack） |
|------|-------------------|--------------------------|
| 运行时 | 浏览器内 JS 模块 + 纯函数，无 Agent 运行时 | 框架自有 Harness：ReAct + FSM + 有界 Quantum + 恢复 |
| 状态 | 前端视图路由（main.js 6 视图），无跨会话持久/恢复 | 框架内置持久 Session、Checkpoint、Recovery Worker |
| 工具 | 散落在 `core/` `ui/` 的函数与 UI | `ToolSpec` 契约 + 受治理 Adapter 绑定 + 权限 scope + 幂等 |
| 治理 | 架构规范 §8 口头约定 | 降级为 `policy.readonly` / `policy.user-data-write` / `policy.redlines-food` 治理策略（被禁 scope 永远 deny）+ 审计 |
| 可验证 | 10 测试套件但无确定性系统指纹 | `compileDomainPackToHarnessedSystem` 产出确定性 `processHash` + 依赖快照，可回放/回归 |

## 映射：前端闭环 → Hypha 构造

原前端（`main.js`：`home/detail/map/account/wallet/redeem` + `core/query.js`
/`core/ranking.js` / `plays/checkin.js` / `core/analytics.js`）在 Hypha 里表达为：

- **taskSchema** `task.food-discovery` — 一次「美食发现」请求（自然语言 intent
  或结构化 zone/mealTime/category/maxPrice/sort/limit）。
- **workflow** `workflow.food-discovery` 的 Domain 状态（作为 Harness FSM 的证据记录）：
  - `Intake`（意图归一化）→ `Discover`（filter+rank+geo ReAct 循环）→
    `Detail`（单店详情+导航+收藏）→ `Engage`（收藏/签到/领券）→ `Track`（埋点）→ `Completed` / `Failed`。
- **tools（10 个 ToolSpec 契约）**：`discover.filter` / `discover.rank` /
  `discover.detail` / `discover.geo` / `discover.navigate` / `user.favorite` /
  `reward.checkin` / `reward.view-wallet` / `reward.claim` / `analytics.track`。
- **skills（4 个）**：`skill.intent-parser` / `skill.discovery-engine` /
  `skill.detail-explainer` / `skill.reward-advisor`。
- **policies（3 条）**：`policy.readonly`（允许 read 级副作用）、
  `policy.user-data-write`（收藏/签到/领券须绑定本人、幂等）、
  `policy.redlines-food`（4 条红线 scope 永拒）。
- **memoryProfile** `memory.local`（Hypha native；本地收藏/券包走 AuthProvider 本地原型）。
- **outputContract** `output.food-recommendation` — 推荐商户集（含距离/券提示）+ 决策摘要。
- **evaluationProfiles** — `eval.output-contract` / `eval.redline-check`。

## 红线（项目 §8 安全红线，由 policy.redlines-food 强制）

任何工具**不得**请求以下 scope，否则编译/运行期被治理策略拒绝：
- `data.export-pii` — 不导出他人隐私/PII
- `nav.fake-coords` — 不伪造导航坐标
- `coupon.forge` — 不伪造/篡改优惠券
- `key.expose` — 不暴露高德 Key/微信 AppSecret/JWT

## 文件

- `manyouwei-food-discovery.domain.yaml` — DomainPack（产品契约 / 可执行规格，单一事实来源）。
- `compile-check.cjs` — 加载+校验+编译自检脚本。

## 运行前自检

```bash
cd hypha
NODE_PATH=/Users/onebilion/opt/hypha/node_modules \
  /Users/onebilion/.workbuddy/binaries/node/versions/22.22.2/bin/node compile-check.cjs
```

预期：校验通过、输出 `processHash`（sha256 确定性）、FSM 已生成、10 工具 / 4 技能 /
3 策略绑定。

## 接入本机 Hypha Server（下一步，尚未做）

1. 启动依赖：`bash ~/opt/start-all.sh`（Docker MongoDB+Redis、Hypha Server）。
2. 把本 DomainPack 注册进运行中的 Server：复制到 `~/opt/hypha/configs/domain-packs/`
   或由产品应用组合层 `LocalDomainPackLoader` 加载后 `compileDomainPackToHarnessedSystem` + 显式激活。
3. 在 `configs/tools.yaml` / `config.yaml` 用受治理 Adapter 把 10 个 ToolSpec 绑定到真实实现
   （filter/rank/geo 绑定 `core/query.js`+`core/ranking.js`；detail/navigate 绑定 `ui/detail.js`+`ui/map.js`；
   favorite/checkin/claim 绑定 `auth.js`+`plays/*`；track 绑定 `core/analytics.js`）。
4. 在 `apps/server/src/prompts` 注册 4 个 `prompt.food.*` 模板。
5. 仅在本地验证闭环，不对外发布（与项目红线一致）。

## 设计基线（2026-08-09 Robin 拍板）

方向=美食发现/推荐 Agent；数据资产沿用现有 590 商户 + 32 玩乐点；
账号/券包/核销仍为前端原型（不伪造后端、不碰密钥）；高德 Key 走 env/后端代理、绝不下发明文。
