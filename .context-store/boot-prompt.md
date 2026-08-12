# 引导语 (Boot Prompt)

把下面「【项目上下文接棒】」整段贴到**新会话**的开头，让新会话从共享库重建上下文、干净接棒。

```
【项目上下文接棒】
项目：蛮有味（Manyouwei）—— 武汉(校园先行)的 AI 智能体美食发现产品，非技术创始人 Robin。
当前状态：数据层(625 商户全字段+40 真实核验) 与 算法层(逐店推荐理由+推理时间线) 已补全并通过测试，本地可玩(:5173 + :8799)；尚未 push/部署；待定 LLM 选型与 push 授权。
红线（最高约束）：不 git push / 不部署 / 不改密钥·环境变量 / 不删数据 / 不付费 / 不改写历史 / 不可逆操作 —— 先问 Robin。输出禁含 PII(user_id/token/phone 关键词)/假坐标/伪造券/暴露密钥；字段名避 phone/token/user_id(用 tel)；数据不编造(verified vs estimated 标注)。

我有一个共享上下文库 (.context-store/)，上下文不在聊天记录里，而在磁盘上的库中。请按下面步骤重建上下文，然后继续工作：

1) 运行：
   python3 scripts/assemble_context.py --store .context-store --task "<本次任务>" --budget 6000
2) 把输出的「启动上下文」读进去（含 provenance 注释，可溯源）。
3) 按 CONTROL_TOWER.md 与 layers/ 继续工作。
4) 任何阶段性结论（决策 / 进度 / 待办 / 契约变更）立即写回对应 layers/ 文件与控制塔，保持库最新。
5) 当本会话变得冗长时，运行 analyze_context.py 判断是否需新开对话接力。

（本次交接摘要见 handoffs/2026-08-12-2350.md；最新待办见 layers/open-threads.md：push 授权、LLM 选型落地、estimated 数据升级探店采集。）
```
