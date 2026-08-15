import { defineConfig } from 'vite';

// 薄壳架构：原生 ES 模块，no framework。localStorage 原型可直接用静态服务器跑，
// `vite` 仅提供开发服务器 / 打包（未来接 BFF 时换壳成本低）。
//
// ── M11 安全接入：高德 Key 注入说明（§8 / §13.3）──────────────────────────
// 高德 JS API Key 通过构建期环境变量 VITE_AMAP_JS_API_KEY 注入，不写进源码：
//   1. 本地在 h5/.env（已被 .gitignore 忽略）写：VITE_AMAP_JS_API_KEY=xxxx
//      或构建平台（Netlify / Vercel / CloudBase）注入同名环境变量；
//   2. src/config.js 读取 import.meta.env.VITE_AMAP_JS_API_KEY，兜底为 null；
//   3. 前端经 globalThis.__MANYOUWEI_CONFIG__.amapJsKey 读取（src/ui/map.js getAmapKey()）。
// 未设置时 Key 为 null → 前端包不含任何明文 Key（满足「全仓 grep 无明文 Key」）。
// 纯静态 SPA 下 Key 必然随页面下发；真正不暴露 Key 需 v1.5 后端代理（docs/高德Key安全接入.md）。
// Vite 默认仅暴露 VITE_ 前缀变量，无需额外配置；下面显式声明以保持意图清晰。
export default defineConfig({
  root: '.',
  envPrefix: 'VITE_',
  server: { port: 5180, host: true },
  // 2026-08-15：生产构建 VITE_API_BASE=/api（同源反代），本地预览也需 /api 可达，
  // 否则按 h5/.env 构建后本地点对话会 404 误报「连不上后端」。dev/preview 统一代理到 :8799，
  // 并剥掉 /api 前缀（与 deploy/static-server.cjs 的 req.url.slice(4) 行为一致）。
  preview: { proxy: { '/api': { target: 'http://127.0.0.1:8799', rewrite: (p) => p.replace(/^\/api/, '') } } },
  build: {
    outDir: 'dist',
    target: 'es2019',
    // W8 code-split：把大块数据与重型视图拆包，首屏只加载核心壳
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('data/merchants') || id.includes('data/all-merchants')
            || id.includes('data/robin-99') || id.includes('data/web-stalls')
            || id.includes('data/extras-coords')) return 'data';
          if (id.includes('ui/map')) return 'map';
          if (id.includes('ui/reasoning') || id.includes('ui/revealSteps') || id.includes('ui/chatFollowups')) return 'agent';
          if (id.includes('ui/login') || id.includes('core/auth') || id.includes('api/auth-client')) return 'account';
          return undefined;
        },
      },
    },
  }
});
