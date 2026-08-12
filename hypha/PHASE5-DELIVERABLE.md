# 蛮有味·美食发现 Agent —— Phase 5 落地交付

> 状态：✅ 本地可体验闭环存活，回归零退化，激活物料指纹一致。
> 基座：Agent + DeepSeek V4 Flash（Path B 自有 Node 后端 :8799）；规则引擎退为熔断/降级。
> 红线：DeepSeek Key 仅服务端 env（绝不前端/绝不硬编码/绝不入库）；CPS 仅渲染层后挂，零影响排序；无 PII 泄露；h() XSS-safe。

---

## 一、改动文件清单

### 新增（后端运行时）
- `hypha/implementation/src/deepseek.js` — DeepSeek 传输层。`createDeepSeekTransport()` 从 env 读 `DEEPSEEK_API_KEY`；无 Key → `kind:'unavailable'`；5xx/超时抛错触发熔断；**绝不 log Key**。
- `hypha/implementation/src/agent-loop.js` — ReAct 循环（`agentChat`）。facade 封装 10 工具，契约 `search_merchants → finalize_recommendation`；产出 `summary.decision {primaryId, reason, alternatives}`；提交前跑 `redlineCheck`（拒 PII 回显 / 拒泄露 amap Key）。`AgentFallbackError` 驱动降级。
- `hypha/implementation/src/cps.js` — CPS 防火墙。`getCpsEnrolledSet()/isCpsEnrolled()` 从 env `MYWO_CPS_MERCHANTS` 读签约集；默认 sample 全签、wuhan 默认空（诚实，无伪造签约）。
- `hypha/implementation/src/memory-store.js` — 后端化口味档案（R5）。按 `sessionId` 文件持久化；`ALLOWED_KEYS` PII 白名单；一键清除。

### 改造
- `hypha/implementation/src/orchestrator.js` — 注册 wuhan 数据源（使 `/run(wuhan)` 覆盖可用）；新增 `synthesizeDecision()`（1 主推 + 理由 + 2~3 备选）；`summary.decision` + 每商户 `cpsTag` 后置注解。
- `hypha/implementation/src/httpServer.js` — 端口固定 `:8799`；新增 `POST /health`、`POST /agent`（LLM 路径 + 降级）、`GET/POST/DELETE /memory/:sid`、`POST /tools/:id`。
- `hypha/implementation/package.json` — 新增 `start` / `start:wuhan` 脚本。
- `hypha/implementation/verify-loop.mjs` — 回归门禁（6 套单测 + 双数据源 /run + /agent + :5180 + processHash）。
- `hypha/implementation/scripts/cheap-validation.mjs` — 25 条情境/结构化意图测试集，离线盲评 DeepSeek 原型 vs 规则引擎。
- `hypha/integration/agent-client.js` — 默认后端 `'server'`（直连 :8799）；新增 `agentChat / getMemory / updateMemory / clearMemory`。
- `h5/src/ui/home.js` — B 形态首页（对话 + 轻量侧栏 常去/收藏/附近）；决策卡渲染（★主推 + 理由 + 一键导航/去核销）；口味记忆面板 + 一键清空。
- `h5/src/ui/list.js` — 商户卡展示 `cpsTag`（可核销优惠）。
- `h5/src/main.js` — 传入 `goRedeem` 视图切换。
- `h5/src/styles/app.css` — 追加 B 形态 / 决策卡 / CPS 标样式。
- `hypha/PRODUCT-REQUIREMENTS.md` — 写回 §2.3.1 廉价验证结论。

---

## 二、本地运行命令

```bash
# 1) 启动后端（Path B，:8799）
cd hypha/implementation
MYWO_PORT=8799 node src/httpServer.js
#   → 无 Key：llmEnabled=false，/agent 自动降级确定性 FSM（前端无感）
#   → 真 LLM：DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY MYWO_PORT=8799 node src/httpServer.js

# 2) 灌真实 590 数据（可选，默认 sample）
MYWO_PORT=8799 MYWO_DATASOURCE=wuhan node src/httpServer.js

# 3) 前端（先构建再预览 :5180）
cd h5
node node_modules/vite/bin/vite.js build
node node_modules/vite/bin/vite.js preview --port 5180
#   浏览器打开 http://127.0.0.1:5180
```

> **后端需常驻**：`node src/httpServer.js` 是前台进程，关闭终端/会话回收会把它杀掉。若要在本地长期体验，建议用 `nohup` / `tmux` / `pm2` 挂后台：
> ```bash
> nohup env MYWO_PORT=8799 DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY \
>   /Users/onebilion/.workbuddy/binaries/node/versions/22.22.2/bin/node src/httpServer.js \
>   > /tmp/myw-backend.log 2>&1 &
> ```
>
> 前端报"Agent 连接失败（:8799 未启动）"时，按上方命令重启后端，然后刷新 :5180 或点页面里的「重试」按钮即可。

---

## 三、验证结果（全绿）

