/**
 * 第 5 轮体检工具 —— 无障碍 / 视觉层次 / 键盘可达
 *
 * 与前几轮工具的分工：
 *   audit.js       结构与元信息（有没有）
 *   ux-review.js   内容完整性（写没写）
 *   ux-deep.js     路径与效率（找不找得到）
 *   a11y-check.js  可读与可达（看不看得清、用不用得了）  ← 本文件
 *
 * 跑法：
 *   python3 -m http.server 8899   （在 handbook/ 下）
 *   NODE_PATH=... node tools/a11y-check.js
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8899';
const OUT = path.join(__dirname, '..', '.audit');

const PAGES = [
  'index.html', 'xinsheng.html', 'rushi.html', 'junxun.html', 'sushe.html',
  'shenghuo.html', 'xiaoqu.html', 'jiaotong.html', 'xueye.html', 'jiangzhu.html',
  'shetuan.html', 'zuzhi.html', 'jingsai.html', 'tice.html'
];

/* ---------- 页面内执行的采集逻辑 ---------- */
const COLLECT = () => {
  /* --- WCAG 相对亮度与对比度 --- */
  function lum(rgb) {
    const c = rgb.map(v => {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function parseRGB(s) {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x.trim()));
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  }
  /* 逐层向上找到第一个不透明背景色 */
  function effectiveBg(el) {
    let n = el;
    while (n && n !== document.documentElement) {
      const b = parseRGB(getComputedStyle(n).backgroundColor);
      if (b && b.a >= 0.95) return b.rgb;
      n = n.parentElement;
    }
    return [255, 255, 255];
  }
  function contrast(fg, bg) {
    const l1 = lum(fg), l2 = lum(bg);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  const out = {
    contrast: [],      // 对比度不达标
    unnamed: [],       // 可交互元素没有可访问名称
    headingJump: [],   // 标题层级跳跃
    noFocusStyle: 0,   // 无焦点样式（整站级，稍后判定）
    langMissing: !document.documentElement.getAttribute('lang'),
    landmarks: {},     // 地标元素
    tabbables: 0,      // 可 Tab 到的元素数
    longPara: [],      // 超长纯文本段
    density: []        // 单屏信息密度异常
  };

  /* --- 1. 文本对比度 --- */
  const seen = new Set();
  document.querySelectorAll('body *').forEach(el => {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
    // 只看直接含文字的节点
    const own = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3 && n.textContent.trim())
      .map(n => n.textContent.trim()).join('');
    if (!own || own.length < 2) return;

    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.3) return;

    const fg = parseRGB(cs.color);
    if (!fg) return;
    const bg = effectiveBg(el);
    const ratio = contrast(fg.rgb, bg);

    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3.0 : 4.5;

    if (ratio < need) {
      const key = cs.color + '|' + bg.join(',') + '|' + Math.round(size);
      if (seen.has(key)) return;
      seen.add(key);
      out.contrast.push({
        sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        text: own.slice(0, 24),
        ratio: Math.round(ratio * 100) / 100,
        need,
        size: Math.round(size),
        fg: cs.color,
        bg: 'rgb(' + bg.join(',') + ')'
      });
    }
  });

  /* --- 2. 可交互元素的可访问名称 --- */
  document.querySelectorAll('a,button,[role="button"],input,select,textarea').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const name = (el.getAttribute('aria-label') || '')
      + (el.getAttribute('title') || '')
      + (el.textContent || '').trim()
      + (el.getAttribute('alt') || '')
      + (el.getAttribute('placeholder') || '');
    if (!name.trim()) {
      out.unnamed.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 40),
        html: el.outerHTML.slice(0, 80)
      });
    }
  });

  /* --- 3. 标题层级 --- */
  let prev = 0;
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    const lv = parseInt(h.tagName[1], 10);
    if (prev && lv > prev + 1) {
      out.headingJump.push({ from: 'h' + prev, to: 'h' + lv, text: h.textContent.trim().slice(0, 24) });
    }
    prev = lv;
  });

  /* --- 4. 地标 --- */
  out.landmarks = {
    header: document.querySelectorAll('header,[role="banner"]').length,
    nav: document.querySelectorAll('nav,[role="navigation"]').length,
    main: document.querySelectorAll('main,[role="main"]').length,
    footer: document.querySelectorAll('footer,[role="contentinfo"]').length,
    skipLink: !!document.querySelector('a[href^="#"].skip-link, .skip-to-content')
  };

  /* --- 5. Tab 序列长度 --- */
  out.tabbables = document.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'
  ).length;

  /* --- 6. 超长纯文本段（一口气读不完） --- */
  document.querySelectorAll('p,li,.li,.tip,.note').forEach(el => {
    const t = (el.textContent || '').trim();
    if (t.length > 160) out.longPara.push({ len: t.length, text: t.slice(0, 40) });
  });

  /* --- 7. 单屏密度：连续无视觉分隔的文本高度 --- */
  const vh = window.innerHeight;
  document.querySelectorAll('.block').forEach(b => {
    const r = b.getBoundingClientRect();
    const hasBreak = b.querySelector('.card,.tip,.warn,.step,.kv,table,.grid,.chip,.badge,ul,ol');
    if (r.height > vh * 1.6 && !hasBreak) {
      out.density.push({
        id: b.id || '',
        screens: Math.round(r.height / vh * 10) / 10,
        title: (b.querySelector('h3,h2') || {}).textContent?.trim().slice(0, 20) || ''
      });
    }
  });

  return out;
};

