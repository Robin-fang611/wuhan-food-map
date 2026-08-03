/**
 * 键盘可达性检查（Chromium 内核）
 * WebKit 默认不把链接纳入 Tab 序列，所以键盘检查必须用 Chromium 跑。
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8899';
const PAGES = ['index.html', 'xinsheng.html', 'xueye.html'];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  for (const p of PAGES) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${p}`, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    console.log(`\n=== ${p} ===`);
    let noRing = 0, total = 0;
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').split(/\s+/)[0] || '',
          txt: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 12),
          outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor,
          shadow: cs.boxShadow === 'none' ? '' : 'ring',
          visible: r.width > 0 && r.height > 0,
          inView: r.top > -10 && r.top < 844
        };
      });
      if (!info) break;
      total++;
      const has = (info.outline !== 'none 0px ' + info.outline.split(' ')[2]
        && !info.outline.startsWith('none')) || info.shadow === 'ring';
      if (info.visible && !has) noRing++;
      console.log(
        `${String(i + 1).padStart(2)} ${info.tag}.${info.cls.padEnd(12)} "${info.txt}"`.padEnd(48)
        + `| 焦点环: ${has ? '有' : '✗ 无'} | 可见: ${info.visible ? 'Y' : 'N'} | 视口内: ${info.inView ? 'Y' : 'N'}`
      );
    }
    console.log(`>>> ${p}: Tab ${total} 步，无焦点环 ${noRing} 步`);
    await page.close();
  }
  await b.close();
})();
