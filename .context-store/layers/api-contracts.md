# 接口 / 数据契约 (API Contracts)

_记录对外 / 对内接口、关键数据结构、字段含义、版本约定。契约变更必须同步更新此处。_

## 约定
- 版本策略：数据源由 `MYWO_DATASOURCE` env 切换（sample 默认 / wuhan / …）；`merchants.js` 由 `normalize-data.mjs` 自动生成，禁止手改。
- 红线字段命名：禁 `phone`/`token`/`user_id` 关键词，已用 `tel` 替代；输出禁 PII/假坐标/伪造券/暴露密钥。

## 关键接口
### 后端 :8799（hypha/implementation/src/httpServer.js）
- `GET /health` —— 健康检查（返回 JSON，注意 GET 不带 intent 时 summary 为空，属正常）。
- `POST /run` —— 确定性推荐（默认路径，0 token，¥0）。
  - 入参：`{ "intent": "带朋友吃湖北菜，人均不过百", "limit"?: number, "zone"?: string, "maxPrice"?: number, "sort"?: string, "board"?: string }`
  - 出参：`{ success, output: { merchants: [...], summary: { total_matched, ranked_by, nearest, coupon_hint, degradation, decision: { primaryId, reason, alternatives } } }, trace: { steps: [{ kind, title, detail, factors? }] } }`
- `POST /agent` —— LLM 路径（需 `DEEPSEEK_API_KEY`；`LLM_ENABLED=!!process.env.DEEPSEEK_API_KEY`）。结构与 `/run` 类似，但决策由 DeepSeek ReAct 生成。

### 前端入口
- vite 开发 :5173；意图栏在 `h5/src/ui/home.js`，调后端 `/run`（默认）或 `/agent`。

## 关键数据结构

### 商户输出契约（runtime.projectMerchant 投射，:8799 /run 直接返回原始商户对象含富字段）
字段（缺省显式 null，不编造）：
`id, name, zone, category, cuisine, mealTime[], avgPrice(string), avgPriceNum(number), rating, signatureDishes, recommendDishes[], taste, tasteTags[], environment, environmentRating, serviceRating, ratingNum, hours, tel, occasions[], tags[], waitTime, reviewSummary, imageEmoji, address, lng, lat, distanceKm, has_coupon, coupon_summary, source, dataConfidence('verified'|'estimated'|'partial'), needsEnrichment(bool), enrichedAt, editorReason`

### 逐店推荐理由（explain.js 产出，挂在每位候选上）
- `reason`：一句话自然语言理由（如"这家湖北菜人均 ¥88 在你预算内，口味地道、口碑 4.6，离你最近"）。
- `factors[]`：可解释因子数组，每项 `{ label, detail, weight? }`。label 取值：品类对味 / 口味合拍 / 预算内 / 高分口碑 / 离你近 / 真实核验 / 招牌硬菜 / 可领券 / 场景合适 / 资料待核验。
- `scoreBreakdown`：权重拆解（确定性，无 LLM）。

### 推理时间线（orchestrator.buildTrace）
- `steps[]`：`{ kind: 'intake'|'filter'|'geo'|'rank'|'decide'|'why', title, detail, factors? }`。
- 新增 `why` 步骤：title="为什么推荐这家"，`factors` = 主推店 explain.factors，向用户完整呈现推导。

### 数据源契约（datasource/）
- `FoodDataSource` 抽象基类 + 注册表；`sample`（默认，7 条合成）+ `wuhan`（opt-in，接 ALL_MERCHANTS）。切换：`setDefaultDataSource(createDataSource('wuhan'))` 或 env `MYWO_DATASOURCE=wuhan`。

## 红线校验（automated）
- 输出过滤所有 `user_id`/`token`/`phone` 关键词字段；不得伪造 `coord`/`coupon`；不得出现明文密钥。
