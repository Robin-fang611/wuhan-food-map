// 第4轮定向验证：章节合并跳转 / 速览条锚点 / 章末导航边界 / 回顶
const { webkit } = require('playwright');
const BASE = 'http://127.0.0.1:8899';

(async () => {
  const b = await webkit.launch();
  const p = await b.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  const R = [];
  let fail = 0;
  function chk(ok, msg) {
    R.push((ok ? '  ✓ ' : '  ✗ ') + msg);
    if (!ok) fail++;
  }

  // 1. growth.html 旧链接自动跳转并落到正确锚点
  await p.goto(BASE + '/growth.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  const land = await p.evaluate(() => {
    const el = document.getElementById('b11');
    const nav = document.querySelector('.page-nav');
    const navH = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
    return {
      url: location.pathname + location.hash,
      exists: !!el,
      top: el ? Math.round(el.getBoundingClientRect().top) : null,
      navH: navH,
      title: el ? (el.querySelector('h3') || {}).textContent : '',
    };
  });
  chk(/xueye\.html#b11$/.test(land.url), '旧链接 growth.html 自动跳到 ' + land.url);
  chk(land.exists, '目标区块存在：' + (land.title || '').trim());
  chk(land.top !== null && land.top >= land.navH - 2, '落点 top=' + land.top + 'px 未被 ' + land.navH + 'px 吸顶导航遮挡');

  // 2. 速览条点击跳转准确（取最长页最后一个 chip）
  await p.goto(BASE + '/xinsheng.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  const chipInfo = await p.evaluate(() => {
    const chips = document.querySelectorAll('.pn-chip');
    return { n: chips.length, lastTarget: chips.length ? chips[chips.length - 1].dataset.target : null };
  });
  if (chipInfo.n) {
    await p.evaluate(() => {
      const chips = document.querySelectorAll('.pn-chip');
      chips[chips.length - 1].click();
    });
    await p.waitForTimeout(900);
    const after = await p.evaluate((id) => {
      const el = document.getElementById(id);
      const nav = document.querySelector('.page-nav');
      const navH = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
      return { top: el ? Math.round(el.getBoundingClientRect().top) : null, navH: navH, y: Math.round(window.pageYOffset) };
    }, chipInfo.lastTarget);
    chk(after.y > 100, '速览条点末项后已滚动 ' + after.y + 'px');
    chk(after.top !== null && after.top >= after.navH - 2 && after.top < 200,
      '目标 ' + chipInfo.lastTarget + ' 落在 top=' + after.top + 'px（吸顶 ' + after.navH + 'px 之下）');
    // 高亮同步
    const on = await p.evaluate(() => {
      const c = document.querySelector('.pn-chip.on');
      return c ? c.textContent : null;
    });
    chk(!!on, '当前区块 chip 已高亮：' + on);
  } else {
    chk(false, 'xinsheng.html 速览条未渲染');
  }

  // 3. 章末导航：首章无上一章、末章无下一章、中间章两者都有
  const cases = [
    ['xinsheng.html', { prev: false, next: 'jiaotong.html' }],
    ['tice.html', { prev: 'jingsai.html', next: false }],
    ['xueye.html', { prev: 'rushi.html', next: 'shenghuo.html' }],
  ];
  for (const [page, want] of cases) {
    await p.goto(BASE + '/' + page, { waitUntil: 'networkidle' });
    await p.waitForTimeout(250);
    const cf = await p.evaluate(() => {
      const box = document.querySelector('.chap-foot');
      if (!box) return null;
      const g = (sel) => {
        const a = box.querySelector(sel);
        return a ? { href: a.getAttribute('href'), text: a.textContent.replace(/\s+/g, ' ').trim() } : null;
      };
      const ge = document.getElementById('groupEntry');
      const order = ge ? (box.compareDocumentPosition(ge) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 : null;
      return { prev: g('.cf-prev'), next: g('.cf-next'), home: g('.cf-home'), beforeGroup: order };
    });
    if (!cf) { chk(false, page + ' 无章末导航'); continue; }
    chk(want.next ? (cf.next && cf.next.href === want.next) : !cf.next,
      page + ' 下一章 = ' + (cf.next ? cf.next.text : '（无，末章）'));
    chk(want.prev ? (cf.prev && cf.prev.href === want.prev) : !cf.prev,
      page + ' 上一章 = ' + (cf.prev ? cf.prev.text : '（无，首章）'));
    chk(!!cf.home, page + ' 回目录入口在');
    if (cf.beforeGroup !== null) chk(cf.beforeGroup === true, page + ' 章末导航排在进群入口之前，不抢进群位');
  }

  // 4. 回顶
  await p.goto(BASE + '/xinsheng.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(250);
  const hiddenAtTop = await p.evaluate(() => !document.querySelector('.to-top').classList.contains('on'));
  chk(hiddenAtTop, '页面顶部时回顶按钮隐藏');
  await p.evaluate(() => window.scrollTo(0, window.innerHeight * 3));
  await p.waitForTimeout(400);
  const shown = await p.evaluate(() => {
    const t = document.querySelector('.to-top');
    const bar = document.querySelector('.tabbar');
    const tr = t.getBoundingClientRect();
    const br = bar ? bar.getBoundingClientRect() : null;
    return { on: t.classList.contains('on'), overlap: br ? tr.bottom > br.top : false, size: Math.round(tr.width) };
  });
  chk(shown.on, '滚过 1.5 屏后回顶按钮浮出（' + shown.size + 'px）');
  chk(!shown.overlap, '回顶按钮不压住底部常驻栏');
  await p.evaluate(() => document.querySelector('.to-top').click());
  await p.waitForTimeout(1200);
  const backTop = await p.evaluate(() => Math.round(window.pageYOffset));
  chk(backTop < 50, '点回顶后回到 y=' + backTop);

  // 5. 首页目录 13 章且序号连续
  await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  const menu = await p.evaluate(() => {
    const rows = document.querySelectorAll('.mrow');
    return Array.prototype.map.call(rows, (r) => {
      const no = r.querySelector('.no');
      const h = r.querySelector('h4');
      return (no ? no.textContent : '?') + '|' + (h ? h.textContent : '?') + '|' + r.getAttribute('href');
    });
  });
  const expect = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾', '十一', '十二', '十三'];
  const nos = menu.map((m) => m.split('|')[0]);
  chk(menu.length === 13, '首页目录 ' + menu.length + ' 章');
  chk(JSON.stringify(nos) === JSON.stringify(expect), '序号连续无跳号：' + nos.join(' '));
  chk(menu.every((m) => m.indexOf('growth.html') < 0), '目录中已无 growth 入口');

  // 6. 搜「选课」应命中 xueye 而非 growth
  await p.evaluate(() => {
    const el = document.querySelector('.js-search, .search-entry, .searchbox');
    if (el) el.click();
  });
  await p.waitForSelector('#searchInput', { timeout: 5000 });
  await p.fill('#searchInput', '选课');
  await p.waitForTimeout(700);
  const hits = await p.evaluate(() => {
    const a = document.querySelectorAll('.sr-item');
    return Array.prototype.map.call(a, (x) => x.getAttribute('href')).slice(0, 6);
  });
  chk(hits.length > 0, '搜「选课」命中 ' + hits.length + ' 条：' + hits.join(', '));
  chk(hits.every((h) => h.indexOf('growth.html') < 0), '搜索结果不再指向已合并的 growth.html');

  console.log('\n===== 第4轮定向验证 =====');
  R.forEach((r) => console.log(r));
  console.log(errs.length ? '  ✗ JS 报错: ' + errs.join(' | ') : '  ✓ 无 JS 报错');
  console.log(fail === 0 && !errs.length ? '\n✓ 第4轮全部通过' : '\n✗ ' + (fail + errs.length) + ' 项未通过');
  await b.close();
  process.exit(fail === 0 && !errs.length ? 0 : 1);
})();
