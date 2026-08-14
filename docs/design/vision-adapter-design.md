# 多模态视觉适配设计（智谱 GLM-4V-Flash 免费模型）

> **背景（Robin 2026-08-15）**：DeepSeek 无多模态（视觉）能力。智谱免费视觉模型 GLM-4V-Flash 用于弥补：
> ① **DSH 侧**：给 DSH 里的 DeepSeek（本项目开发 AI）加"看图"能力——评估 UI 截图、设计稿 mockup、上传图片等；
> ② **产品侧**：蛮有味的本地生活场景（拍照识店 / 摊贩照片识别 / 菜品识别）。
> 智谱 API Key（限免费模型）已由 Robin 提供，**仅存 .env（gitignored），绝不入库/前端/文档**。
> 关联：docs/SPEC.md §15 Q4。

---

## 1. 智谱免费模型事实（2026-08 确认）

| 模型 | 能力 | 免费额度 | API 形态 |
|------|------|----------|----------|
| **glm-4v-flash** | 视觉（图片理解/OCR/识别），文本输出 | 免费（智谱开放平台首个免费多模态 API） | OpenAI 兼容：POST https://open.bigmodel.cn/api/paas/v4/chat/completions，messages 含 image_url（base64 或 URL） |
| glm-4-flash | 文本（function calling） | 免费，30 并发 | OpenAI 兼容（同端点） |

- 本设计只用免费档（glm-4v-flash / glm-4-flash），**不产生任何费用**。
- Key 形态：`<id>.<secret>`（智谱 API Key），经 `Authorization: Bearer <key>` 传递。

---

## 2. 方案对比（Robin 提供背景：vision-bridge-hook 生态）

**现成生态调研（2026-08-15 web 检索）**：
- `mcp-vision-bridge`（KuaaMU）：MCP server，给文本模型编码代理加视觉（支持 Claude Code / Codex / Kimi / opencode），对接任意 OpenAI 兼容多模态模型。
- `codex-vision-bridge`（tkr520521）：Codex 插件，粘贴图片代理 + view_image hooks，支持 DeepSeek/GLM/MiMo 看图片。
- `glm-vision-mcp`、`deepseek-vision-gateway`、`DeepSeek_vision_mcp`：同类（编码代理 MCP/网关）。
- **`vision-bridge-hook`（Robin-fang611，Robin 自研）**：Python，UserPromptSubmit hooks 自动触发视觉桥接（Claude Code + Codex，macOS + Windows），README 定位 "Give DeepSeek eyes"。

**结论**：现成生态全部面向「Claude Code / Codex 编码代理」的 hook/MCP 机制；**DSH（DeepSeek Harness）的插件机制不同**（client-plugin + 自有工具系统），无法直接安装上述插件。可复用的是**思路**（拦截图片请求 → 转发智谱视觉模型 → 回传文字描述），需要按 DSH 的机制适配。

---

## 3. 方案设计

### 3.1 产品侧（蛮有味，可立即实施）

**能力**：拍照/图片识别——上传店铺照片、摊贩照片、菜品照片 → GLM-4V-Flash 识别 → 结构化信息（店名/菜品/摊位特征/文字 OCR）→ 进入探店采集（/upload）或识别反馈。

**落地路径**：
1. 后端新增 `hypha/implementation/src/vision.js`：`describeImage({ imageBase64 或 url, prompt }) → { ok, text }`（调智谱 /chat/completions，model=glm-4v-flash，Key 仅服务端 env：`ZHIPU_API_KEY`，超时护栏 20s，失败返回 ok:false 不阻断流程）。
2. httpServer 新增 `POST /vision/describe`（JWT 可选；严格限流；输出仅文字描述，图片不落盘或落 gitignored 临时目录）。
3. 前端：上传店铺流程（uploadShop）增加「拍照上传」→ 图片转 base64 → /vision/describe → 预填名称/描述 → 用户确认后走 /upload 三分支。**flow：视觉预填是辅助，最终入库仍以高德校验 + 人工确认为准（实事求是）。**
4. 依赖：ZHIPU_API_KEY 入 .env（gitignored）；.env.example 加占位。

### 3.2 DSH 侧（给开发 AI 看图，需 Robin 授权改 DSH 设施）

**目标**：让 DSH 内的 DeepSeek 能"看图"（读截图/设计稿/图片文件）。

**方案 A（推荐，零改 DSH 核心）——工具函数桥接**：
- 在蛮有味项目加 `scripts/vision-desc.mjs`（或 DSH client-plugin 的工具）：输入图片路径 → base64 → 调智谱 glm-4v-flash → 输出结构化文字描述（图片内容/UI 布局/文字 OCR/问题点）。
- 开发 AI 需要看图时调用该工具（等同"人眼"），**DSH 模型本身无需多模态**。
- 优点：不改 DSH、立即可用、Key 只存 .env；缺点：描述是文字快照，非实时多轮看图（足够用于 UI 评估/设计稿检查）。

**方案 B——DSH client-plugin 拦截 read_image**：
- DSH 的 read_image 工具在模型不支持图像时，由插件层改调智谱视觉模型，把描述文本注入模型上下文。
- 需读 DSH 源码（`~/.npm/_npx/.../node_modules/@deepseek-ai/*`）确认 client-plugin API 与 read_image 实现；**沙箱外写权限受限，需 Robin 授权改 DSH 安装**（参照 vision-bridge-hook 的 hook 思路移植）。

**方案 C——参考 vision-bridge-hook 移植**：
- 若 DSH 提供与 UserPromptSubmit 类似的 hook 点（用户消息提交钩子），可移植 vision-bridge-hook 的自动触发逻辑。需 DSH 源码确认。

**推荐**：先落**方案 A**（今天就能用），方案 B/C 待 Robin 决定是否投入（改 DSH 共享设施）。

---

## 4. 配置清单（安全红线）

- `ZHIPU_API_KEY`：仅存 `.env`（已 gitignore）；`.env.example` 只加占位空值；绝不进前端包/仓库/文档/日志。
- 免费模型白名单：仅 `glm-4v-flash`（视觉）与 `glm-4-flash`（文本兜底），代码中 model 名硬编码白名单，防误用付费模型。
- 图片数据：产品侧图片不落盘（内存 base64 → 请求 → 丢弃）；日志不输出图片内容。
- 服务端限流：/vision/describe 频控（如每用户 10 次/小时），防滥用烧免费额度。

---

## 5. 验收建议

1. 产品侧：curl /vision/describe（一张测试图）→ 返回文字描述；上传流程可拍照预填；限流生效；全量测试绿。
2. DSH 侧（方案 A）：scripts/vision-desc.mjs 可描述项目内截图（.workbuddy/screenshots/*.png、docs/design/*-mockup.html 渲染图），用于 UI 评估。
3. 红线扫描：仓库无 ZHIPU_API_KEY 明文。

---

*本文件为多模态视觉适配草案，待 Robin 确认后实施（产品侧 P3；DSH 侧方案 A 可先行）。*
