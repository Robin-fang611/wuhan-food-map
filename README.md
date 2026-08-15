# 蛮有味（Manyouwei）· 武汉美食发现 Agent

> 「今天吃啥？问蛮有味。」—— 你说一句偏好（心情 / 预算 / 和谁吃 / 片区），它用真探过的店给你**一个主推 + 2~3 备选，每家都带为什么**。
> 校园先行（财大南湖）· 本地生活（小吃街 / 流动摊贩，高德上没有的 206 家）。

## 产品要点

- **双轨智能体**：确定性引擎（关键词/口味/健康语义匹配，毫秒级、可审计）为主；搞不定的（模糊表达/数据缺口）自动升级 DeepSeek 深度分析，**前端统一呈现五阶段推演，用户无感**。
- **实事求是**：没有合适的店铺就直说没有，绝不硬凑；「健身餐」等无数据覆盖的语义会给最接近的真实选项并标注差异。
- **信任内核**：推荐排序永不被商户付费/分润影响（可审计，ranking-audit 每轮 PASS）；CPS 展示标仅在结果后挂。
- **本地生活资产**：860 家商户（含 206 家流动摊贩）、财大南湖 185 家、geocode 真实坐标补全 246 家。

## 架构

- **前端 h5/**：Vite 原生 JS 零运行时依赖，h() 防 XSS，底部 4 Tab（今天吃啥/附近/我的/福利），视图按需动态加载（主包 gzip 6KB）。
- **后端 hypha/implementation/**：自有 Node :8799 —— /run（确定性 FSM 双轨升级）、/agent（DeepSeek ReAct）、/tools（10 领域工具）、/auth（图形码+短信+JWT+微信，协议/注销/吊销）、/upload（探店采集三分支+治理）。
- **数据**：merchants.js（567，自动生成）+ robin-99/web-stalls（293，含 geocode 坐标补全）= allMerchants 860。
- **视觉桥接**：scripts/vision-desc.mjs —— 智谱 GLM-4V-Flash 免费视觉模型（开发 AI 看图 / 产品多模态预留）。

## 本地启动

```bash
bash start-dev.sh   # 前端 :5180 + 后端 :8799（.env 配 DEEPSEEK_API_KEY 即启用 LLM 双轨）
```

## 文档

- **唯一事实来源**：docs/SPEC.md（v2.0，含 §15 问题反馈清单）
- 上线路线图：docs/design/go-live-roadmap.md · 双轨方案：docs/design/dual-track-agent-plan.md · 界面重构：docs/design/product-restructure-design.md · 视觉适配：docs/design/vision-adapter-design.md · 验收自查：docs/design/launch-audit-local.md
- 状态快照：docs/status-2026-08-15.md · 文档索引：docs/README.md
