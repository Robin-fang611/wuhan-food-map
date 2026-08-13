# 探店采集 · 人工核验流程（V2.4）

> 目标：把 `needsEnrichment` 商户（estimated，算法推导）升级为 `verified`（实地核验）。
> 工具：`scripts/collect-visit.mjs`。红线：绝不编造；采集须真实；坐标沿用系统已有值，不伪造。

## 流程

1. **生成模板**（半自动，预填商户身份，你只填观测）
   ```bash
   node scripts/collect-visit.mjs template --batch 20 --out assets/foodmap-data/collect-template-YYYYMMDD.json
   # 可选 --zone 财大南湖周边 | 武汉全城  限定片区
   ```
   产出 JSON：`records[]` 已带 `id` / `matchName` / `zone` / `category`，观测字段留空。

2. **实地探店，填写观测**
   对每个你去过的店，填 `taste` / `avgPrice` / `environment` / `signatureDishes` 等；`tel` 可留空。
   **关键**：确认信息真实后，把该条 `attest` 改为 `"yes"`。

3. **核验（先 dry-run 看结果，不写文件）**
   ```bash
   node scripts/collect-visit.mjs validate --in collect-template-YYYYMMDD.json --dry-run
   ```
   - `attest` 非 `yes` → 拒绝（未实地核验，不静默降级）。
   - 有 `attest` 但无任何观测字段 → 拒绝（防空壳）。
   - 接受条数 = 将升级为 verified 的条数。

4. **正式写入 enrichment（仅 accepted 条目）**
   ```bash
   node scripts/collect-visit.mjs validate --in collect-template-YYYYMMDD.json --batch 20260813-nanhushop
   ```
   产出 `assets/foodmap-data/enrichment-collect-<batch>.json`（已剔除 phone/token/user_id，不导出坐标）。

5. **应用到数据（改写 merchants.js，建议先 git 确认）**
   ```bash
   node scripts/build-enrichment-map.mjs && node scripts/normalize-data.mjs
   ```
   对应商户 `dataConfidence→verified`、`needsEnrichment→false`。

## 反伪造保障
- 没有 `attest:"yes"` 的记录**永不**升级，也不会被偷偷标成 estimated 混入。
- 工具不接收 `lng`/`lat`，坐标只能用系统已有值，杜绝假坐标。
- 字段名用 `tel`（非 `phone`），不出现 `token`/`user_id`。

## 当前状态
- 工具 + 合并链路已验证（23 条断言全绿；dry-run 实跑接受/拒绝计数正确）。
- 真实批量升级（如首批 20 家）待 Robin 实地探店后执行第 2–5 步；此步骤会改写数据文件，属手动操作，不在自动化范围内。
