// 深度体验体检：从「用户完成任务的效率」而非「页面有没有报错」出发
// 测量：页面长度 / 首屏信息量 / 折叠成本 / 读完之后去哪 / 回顶成本 / 锚点落点
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8899';
const PAGES = [
  'index.html', 'xinsheng.html', 'jiaotong.html', 'sushe.html', 'junxun.html',
  'xiaoqu.html', 'rushi.html', 'xueye.html', 'shenghuo.html',
  'jiangzhu.html', 'shetuan.html', 'zuzhi.html', 'jingsai.html', 'tice.html',
];

(async () => {
  const b = await webkit.launch();
  const p = await b.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  const rows = [];
  const issues = [];

  for (const page of PAGES) {
    const url = BASE + '/' + page;
    const res = await p.goto(url, { waitUntil: 'networkidle' }).catch(() => null);
    if (!res || !res.ok()) {
      issues.push(['404', page, '页面打不开']);
      continue;
    }
    await p.waitForTimeout(300);

    const m = await p.evaluate(() => {
      const H = document.documentElement.scrollHeight;
      const VH = window.innerHeight;
      const accs = document.querySelectorAll('.acc');
      const accOpen = document.querySelectorAll('.acc.open, .acc[open]');
      // 首屏（第一屏 844px 内）能看到多少个可点内容入口
      const inFirst = [];
      document.querySelectorAll('a, .acc-q, .mitem, .chip, .ticket, .pn-chip').forEach(function (el) {
        const r = el.getBoundingClientRect();
        if (r.top >= 0 && r.top < window.innerHeight && r.height > 0) inFirst.push(el);
      });
      // 正文字数
      const text = (document.body.innerText || '').replace(/\s+/g, '');
      // 是否有「读完去哪」的下一步引导（页尾）
      const tailLinks = [];
      const foot = document.querySelector('.chap-foot');
      if (foot) foot.querySelectorAll('a').forEach(function (a) { tailLinks.push(a.textContent.trim()); });
      // 回顶按钮
      const hasTop = !!document.querySelector('.to-top');
      // 章节数
      const secs = document.querySelectorAll('.sec, section[id], .block').length;
      // 锚点目标
      const anchors = [];
      document.querySelectorAll('[id]').forEach(function (el) {
        if (/^b\d+$/.test(el.id)) anchors.push(el.id);
      });
      return {
        H: H, VH: VH, screens: +(H / VH).toFixed(1),
        acc: accs.length, accOpen: accOpen.length,
        firstScreenEntries: inFirst.length,
        chars: text.length,
        tailLinks: tailLinks,
        hasTop: hasTop,
        secs: secs,
        anchors: anchors.length,
      };
    });

    rows.push(Object.assign({ page: page }, m));

    // 判定
    if (m.screens > 12) issues.push(['长', page, '页面长达 ' + m.screens + ' 屏（' + m.chars + ' 字），缺少中途导航会读丢']);
    if (m.acc > 0 && m.accOpen === 0) issues.push(['折叠', page, m.acc + ' 个手风琴全部默认收起，首屏看不到任何答案']);
    if (!m.hasTop && m.screens > 6) issues.push(['回顶', page, '超过 6 屏但没有回顶入口']);
    if (page !== 'index.html' && m.tailLinks.length === 0) issues.push(['断头', page, '读到页尾没有「下一章」引导，路径断头']);
    if (m.firstScreenEntries < 3 && page !== 'index.html') issues.push(['首屏', page, '首屏仅 ' + m.firstScreenEntries + ' 个可点入口，进入后不知道往哪走']);
  }

  // 锚点落点准确性：从搜索结果跳过去，看目标是否被顶部栏遮住
  await p.goto(BASE + '/tice.html#b4', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const anchorTop = await p.evaluate(() => {
    const el = document.getElementById('b4');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const bar = document.querySelector('.topbar, .page-head, .nav-bar');
    const barH = bar ? bar.getBoundingClientRect().height : 0;
    return { top: Math.round(r.top), barH: Math.round(barH) };
  });
  if (anchorTop && anchorTop.top < anchorTop.barH) {
    issues.push(['锚点', 'tice.html#b4', '跳转后目标顶部在 ' + anchorTop.top + 'px，被 ' + anchorTop.barH + 'px 顶栏遮挡']);
  }

  // 输出
  console.log('\n========== 深度体验体检 ==========\n');
  console.log('页面'.padEnd(16) + '屏数'.padEnd(7) + '字数'.padEnd(8) + '折叠'.padEnd(8) + '首屏入口'.padEnd(9) + '页尾引导'.padEnd(9) + '回顶');
  rows.forEach(function (r) {
    console.log(
      r.page.padEnd(16) +
      String(r.screens).padEnd(8) +
      String(r.chars).padEnd(9) +
      (r.accOpen + '/' + r.acc).padEnd(9) +
      String(r.firstScreenEntries).padEnd(12) +
      String(r.tailLinks.length).padEnd(12) +
      (r.hasTop ? '有' : '无')
    );
  });

  console.log('\n---------- 发现的问题 ----------\n');
  if (!issues.length) console.log('  ✓ 无');
  const grouped = {};
  issues.forEach(function (i) { (grouped[i[0]] = grouped[i[0]] || []).push(i); });
  Object.keys(grouped).forEach(function (k) {
    console.log('【' + k + '】 ' + grouped[k].length + ' 处');
    grouped[k].slice(0, 20).forEach(function (i) { console.log('   · ' + i[1] + ' —— ' + i[2]); });
  });

  const out = path.join('.audit', 'ux-deep.md');
  fs.mkdirSync('.audit', { recursive: true });
  let md = '# 深度体验体检\n\n| 页面 | 屏数 | 字数 | 展开/折叠 | 首屏入口 | 页尾引导 | 回顶 |\n|---|---|---|---|---|---|---|\n';
  rows.forEach(function (r) {
    md += '| ' + r.page + ' | ' + r.screens + ' | ' + r.chars + ' | ' + r.accOpen + '/' + r.acc + ' | ' + r.firstScreenEntries + ' | ' + r.tailLinks.length + ' | ' + (r.hasTop ? '有' : '无') + ' |\n';
  });
  md += '\n## 问题\n\n';
  issues.forEach(function (i) { md += '- **[' + i[0] + ']** `' + i[1] + '` ' + i[2] + '\n'; });
  fs.writeFileSync(out, md);
  console.log('\n已写入 ' + out);

  await b.close();
})();
