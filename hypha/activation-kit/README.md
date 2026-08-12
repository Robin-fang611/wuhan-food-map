# 蛮有味 Agent · 服务端激活工具包（待用户授权）

> 本目录是「蛮有味·美食地图」接真·本机 Hypha Server(3000) 运行时的**精确、可复用的激活物料**。
> 由每小时自动化构建子代理生成，**仅落在项目工作区，绝不自行改动 `~/opt/hypha` 共享设施**。
> 全部内容已在本地离线验证（编译 + 端点校验），只差「授权」与「LLM」两步即可落地。

---

## 0. 当前已交付（用户可体验闭环，已完成）

| 步骤 | 状态 | 说明 |
|---|---|---|
| 1 L1 工具服务骨架 | ✅ | `:8799` 暴露 10 工具 + `/health` + `/run` |
| 2 10 工具适配器 | ✅ | 纯函数绑 `core/plays/data`，对齐 output 契约 |
| 5 4 个 prompt.food.* | ✅ | 本地确定性编排已消费（guidance + provenance） |
| 6 Engage 状态 | ✅ | favorite/checkin/claim/viewWallet 经 Agent 治理 |
| 7 L3 客户端集成 | ✅ | 首页意图栏 + `h()` 安全渲染，预览 200 |
| 8 红线回归 + Track + 降级 | ✅ | 4 红线双层守门，summary 含 total_matched + degradation |
| 10 意图解析增强 | ✅ | 中文数字价/口语同义词/柔性价，30 断言 |

**本地闭环已验证可用**：浏览器输入「南湖附近便宜的宵夜」→ 本地 Agent 运行时按 DomainPack FSM →
返回 `output.food-recommendation`（`total_matched:1 / ranked_by:price / 含 guidance+provenance`），前端 `h()` 渲染。
验证命令见末尾。

---

## 1. 剩余步骤为何 BLOCKED（根因，已对真实框架源码核实）

| 步骤 | 阻塞根因（真实源码核实） | 解除所需 |
|---|---|---|
| 3 激活进 3000 | 工具需经运行时工具注册表（`ToolManager.profileToolRegistry`）加载；Server `config/index.ts` 启动只自动读 `agents/tools/workflows/memory` 配置，**不**自动加载 `domain-packs/`；inline `domainPack` 提供契约+FAI 但工具解析走注册表 | 确认 http 工具注册路径 + 授权改配置/或 inline 接入 |
| 4 真·3000 ReAct | ReAct 执行需可用 LLM 后端；`agents.yaml` 的 `default` 用 `provider: anthropic` 但本机无密钥/端点，`local.enabled=false` | 提供 LLM 后端（HYPHA 推理密钥 / 本地 ollama） |
| 9 PATH-A 固化 | 等价于把 DomainPack 落到 Server 配置并重启；同样受 §1 注册机制 + 共享设施改动授权约束 | 用户授权改 `~/opt/hypha` + 重启 |

**结论**：3/9 是「配置 + 重启 + 注册机制确认」问题；4 额外是「LLM 后端」问题。三者都**不归自动化子代理擅自处理**（红线：不改共享设施/不碰密钥）。

---

## 2. 本工具包内容

```
activation-kit/
├── README.md                                 # 本文件
├── make-server-domain.mjs                    # 由项目 domain.yaml 生成「服务端就绪」版（注入 :8799 http 端点）
├── verify-server-domain.mjs                  # 离线编译校验（@hypha/domain）+ 10 端点校验
└── manyouwei-food-discovery.domain.server.yaml  # 生成产物：10 工具全 source:http + endpoint:127.0.0.1:8799/tools/<id>
```

生成产物关键事实（已验证）：
- `processHash = sha256:afbfbab26f95d13fa354808258bde08662bbdfb8e00650280d14cdfbb57cbfb5`
  —— 与现有本地契约**完全一致**（endpoint 是运行时绑定，不进 deterministic 指纹）。
- 10 个工具全部 `source:http` 且带 `endpoint: http://127.0.0.1:8799/tools/<id>`，
  与 `hypha/implementation/src/httpServer.js` 的 `POST /tools/:id` 完全对齐。

