#!/usr/bin/env node
/* ============================================================
   江城 · 新生手册 —— 真实浏览器验收
   用法（需先起本地服务：python3 -m http.server 8899 于 handbook/）：
     NODE_PATH=<workspace>/node_modules node tools/e2e-check.js
   验收项：
     1. 15 页无 JS 报错、无资源 404
     2. 底部常驻栏在每页渲染
     3. 搜索：开浮层 → 输词 → 出结果 → 跳转命中锚点
     4. 进群弹窗、分享面板、分享海报能画出来
     5. 必读清单勾选可持久化
     6. 手风琴展开
   ============================================================ */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8899';
const OUT = path.resolve(__dirname, '..', '.audit');
const PAGES = [
  'index.html', 'xinsheng.html', 'jiaotong.html', 'sushe.html', 'junxun.html',
  'xiaoqu.html', 'rushi.html', 'xueye.html', 'shenghuo.html', 'growth.html',
  'jiangzhu.html', 'shetuan.html', 'zuzhi.html', 'jingsai.html', 'tice.html'
];

const fails = [];
const notes = [];
function fail(m) { fails.push(m); console.log('  ✗ ' + m); }
function ok(m) { console.log('  ✓ ' + m); }
function note(m) { notes.push(m); console.log('  · ' + m); }

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true, hasTouch: true
  });

  /* ---------- 1. 逐页体检 ---------- */
  console.log('\n【1】逐页加载检查');
  for (const p of PAGES) {
    const page = await ctx.newPage();
    const errs = [];
    const notFound = [];
    page.on('pageerror', e => errs.push(String(e.message)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('response', r => { if (r.status() >= 400) notFound.push(r.status() + ' ' + r.url().replace(BASE, '')); });

    await page.goto(`${BASE}/${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);

    const tab = await page.locator('.tabbar').count();
    const groupBtns = await page.locator('#groupEntry, .js-group-entry').count();
    const revealed = await page.locator('.block.revealed, .mrow.revealed').count();

    const tag = p.padEnd(16);
    if (errs.length) fail(`${tag} JS 报错: ${errs.slice(0, 2).join(' | ')}`);
    if (notFound.length) fail(`${tag} 资源 404: ${notFound.slice(0, 3).join(', ')}`);
    if (!tab) fail(`${tag} 底部常驻栏未渲染`);
    if (!groupBtns) fail(`${tag} 无进群入口`);
    if (!errs.length && !notFound.length && tab && groupBtns) {
      ok(`${tag} 无报错 · 常驻栏在 · 进群入口 ${groupBtns} 处 · 已揭示区块 ${revealed}`);
    }
    await page.close();
  }

  /* ---------- 2. 搜索链路 ---------- */
  console.log('\n【2】搜索链路');
  {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message)));
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });

    await page.click('#searchTrigger');
    await page.waitForSelector('.search-overlay.show', { timeout: 3000 });
    const hotCount = await page.locator('.hot-word').count();
    ok(`搜索浮层打开，热词 ${hotCount} 个`);

    await page.fill('#searchInput', '床');
    await page.waitForTimeout(500);
    const n1 = await page.locator('.sr-item').count();
    if (!n1) fail('搜「床」无结果'); else ok(`搜「床」命中 ${n1} 条`);
    const firstTitle = await page.locator('.sr-t').first().innerText();
    note(`首条：${firstTitle}`);

    await page.fill('#searchInput', '免测');
    await page.waitForTimeout(400);
    const n2 = await page.locator('.sr-item').count();
    ok(`搜「免测」命中 ${n2} 条`);

    // 点第一条，验证跳转 + 锚点命中
    const href = await page.locator('.sr-item').first().getAttribute('href');
    await page.locator('.sr-item').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    const url = page.url();
    if (!url.includes('#')) fail('搜索跳转没带锚点');
    else {
      const anchorId = url.split('#')[1];
      const exists = await page.locator(`#${anchorId}`).count();
      if (!exists) fail(`跳转后锚点 #${anchorId} 不存在`);
      else ok(`跳转 ${href} → 锚点 #${anchorId} 命中`);
    }

    // 搜无结果时是否收敛到进群
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await page.click('#searchTrigger');
    await page.fill('#searchInput', 'zzzqqq');
    await page.waitForTimeout(400);
    const emptyHasGroup = await page.locator('.search-empty .js-group-entry').count();
    if (!emptyHasGroup) fail('搜索空结果没有给进群出口'); else ok('搜索空结果收敛到进群');
    if (errs.length) fail('搜索过程 JS 报错: ' + errs[0]);
    await page.close();
  }

  /* ---------- 3. 进群弹窗 ---------- */
  console.log('\n【3】进群弹窗');
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/tice.html`, { waitUntil: 'networkidle' });
    await page.click('#groupEntry');
    await page.waitForSelector('.ad-overlay.show', { timeout: 3000 });
    const qrs = await page.locator('.ad-qr-img').count();
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll('.ad-qr-img')].filter(i => !i.complete || i.naturalWidth === 0).length
    );
    if (!qrs) fail('弹窗里没有二维码');
    else if (broken) fail(`${broken}/${qrs} 张二维码加载失败`);
    else ok(`弹窗 ${qrs} 张二维码全部加载成功`);
    await page.screenshot({ path: path.join(OUT, 'popup.png') });
    await page.close();
  }

  /* ---------- 4. 分享面板 + 海报 ---------- */
  console.log('\n【4】分享与海报');
  {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message)));
    await page.goto(`${BASE}/jiangzhu.html`, { waitUntil: 'networkidle' });
    await page.click('#shareBtn');
    await page.waitForSelector('.share-sheet.show', { timeout: 3000 });
    ok('分享面板弹出');

    await page.click('.ss-item[data-act="poster"]');
    await page.waitForSelector('.poster-img', { timeout: 8000 });
    await page.waitForTimeout(600);
    const dim = await page.evaluate(() => {
      const i = document.querySelector('.poster-img');
      return { w: i.naturalWidth, h: i.naturalHeight, len: i.src.length };
    });
    if (dim.w !== 750 || dim.h !== 1180) fail(`海报尺寸异常 ${dim.w}x${dim.h}`);
    else ok(`海报生成 ${dim.w}x${dim.h}，约 ${(dim.len / 1365).toFixed(0)} KB`);
    await page.screenshot({ path: path.join(OUT, 'poster.png') });

    // 单独导出海报本体，人工看一眼排版
    const src = await page.locator('.poster-img').getAttribute('src');
    fs.writeFileSync(path.join(OUT, 'poster-raw.jpg'), Buffer.from(src.split(',')[1], 'base64'));
    if (errs.length) fail('海报过程 JS 报错: ' + errs[0]);
    await page.close();
  }

  /* ---------- 5. 必读清单持久化 ---------- */
  console.log('\n【5】必读清单');
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await page.locator('.mitem').nth(0).click();
    await page.locator('.mitem').nth(2).click();
    await page.waitForTimeout(200);
    const noteTxt = await page.locator('#mustNote').innerText();
    if (!/2 \/ 8/.test(noteTxt)) fail(`勾选后计数不对：${noteTxt}`); else ok(`勾选生效：${noteTxt}`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const after = await page.locator('.mitem.done').count();
    if (after !== 2) fail(`刷新后勾选丢失，剩 ${after} 项`); else ok('刷新后勾选状态保留');
    // 点"去看"不应误触勾选
    const beforeGo = await page.locator('.mitem.done').count();
    await page.locator('.mitem').nth(1).locator('.mgo').click();
    await page.waitForLoadState('networkidle');
    await page.goBack({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const afterGo = await page.locator('.mitem.done').count();
    if (afterGo !== beforeGo) fail('点「去看」误触了勾选'); else ok('点「去看」不误触勾选');
    await page.close();
  }

  /* ---------- 6. 手风琴 ---------- */
  console.log('\n【6】手风琴与返回');
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/tice.html`, { waitUntil: 'networkidle' });
    const accs = await page.locator('.acc-item').count();
    await page.locator('.acc-q').first().click();
    await page.waitForTimeout(400);
    const h = await page.evaluate(() => document.querySelector('.acc-a').getBoundingClientRect().height);
    if (h < 20) fail(`手风琴未展开（高度 ${h}）`); else ok(`${accs} 个手风琴，首个展开高度 ${h.toFixed(0)}px`);
    await page.locator('.tab[href="index.html"]').click();
    await page.waitForLoadState('networkidle');
    if (!page.url().endsWith('index.html')) fail('常驻栏回手册失败'); else ok('常驻栏可回手册');
    await page.close();
  }

  /* ---------- 7. 全站截图 ---------- */
  console.log('\n【7】首页与代表页截图');
  for (const p of ['index.html', 'tice.html', 'jiangzhu.html']) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${p}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, p.replace('.html', '') + '.png'), fullPage: true });
    await page.close();
  }
  ok(`截图已存至 .audit/`);

  await browser.close();

  console.log('\n' + '='.repeat(52));
  if (fails.length) {
    console.log(`✗ 验收未通过，${fails.length} 项问题：`);
    fails.forEach(f => console.log('  · ' + f));
    process.exit(1);
  }
  console.log('✓ 全部验收项通过');
  process.exit(0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
