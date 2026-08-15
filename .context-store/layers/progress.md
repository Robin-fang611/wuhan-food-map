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

## 2026-08-15（SPEC v2.0 重构 + 三项拍板 + 循环开发启动）
- 完成【S1 文档重构】：SPEC v2.0 智能体产品标准（新增用户场景 / 智能体行为规范 / 指标章节）；README / CONTROL_TOWER / decisions / open-threads / handoff 同步；status-2026-08-15.md 快照。
- 决策：D-20260815-01 GitHub 推送授权（审阅后直接 push）；D-20260815-02 V4.4 数据统一授权 + 下一步顺序 S2→S6。
- 验证：25 测试文件全绿；ranking-audit PASS；reconcile 857/625（61 重名待治）；唯一既有缺陷 = scripts/build-robin-99.mjs 截断（产物已存在，不阻塞）。
- 下一步：S2 数据统一（重名治理 + 摄入 robin-99/web-stalls → 857）→ S3 账号持久化 → S4 收藏同步 → S5 上传治理 → S6 对话体验。

## 2026-08-15（S2 数据统一 V4.4 完成）
- 重名治理：normalize-data.mjs 新增 resolveDuplicateNames（纯函数 + 4 项单测）——58 组真重复合并留首条、3 组分店改名保留（重庆辣子鱼家常菜（恩施街29户25号）/ 阿德鱼湾（二七北路28附16）/ 湖滨客舍（黄鹂路78号…））；merchants.js 625 → 567，重名 0。
- 后端统一：runtime.js ALL_MERCHANTS = allMerchants（merchants + robin-99 + web-stalls）；wuhan 数据源 name → 'wuhan'；datasource.test.mjs 断言 860。
- 守卫：reconcile-datasource.mjs 重写为统一后守卫（前端 allMerchants vs 后端运行时 + 原始表质量），基线测试 860/860/567/0；新增 normalize-data.test.mjs。
- 验证：29 子测试全绿；ranking-audit PASS；reconcile unified=true（伪造坐标 0）；vite build 通过；已 commit + push。
- 下一步：S3 账号持久化（auth-server 内存 → gitignored 文件）→ S4 收藏同步 → S5 上传治理 → S6 对话体验。

## 2026-08-15（S3 账号持久化完成）
- auth-server：users/phoneIndex/unionIndex 落盘 data/auth-users.json（gitignored、原子写 tmp+rename、失败降级内存运行）；验证码/频控保持内存态（短时效安全语义）。
- 补齐后端账号单测（此前「13/13 进程内单测」从未入库）：hypha/implementation/test/auth.test.mjs 5 组（图形码一次性/短信频控/登录 JWT+脱敏/持久化文件/**子进程模拟重启：旧 JWT 仍有效 + 同号重登同账号**）。
- 验证：34 子测试全绿；node --check 通过；无运行态数据入库；已 commit + push。
- 下一步：S4 收藏跨设备同步（user.favorite 后端化）→ S5 上传治理 → S6 对话体验。

## 2026-08-15（S4 收藏跨设备同步完成）
- 后端 user.favorite：JWT 鉴权（服务端 verifyJwt 解析 sub，忽略客户端 userId 防越权；无/伪 token → 请先登录）；收藏持久化 data/favorites.json（gitignored、原子写）；新增 list action；httpServer /tools/:id 注入 Authorization Bearer。
- 前端 LocalAuthProvider：云端同步（仅真 JWT 触发；add/remove/list 以服务端为准回写本地；断网/未登录回落本地；UI 调用方零改动）。
- 测试：favorite-sync.test.mjs 5 组 + engage 收藏段 JWT 契约 + auth.test.mjs 跨设备用例（两独立进程同账号收藏互通）。
- 验证：40 子测试全绿；vite build 通过；ranking-audit PASS；已 commit + push。
- 下一步：S5 pending 上传治理 → S6 对话体验。

## 2026-08-15（S5 pending 上传治理完成）
- upload.js：listPendingUploads（治理视图脱敏）+ governUpload（promote/reject/dryRun/audit）+ 存储 {verified,pending,rejected,audit} 向后兼容 + UPLOAD_STORE_FILE 惰性读取。
- HTTP：GET /upload/pending + POST /upload/govern；CLI：scripts/govern-uploads.mjs。
- 测试：upload.test.mjs +15 治理断言；engage.test.mjs +5 HTTP 契约断言；40 测试文件全绿。
- 已 commit + push。下一步：S6 对话体验打磨（chat-first）。

## 2026-08-15（S6 对话体验完成 —— S2–S6 全部交付）
- 首页确定性入口条（常去/收藏/附近）；推理页多轮追问快捷条（换一家/再便宜点/换个附近/收藏这家）；纯逻辑模块 chatFollowups.js + 3 组单测。
- 验证：43 子测试全绿；vite build 51 模块；静态服务 200；已 commit + push。
- **S2–S6 循环目标完成**。后续：SPEC §11 后置项（多为 Robin 决策项）。


## 2026-08-15 夜间（W1–W8 上线路线图批量实施，54 测试全绿）
- W5 安全：写操作全 JWT / CORS 白名单 / 全局限流 / 治理鉴权 / 手机号 AES 加密。
- W1 双轨：FIT 语义 + taste 筛选 + 诚实回落 + shouldUpgrade 路由升级 + 智能体纪律 v2 + 前端统一推演。
- W2 界面：4Tab 重构 + 福利页 + 首页聚焦。W3.1 坐标：geocode 南湖 58→138。
- W4 注册：协议/昵称/注销/会话吊销。W7 部署准备：成本日志/错误脱敏/脚本。W8：隐私页/引导/code-split。
- 提交：3226d8a / 18d57a8 / 7a21c04 / 85b9f6c / 9b3147c / 9fcb93d / bf60d12。
- 待 Robin：R1–R6 外部依赖 + 生产 env 补项。
