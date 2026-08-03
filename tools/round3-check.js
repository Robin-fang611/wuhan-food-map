// 第3轮定向验证：搜索 Enter 响应 / 空状态引导 / 必读清单完成态
const { webkit } = require('playwright');

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

  await p.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => {
    const el = document.querySelector('.js-search, .search-entry, [data-act="search"], .searchbox');
    if (el) el.click();
  });
  await p.waitForSelector('#searchInput', { timeout: 5000 });

  // 1. Enter 键隔离验证：直接写 value（不触发 input 事件），只按 Enter
  await p.evaluate(() => {
    const i = document.getElementById('searchInput');
    i.focus();
    i.value = '床';
  });
  await p.waitForTimeout(300); // 等过防抖窗口，确认没有 input 事件在跑
  const before = await p.locator('.sr-item').count();
  await p.press('#searchInput', 'Enter');
  await p.waitForTimeout(400);
  const after = await p.locator('.sr-item').count();
  const focused = await p.evaluate(() => (document.activeElement && document.activeElement.id) || '(已失焦)');
  R.push('Enter 隔离验证：按前 ' + before + ' 条 → 按后 ' + after + ' 条 · Enter 后焦点=' + focused);

  // 2. 空状态引导
  await p.fill('#searchInput', 'zzzz不存在的词');
  await p.waitForTimeout(500);
  let emptyTitle = '';
  try {
    emptyTitle = (await p.locator('.se-title').first().textContent()) || '';
  } catch (e) {}
  const emptyTip = await p.locator('.se-tip').count();
  const emptyCta = await p.locator('.search-empty .js-group-entry').count();
  R.push('空状态标题="' + emptyTitle.trim() + '" · 提示块=' + emptyTip + ' · 进群CTA=' + emptyCta);

  // 3. 必读清单完成态
  await p.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.removeItem('jc_must_done'));
  await p.reload({ waitUntil: 'networkidle' });
  const boxes = await p.locator('.mitem').count();
  await p.evaluate(() => {
    Array.prototype.forEach.call(document.querySelectorAll('.mitem'), (el) => el.click());
  });
  await p.waitForTimeout(400);
  const fillComplete = await p.locator('.mustbar-fill.complete').count();
  const noteComplete = await p.locator('.mustnote.complete').count();
  let noteText = '';
  let fillW = '';
  try {
    noteText = (await p.locator('.mustnote').first().textContent()) || '';
  } catch (e) {}
  try {
    fillW = await p.locator('.mustbar-fill').first().evaluate((el) => el.style.width);
  } catch (e) {}
  R.push(
    '清单项 ' + boxes + ' · 全勾后 fill.complete=' + fillComplete + ' note.complete=' + noteComplete +
    ' width=' + fillW + ' note="' + noteText.trim() + '"'
  );
  await p.evaluate(() => localStorage.removeItem('jc_must_done'));

  console.log('\n===== 第3轮定向验证 =====');
  R.forEach((r) => console.log('  · ' + r));
  console.log(errs.length ? '  ✗ JS 报错: ' + errs.join(' | ') : '  ✓ 无 JS 报错');
  await b.close();
})();
