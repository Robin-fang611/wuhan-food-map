/* eslint-disable */
/**
 * UX 审查脚本 —— 以产品经理视角扫描全站 HTML
 * 输出可直接写入 docs/迭代计划/第N轮-*.md 的问题清单
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BASE = path.join(__dirname, '..', 'handbook');
const files = fs.readdirSync(BASE).filter(f => f.endsWith('.html') && f !== 'template.html').sort();

const issues = [];
function add(level, page, msg) { issues.push({ level, page, msg }); }

files.forEach(f => {
  const html = fs.readFileSync(path.join(BASE, f), 'utf-8');
  const dom = new JSDOM(html, { includeNodeLocations: false });
  const doc = dom.window.document;

  // 1. 标题层级与重复
  const h3s = [...doc.querySelectorAll('.block h3')].map(el => el.textContent.trim());
  const seen = new Set();
  h3s.forEach((t, i) => {
    if (!t) add('P1', f, '空 block 标题');
    if (seen.has(t)) add('P1', f, '重复 block 标题：「' + t + '」');
    seen.add(t);
  });

  // 2. 空组件
  doc.querySelectorAll('.note, .ticket, .check, .acc-item, .linkrow, .spot, .mrow, .tl-row').forEach((el, i) => {
    const txt = el.textContent.trim();
    if (!txt) add('P1', f, '空组件：.' + (el.className || '').split(' ')[0]);
  });

  // 3. 连续空段落
  doc.querySelectorAll('p').forEach(p => {
    if (!p.textContent.trim() && !p.querySelector('img')) add('P2', f, '空 <p> 标签');
  });

  // 4. 图片缺 alt
  doc.querySelectorAll('img').forEach(img => {
    if (!img.getAttribute('alt') && !img.classList.contains('qr') && !img.closest('.poster')) {
      add('P2', f, '图片缺 alt：' + (img.src || '').split('/').pop());
    }
  });

  // 5. 内部链接 404 风险（只检查相对 .html，跳过 JS 占位）
  doc.querySelectorAll('a[href]').forEach(a => {
    const h = a.getAttribute('href');
    if (!h || h.startsWith('http') || h.startsWith('#') || h.startsWith('mailto:') || h.startsWith('tel:') || h.startsWith('javascript:')) return;
    const target = h.split('#')[0];
    if (!fs.existsSync(path.join(BASE, target))) add('P0', f, '死链接：' + h);
  });

  // 6. 内容重复信号：完全相同的 .note 或 .ticket 文本在同一页出现多次
  const noteTxts = [...doc.querySelectorAll('.note')].map(e => e.textContent.trim());
  const ticketTxts = [...doc.querySelectorAll('.ticket .m h4')].map(e => e.textContent.trim());
  const dup = arr => arr.filter((item, idx) => arr.indexOf(item) !== idx);
  [...new Set(dup(noteTxts))].forEach(t => add('P2', f, '同一页 .note 文本重复：「' + t.slice(0, 30) + '…」'));
  [...new Set(dup(ticketTxts))].forEach(t => add('P2', f, '同一页 ticket 标题重复：「' + t + '」'));

  // 7. 过长段落（影响手机阅读）—— 只统计直接段落与 note，手风琴内部已由列表/换行拆分
  doc.querySelectorAll('.block > p, .note').forEach(el => {
    const txt = el.textContent.trim();
    if (txt.length > 220) add('P2', f, '段落过长（' + txt.length + '字）：「' + txt.slice(0, 30) + '…」');
  });

  // 8. 页面必备元素（tabbar/backBtn/shareBtn/groupEntry 由 JS 注入，只检查 HTML 中是否有触发锚点）
  if (f !== 'index.html' && !doc.querySelector('#backBtn') && !doc.querySelector('.back')) add('P1', f, '缺少返回按钮');
  if (!doc.querySelector('#shareBtn') && !doc.querySelector('.share-btn') && !doc.querySelector('.js-share')) add('P1', f, '缺少分享按钮');
  if (!doc.querySelector('#groupEntry') && !doc.querySelector('.group-entry') && !doc.querySelector('.js-group-entry')) add('P1', f, '缺少进群入口');
  if (!doc.querySelector('[data-page]')) add('P1', f, 'body 缺少 data-page');
});

// 9. 跨页重复标题
const allH3 = {};
files.forEach(f => {
  const html = fs.readFileSync(path.join(BASE, f), 'utf-8');
  const dom = new JSDOM(html, { includeNodeLocations: false });
  [...dom.window.document.querySelectorAll('.block h3')].forEach(el => {
    const t = el.textContent.trim();
    if (!t) return;
    allH3[t] = (allH3[t] || []).concat(f);
  });
});
Object.entries(allH3).forEach(([t, pages]) => {
  const ignore = ['官方入口', '还想知道更多', '延伸阅读', '相关阅读', '还有疑问'];
  if (pages.length > 1 && !ignore.some(k => t.includes(k))) {
    add('P2', pages.join(', '), '跨页重复 block 标题：「' + t + '」');
  }
});

console.log('\n========== UX 审查报告 ==========\n');
['P0', 'P1', 'P2'].forEach(lv => {
  const list = issues.filter(i => i.level === lv);
  if (!list.length) return;
  console.log('【' + lv + '】' + list.length + ' 条');
  list.slice(0, 30).forEach(i => console.log('  · [' + i.page + '] ' + i.msg));
  console.log('');
});
if (!issues.length) console.log('✓ 未发现明显问题\n');

// 输出 markdown 片段，方便直接贴进文档
const md = issues.map(i => '- **' + i.level + '** · `' + i.page + '` · ' + i.msg).join('\n');
fs.writeFileSync(path.join(__dirname, '..', '.audit', 'ux-review.md'), '# UX 审查结果\n\n' + md + '\n');
console.log('已写入 .audit/ux-review.md');
