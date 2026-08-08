# 高德 Key 安全接入（§8 / M11）

> 目标：高德 Key 不入库、不进前端源码；v0.5 用「环境变量注入 + 域名白名单」止血，v1.5 用「后端代理」让 Key 永不下发浏览器。

## 0. 红线（绝不越界）

- 高德 Key / 微信 AppSecret / JWT 密钥：**不入库、不进前端源码**（§8 / §11）。
- 禁止 `git push`、禁止部署公网时携带明文密钥；`.env` 已被 `.gitignore` 忽略。

---

## 1. v0.5（当前已落地 · M11）

### 1.1 机制
- 明文 Key 已从 `assets/foodmap-data/config-page.js` 删除，改为运行时读取
  `globalThis.__MANYOUWEI_CONFIG__.amapJsKey`。
- 注入点：`h5/src/config.js` 读取构建期变量 `import.meta.env.VITE_AMAP_JS_API_KEY`，兜底为 `null`。
- 前端经 `src/ui/map.js` 的 `getAmapKey()` 读取该全局；未设置时返回 `null`，地图走轻量坐标占位（无 Key 泄露）。
- 模板与说明：`h5/.env.example`（占位，禁止提交真实值）、`h5/vite.config.js` 注入说明。

### 1.2 使用流程
```bash
cp h5/.env.example h5/.env
# 编辑 h5/.env：VITE_AMAP_JS_API_KEY=你的Key
npm run dev      # 或 npm run build && npm run preview
```

### 1.3 仍须人工加固（控制台侧，非代码可解）
- **域名白名单**：高德控制台 → 应用 → 设置「授权域名 / Referer 白名单」，仅放行你的部署域名。
- **安全密钥（securityJsCode）**：为 JS API 启用「安全密钥」，配合下方代理注入（纯前端无法安全持有 securityJsCode，必须走代理）。
- **泄露即重置**：真值一旦出现在任何非白名单环境，立刻在高德控制台重置。

> ⚠️ 纯静态 SPA 下，VITE_AMAP_JS_API_KEY 在 `npm run build` 后必然写进 bundle（高德 JS API 渲染地图的固有形态）。
> v0.5 的"安全"= 不入库、不硬编码、配白名单；**真正让 Key 不下发浏览器**靠 v1.5 后端代理。

---

## 2. v1.5（后端代理 · 真正安全）

### 2.1 为什么需要代理
高德两类 API：
| 类型 | 示例 | 能否纯前端安全持有 Key |
| --- | --- | --- |
| Web 服务 API（地理编码/路径规划/POI 搜索） | `restapi.amap.com/...` | ❌ 必须服务端转发 |
| JS API（地图渲染） | `webapi.amap.com/maps` | ⚠️ Key 必然下发；安全密钥可经代理注入防盗用 |

代理的核心价值：
1. **Web 服务类** Key 永不在浏览器出现（服务端转发 + 缓存）。
2. **JS API 安全密钥**由服务端注入（高德官方推荐代理方案），即使 JS Key 暴露，无安全密钥仍无法调用。

### 2.2 最小代理（Next.js Route Handler 示例，v1.5 BFF）
```ts
// app/api/amap/route.ts —— 仅服务端持有 KEY，前端永不接触
const AMAP_KEY = process.env.AMAP_SERVER_KEY!;     // 服务端环境变量，不进前端
const SECURITY  = process.env.AMAP_SECURITY_CODE!; // 安全密钥，仅服务端

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action'); // geocode | route | proxy-js
  if (action === 'proxy-js') {
    // JS API loader：注入安全密钥（高德代理标准写法），返回带签名的 loader
    const url = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&securityJsCode=${SECURITY}`;
    return fetch(url).then(r => new Response(r.body, { headers: { 'content-type': 'application/javascript' } }));
  }
  // Web 服务类：服务端转发 + 简单缓存
  const target = `https://restapi.amap.com/v3/${action}?key=${AMAP_KEY}&${searchParams.toString()}`;
  const r = await fetch(target);
  return new Response(await r.text(), { headers: { 'content-type': 'application/json' } });
}
```

### 2.3 前端对接（迁移零成本）
- `src/ui/map.js` 的 `getAmapKey()` 接口保持稳定；v1.5 仅把"读取全局 Key"改为"向 `/api/amap/proxy-js` 拉取带安全密钥的 loader"，**引擎/玩法/券包零改动**。
- `RewardStore` 同样在 v1.5 切 `bffStore`（见 M13），密钥与数据访问均收敛到 BFF，前端无明文。

### 2.4 接入检查清单（v1.5 上线前）
- [ ] `AMAP_SERVER_KEY` / `AMAP_SECURITY_CODE` 仅存于 BFF 环境变量（非前端、非仓库）。
- [ ] 前端不再出现 `VITE_AMAP_*` 明文；`getAmapKey()` 改走代理 loader。
- [ ] 高德控制台：JS Key 绑定「安全密钥」+ 域名白名单。
- [ ] 代理接口加限流 / 缓存，防 Key 被刷。

---

## 3. 验收（M11 已通过）
- [x] 全仓 `grep` 无明文高德 Key（`config-page.js` 已改为运行时读取）。
- [x] 前端源码无硬编码 `amapJsKey`（`map.js` 只读全局，兜底 null）。
- [x] `.env.example` 占位、`.env` 被 `.gitignore` 忽略。
- [x] `vite.config.js` 注入说明就绪；`h5/src/config.js` 注入点就绪。
- [ ] v1.5 后端代理落地后，再移除 `VITE_AMAP_JS_API_KEY` 注入路径（本模块留接口不删除）。

> 残留风险（需人工）：明文 Key 曾提交进 git 历史，工作区已移除但历史仍在。建议在高德控制台**重置该 Key**，并视情况清理历史（git 改写历史属不可逆操作，需 Robin 授权后单独处理）。
