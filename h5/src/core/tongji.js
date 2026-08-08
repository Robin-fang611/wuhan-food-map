// 百度统计（Tongji）接入：env 注入站点 ID，零硬编码、零 PII。
//
// 设计（与 analytics.js 同源思路）：
//   - 仅依赖 VITE_TONGJI_ID（构建期注入），未配置时本模块为完全空操作，不影响业务；
//   - 加载官方 hm.js 后，百度自动统计 UV（≈DAU）、PV、访问来源、地域等，开箱即用，无需后端；
//   - SPA 路由切换需手动 _trackPageview（hm.js 只自动记首屏），故暴露 trackPage()；
//   - 与 LocalAnalytics 的 APP_OPEN 事件互补：前端本地的 dau() 走 analytics，
//     大盘看数走百度（更准、带留存/来源/设备维度）。两套互不影响。

const TONGJI_SRC = 'https://hm.baidu.com/hm.js';
let injected = false;

// 注入 hm.js 加载器（幂等：多次调用只加载一次）。需在浏览器环境调用。
export function initTongji(siteId) {
  if (injected) return;
  if (typeof document === 'undefined') return; // 非浏览器（如 node 测试）直接跳过
  const id = siteId && String(siteId).trim();
  if (!id) return;
  globalThis._hmt = globalThis._hmt || [];
  const s = document.createElement('script');
  s.async = true;
  s.src = `${TONGJI_SRC}?${encodeURIComponent(id)}`;
  const ref = document.getElementsByTagName('script')[0] || document.head;
  (ref.parentNode || document.head).insertBefore(s, ref);
  injected = true;
}

// SPA 路由切换时上报一次页面浏览。首屏由 hm.js 自动记录，故首屏无需调用（见 main.js 的 firstRender 守卫）。
export function trackPage(url) {
  if (typeof globalThis._hmt === 'undefined') return;
  globalThis._hmt.push(['_trackPageview', url]);
}

// 是否已配置并加载（供调试/自检）。
export function tongjiReady() { return injected; }