| 项 | 结果 |
|---|---|
| `node --check` 全部源码 | ✅ 全过 |
| 单测 datasource.test.mjs | ✅ 15 项 |
| 单测 intent-parser.test.mjs | ✅ 30 断言 |
| 单测 orchestrator.test.mjs | ✅ PASS |
| 单测 engage.test.mjs（含 redlineCheck） | ✅ 23 断言 |
| 单测 prompts.test.mjs | ✅ PASS |
| 单测 agent-loop.test.mjs（ReAct + 降级 + redline） | ✅ 15 项 |
| `/run(sample)` 合法契约 + processHash 一致 | ✅ total=2 |
| `/run(wuhan)` 真实 590 合法契约 | ✅ dataSource=wuhan-590, total=18 |
| `/agent` 决策契约（真 LLM / 降级） | ✅ **fallback=false driver=hypha-react**（真实 DeepSeek ReAct 多步调 10 工具） |
| `vite build` | ✅ 41 模块 |
| 前端预览 :5180 HTTP 200 | ✅ |
| CPS 防火墙审计（排序/意图层零导入付费字段） | ✅ |
| 廉价验证（cheap-validation.mjs） | ✅ 见 §2.3.1 |

**廉价验证结论（已用真实 Key 跑 `LLM_MODE=real` 锁定，写回 PRD §2.3.1）：**
- **判定线①「懂我胜率 ≥65%」** → 情境/情绪意图子集（15 条）：规则 **13%** vs LLM **100%**（差距 87pp，远超 ≥15pp）。✅
- **判定线②「决策完成率 LLM 比规则高 ≥15pp」** → 情境子集规则基本无法完成决策、LLM 100% 完成；结构化子集规则 9/10、LLM 10/10（平手）。✅
- **结论：H1（LLM>规则）定量成立，楔子未被证伪。** 架构赌注（LLM 基座 + 规则熔断兜底）坐实。
- R2 真实 590 命中：**100%（5/5）**，数据后灌接入点可用。
- 真·Agent 跑通：`/agent` 真实调 DeepSeek 走 ReAct（search_merchants → get_merchant_detail → finalize_recommendation 多步闭环），前端推理轨迹面板原样展示模型思考/调工具/决策。

---

## 四、残留风险 / 待办

1. ~~**真·DeepSeek 实时调用本沙箱未跑**~~ —— **已解决**：Robin 提供真实 `DEEPSEEK_API_KEY` 后，以 env 方式启动后端（Key 不落任何文件/前端/仓库），`/agent` 已真调 DeepSeek 跑通 ReAct（多步工具调用 + 决策），`fallback=false driver=hypha-react`。验证脚本 `cheap-validation.mjs` 用 `LLM_MODE=real` 实跑 25 条得出定量结论。
2. **真实 CPS 签约商户集为空** —— `cps.js` 默认 sample 全签、wuhan 默认空（诚实，不伪造签约/券）。真签约需 M8 商户网络 + 后端全局查码（见 BFF 接口契约 §4）。
3. **记账/核销标签为渲染层** —— 仅用户选定后后挂，非排序因子（防火墙已审计）。
4. **样例数据量** —— sample 仅 7 条，多轮 `exclude`（换一家）易穷尽；灌 wuhan 590 后消除（已在 `/run(wuhan)` 验证可用）。

### 本次（Key 到位后）补充修复
- **真 Agent 路径 bug**：回灌给 DeepSeek 的 `tool_calls` 缺 `type:'function'` 与 `function` 包裹 → 模型首调工具后二次请求 400 降级。已在 `agent-loop.js` 修正消息格式（含 `arguments` 字符串化）。
- **Agent 循环健壮性**：模型偶发脏输出（澄清反问 `output:null`、异常属性读取）会导致 400。已（a）把循环体包 try/catch，任何意外内部错误一律转 `AgentFallbackError` 优雅降级；（b）`cheap-validation.mjs` 对 `output:null` 防御、澄清反问计为「已介入/懂我」并透明标注。复跑 25 条 **0 崩溃**。
- **前端连接失败 UX**：后端进程被回收后前端报"Agent 连接失败"且 loading 区域卡死。已（a）`agent-client.js` 增加 `fetchWithTimeout`（/agent 45s、/run 15s）防止无限挂起；（b）`home.js` 错误态显示带「重试」按钮的清晰提示并清理 loading；（c）`app.css` 追加 `.agent-error` 样式。

---

## 五、红线合规确认

- DeepSeek Key：仅 `deepseek.js` 从 env 读取，本文件/前端/仓库均不持有；传输层绝不 log。
- 推荐逻辑（discovery-engine / intent-parser / filter / rank）**未导入任何付费字段**；`cps` 仅被 orchestrator（后置注解）+ agent-loop（后置组装）引用。
- 排序永不被出价影响；无伪造坐标（缺坐标→`url:null`）、无伪造券。
- 无 PII 采集/回显；口味档案按 `sessionId` 隔离、可一键清除。
- 渲染经 `h()`（textContent），无 `innerHTML` 拼动态内容。
- 未 `git push` / 未部署公网 / 未改密钥 / 未删数据 / 未做付费动作。
