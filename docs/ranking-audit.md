# 蛮有味 · 反广告排序审计（Ranking Audit — Zero Sponsored Weight）

> 自动生成：`node scripts/ranking-audit.mjs` · 生成时间：2026-08-15 00:19:37（北京时间）
> 结论：**PASS —— 推荐/排序零商业加权**

## 1. 审计范围
纳入「排序 / 筛选 / 推荐」全部源码路径（不含 UI、不含 CPS 渲染标模块、不含 LLM 提示词）：

- `h5/src/core/query.js`
- `h5/src/core/ranking.js`
- `hypha/implementation/src/tools/rank.js`
- `hypha/implementation/src/tools/filter.js`
- `hypha/implementation/src/discovery-engine.js`

## 2. 排序因子全景（每条均为信任/意图信号，无商业权重）
| 函数 / 入口 | 位置 | 排序/筛选依据 | 信号类型 |
|---|---|---|---|
| `ratingRank(r)` | h5/src/core/query.js:13 | 必吃=3 / 推荐=2 / 数值>0=1 / 其他=0 | 信任信号（编辑评级） |
| `sortMerchants(list,{sort})` | h5/src/core/query.js:86 | rating 降序→人均升序；或 price 升序；或 distance 升序 | 信任信号 |
| `filterMerchants(...)` | h5/src/core/query.js:61 | zone / categories / mealTime / maxPrice / keyword | 用户意图筛选（非商业） |
| `rankMustEat` | h5/src/core/ranking.js:8 | rating=必吃 ∧（评分降序→人均升序→店名字典序） | 信任信号 |
| `rankValue` | h5/src/core/ranking.js:19 | （评分权重 ÷ 人均）降序→人均升序 | 信任信号 |
| `rankLateNight` | h5/src/core/ranking.js:33 | mealTime⊇夜宵 ∧ 评分降序 | 场景信号 |
| `rankNew` | h5/src/core/ranking.js:44 | source=地推 ∧ id 倒序（越新越前） | 收录信号 |
| `discoverRank` | hypha/implementation/src/tools/rank.js:13 | 薄绑 core/ranking.js 四榜 | 信任信号 |
| `discovery-engine.sortBy` | hypha/implementation/src/discovery-engine.js:19 | price 升序 / rating 降序(→人均升序) | 信任信号 |
| `discovery-engine.geo` | hypha/implementation/src/discovery-engine.js:67 | 财大南湖周边按 distanceKm 升序（仅附注距离；非距离排序时 geo 仅附注） | 距离信号（仅校区） |
| `discovery-engine.exclude` | hypha/implementation/src/discovery-engine.js:82 | 多轮「换一家」剔除已展示 id，仅本轮候选集内 | 对话状态（非商业） |

## 3. 商业加权扫描结果
扫描以上文件是否出现赞助 / 商业 / 付费 / 竞价 / 广告权重类术语（含对象键形式，如 `sponsoredWeight:` / `paidRank:` / `commercialScore:`）：

- 命中数：**0**
  - ✅ 零命中 —— 任何排序/筛选/推荐路径均不含商业加权项。

## 4. 防火墙正向控制（不仅「没有坏词」，还要「明确隔离」）
| 状态 | 断言 | 位置 |
|---|---|---|
| ✅ | CPS 商户集合与排序物理隔离（cps.js 防火墙） | `hypha/implementation/src/cps.js` |
| ✅ | 核验只增信、不增权重特权（explain.js 反广告注释） | `hypha/implementation/src/explain.js` |
| ✅ | LLM 系统提示：排序只基于信任信号，绝不因付费/分润改变（agent-loop.js） | `hypha/implementation/src/agent-loop.js` |

## 5. CPS 与排序的物理隔离（关键）
`hypha/implementation/src/cps.js` 头部明确：CPS 商户签约集合**只决定卡片是否挂「可核销优惠」展示标**，
**绝不被** discovery-engine / intent-parser / filter / rank / orchestrator 导入；排序从不读取该集合；
不影响商户能否入选，也不影响排序位置。未签约商户照样可凭信任入选（只是没标）。

## 6. 如何复核
```bash
node scripts/ranking-audit.mjs
```
重跑将重新扫描上述文件并打印 `verdict=PASS/FAIL`；报告同步重写本文件。

## 7. 声明（产品信任内核）
**蛮有味的推荐排序不出卖（zero sponsored weight）。** 排序与入选仅由信任信号（编辑评级、人均、距离、
场景、收录来源）与用户意图（片区/分类/时段/预算/关键词）决定；营收（CPS 分润）与排序正交，
仅在推荐结果生成后以展示标形式呈现，且默认无真实签约商户（诚实留空，待 Robin 真实签约后填 env）。