(async () => {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const report = [];
  let totalIssues = 0;

  for (const p of PAGES) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 100)));

    const t0 = Date.now();
    const resp = await page.goto(`${BASE}/${p}`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const loadMs = Date.now() - t0;

    if (!resp || resp.status() >= 400) {
      report.push({ page: p, fatal: `HTTP ${resp ? resp.status() : 'ERR'}` });
      totalIssues++;
      await page.close();
      continue;
    }

    const data = await page.evaluate(COLLECT);

    /* --- 键盘可达：Tab 走 12 步，看焦点是否可见 --- */
    let focusInvisible = 0, tabTrail = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        const hasRing = cs.boxShadow && cs.boxShadow !== 'none';
        return {
          tag: el.tagName.toLowerCase(),
          txt: (el.textContent || '').trim().slice(0, 14),
          visible: r.width > 0 && r.height > 0,
          ring: hasOutline || hasRing,
          inView: r.top >= -5 && r.top < window.innerHeight
        };
      });
      if (!info) break;
      tabTrail.push(info);
      if (info.visible && !info.ring) focusInvisible++;
    }

    const issues = [];
    if (data.langMissing) issues.push('html 缺 lang 属性');
    if (data.contrast.length) issues.push(`对比度不达标 ${data.contrast.length} 类`);
    if (data.unnamed.length) issues.push(`无名可交互元素 ${data.unnamed.length} 个`);
    if (data.headingJump.length) issues.push(`标题层级跳跃 ${data.headingJump.length} 处`);
    if (!data.landmarks.main) issues.push('缺 main 地标');
    if (!data.landmarks.skipLink) issues.push('缺跳至正文链接');
    if (focusInvisible > 0) issues.push(`焦点不可见 ${focusInvisible}/${tabTrail.length} 步`);
    if (data.longPara.length) issues.push(`超长段落 ${data.longPara.length} 处`);
    if (data.density.length) issues.push(`大段无分隔 ${data.density.length} 块`);
    if (errs.length) issues.push(`JS 报错 ${errs.length}`);

    totalIssues += issues.length;
    report.push({ page: p, loadMs, data, focusInvisible, tabTrail, issues, errs });
    await page.close();
  }

  await browser.close();

  /* ---------- 输出 ---------- */
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  let md = '# 第 5 轮体检 · 无障碍 / 视觉层次 / 键盘可达\n\n';
  md += `采集时间：${new Date().toLocaleString('zh-CN')}\n\n`;
  md += `视口 390×844（Webkit 真内核）· 共 ${PAGES.length} 页 · 问题项 ${totalIssues}\n\n`;

  md += '## 总览\n\n| 页面 | 加载 ms | 对比度 | 无名元素 | 焦点可见 | 超长段 | 密度 | 问题 |\n|---|---|---|---|---|---|---|---|\n';
  for (const r of report) {
    if (r.fatal) { md += `| ${r.page} | - | - | - | - | - | - | ${r.fatal} |\n`; continue; }
    md += `| ${r.page} | ${r.loadMs} | ${r.data.contrast.length} | ${r.data.unnamed.length} | ${r.tabTrail.length - r.focusInvisible}/${r.tabTrail.length} | ${r.data.longPara.length} | ${r.data.density.length} | ${r.issues.length} |\n`;
  }

  md += '\n## 明细\n';
  for (const r of report) {
    if (r.fatal) continue;
    if (!r.issues.length) { md += `\n### ${r.page} —— 无问题\n`; continue; }
    md += `\n### ${r.page}\n\n`;
    r.issues.forEach(i => md += `- ${i}\n`);
    if (r.data.contrast.length) {
      md += '\n对比度：\n\n| 元素 | 文本 | 实测 | 需要 | 字号 | 前景 | 背景 |\n|---|---|---|---|---|---|---|\n';
      r.data.contrast.forEach(c =>
        md += `| ${c.sel} | ${c.text} | ${c.ratio} | ${c.need} | ${c.size} | ${c.fg} | ${c.bg} |\n`);
    }
    if (r.data.unnamed.length) {
      md += '\n无名可交互元素：\n\n';
      r.data.unnamed.slice(0, 8).forEach(u => md += `- \`${u.html.replace(/\n/g, ' ')}\`\n`);
    }
    if (r.data.headingJump.length) {
      md += '\n标题跳跃：\n\n';
      r.data.headingJump.forEach(h => md += `- ${h.from} → ${h.to}（${h.text}）\n`);
    }
    if (r.data.longPara.length) {
      md += '\n超长段落：\n\n';
      r.data.longPara.slice(0, 6).forEach(l => md += `- ${l.len} 字：${l.text}…\n`);
    }
    if (r.data.density.length) {
      md += '\n大段无分隔：\n\n';
      r.data.density.forEach(d => md += `- #${d.id} ${d.title} · ${d.screens} 屏\n`);
    }
    if (r.errs.length) {
      md += '\nJS 报错：\n\n';
      r.errs.forEach(e => md += `- ${e}\n`);
    }
  }

  fs.writeFileSync(path.join(OUT, 'a11y.md'), md, 'utf8');
  console.log(md.split('\n## 明细')[0]);
  console.log(`\n>>> 完整报告：.audit/a11y.md  · 问题项合计 ${totalIssues}`);
})();
