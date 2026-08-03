/* eslint-disable */
/**
 * 多机型移动端适配检查
 * 用法：
 *   1) cd handbook && python3 -m http.server 8899
 *   2) NODE_PATH=<workspace>/node_modules node tools/mobile-check.js
 *
 * 检查项：
 *   - 横向溢出（页面出现左右滚动 = 致命）
 *   - 元素超出视口宽度
 *   - 触控目标 < 40px
 *   - 底部常驻栏遮挡正文最后一屏
 *   - 文字过小（< 11px）
 *   - JS 报错 / 资源 404
 *   - 弹层（搜索/进群/分享）在小屏下是否可见且不溢出
 */
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8899';
const OUT = path.join(__dirname, '..', '.audit', 'mobile');

const PAGES = [
  'index.html', 'xinsheng.html', 'jiaotong.html', 'sushe.html', 'junxun.html',
  'xiaoqu.html', 'rushi.html', 'xueye.html', 'shenghuo.html', 'growth.html',
  'jiangzhu.html', 'shetuan.html', 'zuzhi.html', 'jingsai.html', 'tice.html'
];

/* 覆盖国内主流机型：最小屏 → 最大屏 */
const DEVICES = [
  { name: 'iPhone SE2/8',  w: 375, h: 667, dpr: 2, ios: true },
  { name: 'iPhone 13/14',  w: 390, h: 844, dpr: 3, ios: true },
  { name: 'iPhone 15 PM',  w: 430, h: 932, dpr: 3, ios: true },
  { name: '安卓小屏 360',   w: 360, h: 640, dpr: 3, ios: false },
  { name: '安卓主流 412',   w: 412, h: 915, dpr: 2.6, ios: false },
  { name: '折叠展开 768',   w: 768, h: 1024, dpr: 2, ios: false }
];

const UA_WECHAT_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003128) NetType/WIFI Language/zh_CN';
const UA_WECHAT_AND = 'Mozilla/5.0 (Linux; Android 13; PGT-AN10 Build/HUAWEIPGT-AN10; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/107.0.5304.141 Mobile Safari/537.36 XWEB/1160117 MMWEBSDK/20231202 MMWEBID/4321 MicroMessenger/8.0.47.2560(0x28002F35) WeChat/arm64 Weixin NetType/WIFI';

const issues = [];
function bug(level, dev, page, msg) { issues.push({ level, dev, page, msg }); }

