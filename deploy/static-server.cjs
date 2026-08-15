// 蛮有味 · 极简静态服务器（服务器端，2026-08-15）
// 职责：h5/dist 静态托管（SPA fallback）+ /api 反向代理到后端 :8799。
// 零依赖（Node 内置 http/fs），pm2 托管（端口 8080，免备案）。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIST = process.env.MYWO_DIST || path.resolve(__dirname, '..', 'h5', 'dist');
const API_TARGET = process.env.MYWO_API || 'http://127.0.0.1:8799';
const PORT = Number(process.env.MYWO_WEB_PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  // /api 反代到后端
  if (req.url.startsWith('/api/')) {
    const target = new URL(req.url.slice(4), API_TARGET);
    const proxy = http.request(target, {
      method: req.method,
      headers: { ...req.headers, host: target.host },
    }, (pres) => {
      res.writeHead(pres.statusCode, pres.headers);
      pres.pipe(res);
    });
    proxy.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: '后端不可达' })); });
    req.pipe(proxy);
    return;
  }
  // 静态文件（SPA fallback）
  let p = path.join(DIST, decodeURIComponent((req.url.split("?")[0] || "/").replace(/^\//, "")));
  try {
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
  } catch { p = path.join(DIST, 'index.html'); }
  const ext = path.extname(p).toLowerCase();
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
  fs.createReadStream(p).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log("[manyouwei-web] static :" + PORT + " (dist=" + DIST + ", api=" + API_TARGET + ")");
});
