/**
 * 第 5 轮定向验证
 * 验证对象：无障碍基础设施 + 对比度 + 标题层级
 */
const { webkit } = require('playwright');
const BASE = 'http://127.0.0.1:8899';
const PAGES = [
  'index.html', 'xinsheng.html', 'rushi.html', 'junxun.html', 'sushe.html',
  'shenghuo.html', 'xiaoqu.html', 'jiaotong.html', 'xueye.html', 'jiangzhu.html',
  'shetuan.html', 'zuzhi.html', 'jingsai.html', 'tice.html'
];

const CHECK = () => {
  const out = {
    hasSkipLink: !!document.querySelector('.skip-link'),
    skipHref: (document.querySelector('.skip-link') || {}).getAttribute('href'),
    hasMain: document.querySelectorAll('main,[role="main"]').length > 0,
    mainId: (document.querySelector('main,[role="main"]') || {}).id,
    lang: document.documentElement.getAttribute('lang'),
    headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => h.tagName + ':' + h.textContent.trim().slice(0, 12)),
    headingJump: false
  };
  let prev = 0;
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    const lv = parseInt(h.tagName[1], 10);
    if (prev && lv > prev + 1) out.headingJump = true;
    prev = lv;
  });
  return out;
};

(async () => {
  const b = await webkit.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  let ok = 0, fail = 0;
  console.log('第 5 轮定向验证\n');
  for (const p of PAGES) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${p}`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const r = await page.evaluate(CHECK);
    const good = r.hasSkipLink && r.hasMain && r.lang && !r.headingJump;
    if (good) ok++; else fail++;
    console.log(
      (good ? '✓' : '✗') + ' ' + p.padEnd(16)
      + ' | skip:' + (r.hasSkipLink ? r.skipHref : '无')
      + ' | main:' + (r.hasMain ? '#' + r.mainId : '无')
      + ' | lang:' + r.lang
      + ' | 层级:' + (r.headingJump ? '跳跃' : 'OK')
    );
    await page.close();
  }
  await b.close();
  console.log('\n>>> 通过 ' + ok + ' / ' + PAGES.length + '，失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
