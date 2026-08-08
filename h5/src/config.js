// M11 安全接入：高德 JS API Key 由构建期环境变量注入，绝不硬编码进源码/仓库（§8 / §13.3）。
//
// 机制（遵循 Vite 约定，零依赖）：
//   - 本地/CI 在 h5/.env（已被 .gitignore 忽略）写入 VITE_AMAP_JS_API_KEY=xxxx，
//     或构建平台注入同名环境变量；
//   - Vite 构建时把 import.meta.env.VITE_AMAP_JS_API_KEY 替换为对应值；
//   - 未设置（或设为空串）时该值为 undefined/''，此处兜底为 null —— 前端包不含任何明文 Key。
//
// 前端统一通过 globalThis.__MANYOUWEI_CONFIG__.amapJsKey 读取（见 src/ui/map.js getAmapKey()），
// 因此 map.js 无需改动、引擎/玩法/券包零改动。v1.5 可改为从后端代理签名获取 Key。
//
// 注意：纯静态 SPA 下 Key 必然随页面下发到浏览器，属高德 JS API 固有形态；
// 真正"Key 不下发浏览器"需 v1.5 后端代理（见 docs/高德Key安全接入.md）。
// v0.5 通过「不入库 + 高德控制台域名白名单 + 安全密钥」降低泄露风险。
const amapJsKey =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_AMAP_JS_API_KEY) || null;

// 高德 JS API 2.0 的「安全密钥」(securityJsCode)：与 Key 配套，控制台开启"安全密钥"后获得。
// 必须在加载高德 SDK 之前注入（见 src/ui/map.js 的 loadAmap），同样只经 env 注入、不入库。
const amapSecurityCode =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_AMAP_SECURITY_CODE) || null;

// 百度统计（Tongji）站点 ID：env 注入，未配置时统计模块为空操作（见 src/core/tongji.js）。
const tongjiId =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_TONGJI_ID) || null;

globalThis.__MANYOUWEI_CONFIG__ = globalThis.__MANYOUWEI_CONFIG__ || {};
globalThis.__MANYOUWEI_CONFIG__.amapJsKey = globalThis.__MANYOUWEI_CONFIG__.amapJsKey || amapJsKey;
globalThis.__MANYOUWEI_CONFIG__.amapSecurityCode = globalThis.__MANYOUWEI_CONFIG__.amapSecurityCode || amapSecurityCode;
globalThis.__MANYOUWEI_CONFIG__.tongjiId = globalThis.__MANYOUWEI_CONFIG__.tongjiId || tongjiId;
