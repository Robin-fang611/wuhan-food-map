// 内测门禁（服务端真锁）：仅作用于被映射的 7 个第一学期页面。
// 未携带服务端 cookie(fh_gate=1) 时，绝不把页面内容下发到浏览器，
// 而是返回密钥页；输入正确密钥(linkyou)后由服务端种下 HttpOnly cookie，
// 再放行真实静态页面。cookie 跨这 7 个页面共享，解锁一次即可。
export default async (request, context) => {
  const KEY = 'linkyou';
  const COOKIE = 'fh_gate';
  const url = new URL(request.url);
  const path = url.pathname;

  const unlocked = context.cookies.get(COOKIE) === '1';

  function page(error) {
    const errHtml = error ? '<div class="err">' + error + '</div>' : '';
    const html =
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
      '<title>内测验证 · 江城新生手册</title>' +
      '<style>' +
      '*{box-sizing:border-box}' +
      'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Arial,sans-serif;background:#F6F1E7;color:#2b2b2b;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}' +
      '.card{background:#fff;border-radius:20px;width:100%;max-width:360px;padding:28px 24px;box-shadow:0 10px 40px rgba(0,0,0,.08);text-align:center}' +
      '.badge{display:inline-block;font-size:11px;letter-spacing:.1em;color:#c0392b;border:1px solid #f0c9c2;background:#fdf3f1;border-radius:999px;padding:3px 10px;margin-bottom:14px}' +
      'h1{font-size:18px;margin:0 0 8px}' +
      'p{font-size:13px;color:#7a756c;line-height:1.6;margin:0 0 18px}' +
      'b{color:#c0392b}' +
      'input{width:100%;padding:12px 14px;border:1px solid #e3ddd0;border-radius:12px;font-size:15px;outline:none;margin-bottom:12px}' +
      'input:focus{border-color:#c0392b}' +
      'button{width:100%;padding:12px;border:none;border-radius:12px;background:#c0392b;color:#fff;font-size:15px;font-weight:600;cursor:pointer}' +
      'button:active{transform:scale(.98)}' +
      '.err{color:#c0392b;font-size:13px;margin-bottom:10px}' +
      '.tip{font-size:11px;color:#aaa;margin-top:14px}' +
      '</style></head><body><div class="card">' +
      '<span class="badge">内测内容</span>' +
      '<h1>访问验证</h1>' +
      '<p>本内容为内测，请输入密钥查看。<br>密钥请添加 <b>财大Linkyou</b> 获取。</p>' +
      errHtml +
      '<form method="post" action="">' +
      '<input name="key" type="text" placeholder="输入内测密钥" autocomplete="off" autocapitalize="off" spellcheck="false" autofocus>' +
      '<button type="submit">解锁查看</button>' +
      '</form>' +
      '<div class="tip">部分功能测试中</div>' +
      '</div></body></html>';
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  if (request.method === 'POST') {
    try {
      const fd = await request.formData();
      const key = String(fd.get('key') || '').trim().toLowerCase();
      if (key === KEY) {
        context.cookies.set(COOKIE, '1', {
          path: '/',
          maxAge: 2592000,
          httpOnly: true,
          secure: true,
          sameSite: 'lax'
        });
        return new Response(null, { status: 302, headers: { 'Location': path } });
      }
    } catch (e) { /* fall through to error page */ }
    return page('密钥不正确，请添加「财大Linkyou」获取内测密钥');
  }

  // GET
  if (unlocked) {
    const resp = await context.next();
    // 禁止 CDN 缓存已解锁内容，避免解锁后被他人命中缓存
    resp.headers.set('Cache-Control', 'private, no-store');
    return resp;
  }
  return page();
};