> 设计依据：`configs/domain-packs/minimal.domain.yaml` 中默认的 `common.search` 工具正是
> `source: http` + `endpoint` 模式——这是框架内经验证的 http 工具绑定写法，本工具包沿用同一范式。

---

## 3. 激活步骤（需用户授权后由人工或在授权下执行）

### 3.1 「不碰共享配置」的最小验证路径（推荐先走，确认工具注册机制）
1. 确保本机工具服务常驻：`cd hypha/implementation && node src/httpServer.js`（监听 :8799，已 CORS 放开）。
2. 向 3000 发 `start-run`，**inline** 本工具包的 `domain.server.yaml` 作为 `domainPack` 字段
   （`runtime.routes.ts:62` 支持 `domainPack` 可选字段；`ServerProductionSessionCommands.ts:301` 会 `validateDomainPackSpec`）。
3. **关键确认**：调用 Server 的 tools 列举端点，核实 10 个 `source:http` 工具是否出现在运行期工具表。
   - 若出现 → http 工具经 inline domainPack 即可被 ReAct 调用，转 3.3。
   - 若未出现 → 走 3.2 注册表路径。
4. 此路径**不修改 `~/opt/hypha` 任何文件**，仅发请求；但 ReAct 仍会因无 LLM 在推理阶段失败（见 3.3）。

### 3.2 「固化」路径（改共享配置 + 重启，需明确授权）
1. 把 `manyouwei-food-discovery.domain.server.yaml` 复制到 `~/opt/hypha/configs/domain-packs/`。
2. 若 Server 不会自动加载该目录，则按其 `config/index.ts` 的加载方式并入（agents/tools 配置或启动参数）。
3. 重启 Hypha Server（`~/opt/start-all.sh` 或 `npm run dev`），确认 3000 healthy。
4. ⚠️ 重启会中断**同一台机**上其他使用 Hypha Server 的进程（如货代项目），需先确认无人在用。

### 3.3 提供 LLM 后端（步骤 4 必需）
- 方案 A（云）：在 Server 环境注入可用推理供应商密钥（`HYPHA_INFERENCE_*` / `config.yaml` 的 `runtimeProvider`），或在 `agents.yaml` 给 food agent 配 `provider+model+key`。
- 方案 B（本地）：开 `local.enabled=true` + 起 ollama/sglang 并 `autoStart=true`。
- 之后用 `start-run`（202 异步 + 轮询）跑 `food-discovery`，方可拿到 `output.food-recommendation`。
- 前端 `hypha/integration/agent-client.js` 已留 `setBackend('server')` 切换点，激活后零改动切到 3000。

---

## 4. 验证命令（子代理已跑通，供复验）

```bash
# 本地闭环（已 done，随时可复核）
curl -fsS -X POST http://127.0.0.1:8799/health
curl -fsS -X POST http://127.0.0.1:8799/run -H 'Content-Type: application/json' \
  -d '{"intent":"南湖附近便宜的宵夜"}'   # → output.output.merchants[0], total_matched:1

# 服务端就绪包离线校验（本工具包）
HYPHA_DOMAIN_PKG=/Users/onebilion/opt/hypha/node_modules/@hypha/domain/dist/index.js \
  /Users/onebilion/.workbuddy/binaries/node/versions/22.22.2/bin/node verify-server-domain.mjs
# → processHash sha256:afbfbab2…；10/10 个 :8799 端点 OK
```

---

## 5. 需要你（Robin）拍板的两件事
1. **是否授权**我（或在你监督下）改 `~/opt/hypha` 共享配置 + 重启 Server，以完成步骤 3/9 的 PATH-A 固化？
2. **是否提供**可用 LLM 后端（云密钥或本地 ollama），以解除步骤 4 的 ReAct 推理阻塞？

授权后，本工具包可使「真·3000 运行时驱动的美食 Agent」成为一次性机械操作；在此之前，本地闭环已可完整体验，自动化不再空转重试。