async function main() {
  const { chromium, webkit, devices } = require('playwright');
  fs.mkdirSync(OUT, { recursive: true });

  console.log('\n========== 多机型移动端适配检查 ==========\n');

  /* ---------- A. Chromium：6 机型 × 15 页 布局体检 ---------- */
  const browser = await chromium.launch({ headless: true });

  for (const dev of DEVICES) {
    const ctx = await browser.newContext({
      viewport: { width: dev.w, height: dev.h },
      deviceScaleFactor: dev.dpr,
      isMobile: true,
      hasTouch: true,
      userAgent: dev.ios ? UA_WECHAT_IOS : UA_WECHAT_AND
    });
    const page = await ctx.newPage();

    let errs = 0, r404 = 0;
    page.on('pageerror', () => errs++);
    page.on('response', r => { if (r.status() >= 400) r404++; });

    let worstOverflow = 0, tinyTapTotal = 0, tinyFontTotal = 0;

    for (const f of PAGES) {
      await page.goto(BASE + '/' + f, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(250);
      // 关掉可能自动弹出的进群浮层，避免干扰布局测量
      await page.evaluate(() => {
        const o = document.querySelector('.ad-overlay');
        if (o) o.remove();
      });

      const res = await page.evaluate((vw) => {
        const out = { docW: document.documentElement.scrollWidth, over: [], tinyTap: [], tinyFont: [] };
        const all = document.querySelectorAll('body *');
        for (const el of all) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;

          // 横向溢出元素（排除本身就是横向滚动容器的子项）
          const parent = el.parentElement;
          const inScroller = parent && getComputedStyle(parent).overflowX === 'auto';
          if (!inScroller && r.right > vw + 1) {
            out.over.push({ t: el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0], right: Math.round(r.right) });
          }

          // 触控目标
          const tappable = el.tagName === 'BUTTON' || el.tagName === 'A' ||
            (el.getAttribute && el.getAttribute('role') === 'button');
          if (tappable && r.height > 0 && r.height < 40 && r.width > 0) {
            out.tinyTap.push({ t: (el.className || '').toString().split(' ')[0] || el.tagName, h: Math.round(r.height) });
          }

          // 字号
          if (el.children.length === 0 && (el.textContent || '').trim().length > 3) {
            const fs = parseFloat(cs.fontSize);
            if (fs && fs < 11) out.tinyFont.push({ t: (el.className || '').toString().split(' ')[0] || el.tagName, fs });
          }
        }
        return out;
      }, dev.w);

      if (res.docW > dev.w + 1) {
        const ov = res.docW - dev.w;
        if (ov > worstOverflow) worstOverflow = ov;
        bug('P0', dev.name, f, '横向溢出 ' + ov + 'px（doc ' + res.docW + ' > 视口 ' + dev.w + '），首个越界元素：' +
          (res.over[0] ? res.over[0].t + ' right=' + res.over[0].right : '未定位'));
      }
      tinyTapTotal += res.tinyTap.length;
      tinyFontTotal += res.tinyFont.length;
      if (res.tinyTap.length) {
        const uniq = [...new Set(res.tinyTap.map(x => x.t + '(' + x.h + 'px)'))].slice(0, 4);
        bug('P2', dev.name, f, '触控目标偏小 ' + res.tinyTap.length + ' 处：' + uniq.join(', '));
      }
      if (res.tinyFont.length) {
        const uniq = [...new Set(res.tinyFont.map(x => x.t + '(' + x.fs + 'px)'))].slice(0, 4);
        bug('P2', dev.name, f, '字号偏小 ' + res.tinyFont.length + ' 处：' + uniq.join(', '));
      }
    }

    /* 弹层在该机型下的可见性 */
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const o = document.querySelector('.ad-overlay'); if (o) o.remove(); });

    // 搜索层
    await page.evaluate(() => window.Jiangcheng && window.Jiangcheng.openSearch && window.Jiangcheng.openSearch());
    await page.waitForTimeout(400);
    const sBox = await page.evaluate(() => {
      const el = document.querySelector('.search-overlay');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    if (!sBox || sBox.w < dev.w - 2 || sBox.h < dev.h - 2) {
      bug('P0', dev.name, '搜索浮层', '未铺满视口：' + JSON.stringify(sBox) + ' 期望 ' + dev.w + 'x' + dev.h);
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);

    // 进群弹窗
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(250);
    await page.evaluate(() => { const o = document.querySelector('.ad-overlay'); if (o) o.remove(); });
    await page.evaluate(() => { const b = document.querySelector('.js-group-entry'); if (b) b.click(); });
    await page.waitForTimeout(500);
    const gBox = await page.evaluate(() => {
      const ov = document.querySelector('.ad-overlay');
      if (!ov) return null;
      const r = ov.getBoundingClientRect();
      const card = ov.querySelector('.ad-card');
      const cr = card ? card.getBoundingClientRect() : null;
      return { ovW: Math.round(r.width), ovH: Math.round(r.height), cardW: cr ? Math.round(cr.width) : 0, cardTop: cr ? Math.round(cr.top) : 0, cardBot: cr ? Math.round(cr.bottom) : 0 };
    });
    if (!gBox || gBox.ovW < dev.w - 2) {
      bug('P0', dev.name, '进群弹窗', '遮罩未铺满：' + JSON.stringify(gBox));
    } else if (gBox.cardW > dev.w - 8) {
      bug('P1', dev.name, '进群弹窗', '卡片过宽 ' + gBox.cardW + '（视口 ' + dev.w + '）');
    } else if (gBox.cardTop < 0 || gBox.cardBot > dev.h) {
      bug('P1', dev.name, '进群弹窗', '卡片纵向超出屏幕 top=' + gBox.cardTop + ' bottom=' + gBox.cardBot + '（屏高 ' + dev.h + '）');
    }

    await page.screenshot({ path: path.join(OUT, dev.name.replace(/[\/\s]/g, '_') + '-popup.png') });

    console.log('  ' + pad(dev.name, 14) + dev.w + 'x' + dev.h + ' @' + dev.dpr + 'x  ' +
      (errs ? '✗ JS报错 ' + errs : '✓ 无报错') + ' · ' +
      (r404 ? '✗ 404 ' + r404 : '✓ 无404') + ' · ' +
      (worstOverflow ? '✗ 最大溢出 ' + worstOverflow + 'px' : '✓ 无横向溢出') + ' · ' +
      '小触控 ' + tinyTapTotal + ' · 小字号 ' + tinyFontTotal);

    await ctx.close();
  }
  await browser.close();

  /* ---------- B. WebKit：iOS Safari 真内核 ---------- */
  let hasWebkit = true;
  try {
    console.log('\n【WebKit / iOS Safari 真内核】');
    const wb = await webkit.launch({ headless: true });
    const ctx = await wb.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

    for (const f of PAGES) {
      await page.goto(BASE + '/' + f, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(200);
      const over = await page.evaluate(() => document.documentElement.scrollWidth);
      if (over > 391) bug('P0', 'iOS Safari', f, '横向溢出 doc=' + over);
    }
    console.log('  ' + (errs.length ? '✗ 报错 ' + errs.length + ' 条：' + errs.slice(0, 3).join(' | ') : '✓ 15 页无 JS 报错'));

    // 关键层可见性
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const o = document.querySelector('.ad-overlay'); if (o) o.remove(); });
    const layers = await page.evaluate(() => {
      const r = {};
      window.Jiangcheng.openSearch();
      const s = document.querySelector('.search-overlay');
      const sr = s ? s.getBoundingClientRect() : null;
      r.search = sr ? { w: Math.round(sr.width), h: Math.round(sr.height) } : null;
      if (s) s.remove();
      document.body.classList.remove('no-scroll');
      return r;
    });
    if (!layers.search || layers.search.w < 388 || layers.search.h < 840) {
      bug('P0', 'iOS Safari', '搜索浮层', '塌陷/未铺满：' + JSON.stringify(layers.search));
    } else {
      console.log('  ✓ 搜索浮层铺满 ' + layers.search.w + 'x' + layers.search.h);
    }

    // 进群弹窗 + 二维码
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const o = document.querySelector('.ad-overlay'); if (o) o.remove(); });
    await page.evaluate(() => { const b = document.querySelector('.js-group-entry'); if (b) b.click(); });
    await page.waitForTimeout(700);
    const qr = await page.evaluate(() => {
      const ov = document.querySelector('.ad-overlay');
      if (!ov) return { ok: false };
      const r = ov.getBoundingClientRect();
      const imgs = [...ov.querySelectorAll('img')];
      return { ok: true, w: Math.round(r.width), h: Math.round(r.height), imgs: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length };
    });
    if (!qr.ok || qr.w < 388) bug('P0', 'iOS Safari', '进群弹窗', '遮罩塌陷：' + JSON.stringify(qr));
    else if (qr.loaded < qr.imgs) bug('P1', 'iOS Safari', '进群弹窗', '二维码未全部加载 ' + qr.loaded + '/' + qr.imgs);
    else console.log('  ✓ 进群弹窗铺满 ' + qr.w + 'x' + qr.h + '，二维码 ' + qr.loaded + '/' + qr.imgs);

    // 分享海报（canvas 在 WebKit 下）
    await page.evaluate(() => { const o = document.querySelector('.ad-overlay'); if (o) o.remove(); });
    await page.goto(BASE + '/sushe.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const o = document.querySelector('.ad-overlay'); if (o) o.remove(); });
    const poster = await page.evaluate(() => new Promise(res => {
      if (!window.Jiangcheng || !window.Jiangcheng.showPoster) return res(null);
      window.Jiangcheng.showPoster();
      setTimeout(() => {
        const img = document.querySelector('.poster-img');
        res(img ? { w: img.naturalWidth, h: img.naturalHeight, len: (img.src || '').length } : null);
      }, 2200);
    }));
    if (!poster || poster.w !== 750) bug('P1', 'iOS Safari', '分享海报', '生成异常：' + JSON.stringify(poster));
    else console.log('  ✓ 海报生成 ' + poster.w + 'x' + poster.h);

    // 搜索 fetch 链路
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const o = document.querySelector('.ad-overlay'); if (o) o.remove(); });
    await page.evaluate(() => window.Jiangcheng.openSearch());
    await page.waitForTimeout(300);
    await page.fill('.search-input', '床');
    await page.waitForTimeout(900);
    const n = await page.$$eval('.sr-item', els => els.length);
    if (!n) bug('P0', 'iOS Safari', '搜索', '搜「床」无结果（fetch/索引失败）');
    else console.log('  ✓ 搜索「床」命中 ' + n + ' 条');

    await ctx.close();
    await wb.close();
  } catch (e) {
    hasWebkit = false;
    console.log('  ⚠ WebKit 未安装或启动失败，跳过：' + String(e.message).split('\n')[0]);
  }

  /* ---------- 报告 ---------- */
  console.log('\n====================================================');
  const p0 = issues.filter(i => i.level === 'P0');
  const p1 = issues.filter(i => i.level === 'P1');
  const p2 = issues.filter(i => i.level === 'P2');

  if (p0.length) {
    console.log('\n【P0 阻断】' + p0.length + ' 条');
    p0.slice(0, 20).forEach(i => console.log('  ✗ [' + i.dev + '] ' + i.page + ' — ' + i.msg));
  }
  if (p1.length) {
    console.log('\n【P1 影响体验】' + p1.length + ' 条');
    p1.slice(0, 20).forEach(i => console.log('  ! [' + i.dev + '] ' + i.page + ' — ' + i.msg));
  }
  if (p2.length) {
    console.log('\n【P2 建议优化】' + p2.length + ' 条（去重后示例）');
    const seen = new Set();
    p2.forEach(i => {
      const k = i.msg.replace(/\d+/g, '#');
      if (seen.has(k)) return;
      seen.add(k);
      if (seen.size <= 12) console.log('  · [' + i.dev + '] ' + i.page + ' — ' + i.msg);
    });
  }
  if (!issues.length) console.log('\n✓ 全机型无问题');
  console.log('\n截图目录：.audit/mobile/');
  console.log('WebKit(iOS Safari 真内核)：' + (hasWebkit ? '已测' : '未测'));
  console.log('');
}

function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

main().catch(e => { console.error('脚本异常：', e); process.exit(1); });
