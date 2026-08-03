#!/usr/bin/env node
/* ============================================================
   江城 · 新生手册 —— 全站搜索索引生成器
   ------------------------------------------------------------
   用法：node tools/build-search.js
   作用：
     1. 扫描 handbook/*.html，为每个 .block 注入稳定锚点 id（幂等）
     2. 抽取「块标题 / 手风琴问题 / 清单条目 / 链接行」为检索条目
     3. 输出 handbook/search.json（前端直接 fetch，无需构建）

   设计约定：
     - 纯 Node 标准库，零依赖，不引入构建步骤
     - 可重复执行：已有 id 的块不会被改写，产物稳定可 diff
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'handbook');
const OUT = path.join(DIR, 'search.json');

/* 页面元信息：决定搜索结果里显示的模块名与顺序 */
const PAGES = [
  { file: 'xinsheng.html', name: '新生必看', icon: '📋' },
  { file: 'jiaotong.html', name: '交通快递', icon: '🚄' },
  { file: 'sushe.html', name: '宿舍指南', icon: '🛏' },
  { file: 'junxun.html', name: '军训攻略', icon: '🎖' },
  { file: 'xiaoqu.html', name: '校园服务', icon: '💳' },
  { file: 'rushi.html', name: '入学测试', icon: '📝' },
  { file: 'xueye.html', name: '学业指南', icon: '📚' },
  { file: 'shenghuo.html', name: '吃住问答', icon: '🍜' },
  // growth.html 已并入 xueye.html#b11（第4轮），仅保留跳转页，不进索引
  { file: 'jiangzhu.html', name: '奖助学金', icon: '💰' },
  { file: 'shetuan.html', name: '社团一览', icon: '🎭' },
  { file: 'zuzhi.html', name: '学生组织', icon: '🏛' },
  { file: 'jingsai.html', name: '竞赛活动', icon: '🏆' },
  { file: 'tice.html', name: '体育体测', icon: '🏃' }
];

/* ---------- 工具 ---------- */
function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(s, n) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/* 提取一段起始标签对应的完整元素（处理 div 嵌套） */
function sliceElement(html, startIdx) {
  const openTag = /<div\b[^>]*>/g;
  const closeTag = /<\/div>/g;
  let depth = 0;
  let i = startIdx;
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = startIdx;
  let m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') {
      depth--;
      if (depth === 0) return html.slice(startIdx, m.index + m[0].length);
    } else {
      depth++;
    }
    i = re.lastIndex;
  }
  void openTag; void closeTag; void i;
  return html.slice(startIdx);
}

/* ---------- 主流程 ---------- */
const index = [];
let injected = 0;
let scanned = 0;

for (const page of PAGES) {
  const fp = path.join(DIR, page.file);
  if (!fs.existsSync(fp)) {
    console.warn(`  ! 跳过（文件不存在）：${page.file}`);
    continue;
  }
  let html = fs.readFileSync(fp, 'utf8');
  let changed = false;
  let blockNo = 0;

  /* 1) 为每个 .block 注入锚点 id */
  html = html.replace(/<div class="block([^"]*)"([^>]*)>/g, (full, rest, attrs) => {
    blockNo++;
    if (/\bid=/.test(attrs)) return full;
    changed = true;
    injected++;
    return `<div class="block${rest}" id="b${blockNo}"${attrs}>`;
  });

  if (changed) fs.writeFileSync(fp, html, 'utf8');
  scanned++;

  /* 2) 抽取检索条目 */
  const blockRe = /<div class="block[^"]*" id="(b\d+)"[^>]*>/g;
  let bm;
  while ((bm = blockRe.exec(html))) {
    const anchor = bm[1];
    const body = sliceElement(html, bm.index);

    // 块标题
    const h3 = body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const title = h3 ? stripTags(h3[1]) : '';
    const text = stripTags(body);
    // 纯导航块（"还想知道更多 / 还有疑问问谁"）不进索引，避免搜索结果被链接列表污染
    const isNav = /^(还想知道更多|还有疑问|相关阅读|延伸阅读|官方入口)/.test(title);
    if ((title || text) && !isNav) {
      index.push({
        p: page.file, n: page.name, i: page.icon, a: anchor,
        t: title || page.name,
        d: clip(text.replace(title, '').trim(), 80),
        k: clip(text, 170)
      });
    }

    // 手风琴问题单独成条 —— 用户往往直接搜问题
    const accRe = /<button class="acc-q"[^>]*>([\s\S]*?)<\/button>/g;
    let am;
    while ((am = accRe.exec(body))) {
      const q = stripTags(am[1]).replace(/›\s*$/, '').trim();
      if (!q) continue;
      const after = body.slice(am.index);
      const ansM = after.match(/<div class="acc-a-inner"[^>]*>([\s\S]*?)<\/div>/);
      const ans = ansM ? stripTags(ansM[1]) : '';
      index.push({
        p: page.file, n: page.name, i: page.icon, a: anchor,
        t: q, d: clip(ans, 80), k: clip(q + ' ' + ans, 170), q: 1
      });
    }
  }
}

/* 首页高频入口也进索引 */
index.push({ p: 'index.html', n: '首页', i: '🏠', a: 'stage1', t: '开学前必做八件事', d: '缴费 / 材料 / 床品 / 军训用品 / 入学测试，勾着做不会漏', k: '必做 清单 开学前 准备 checklist 八件事' });

fs.writeFileSync(OUT, JSON.stringify(index), 'utf8');

console.log(`✓ 扫描 ${scanned} 个页面，注入锚点 ${injected} 个`);
console.log(`✓ 生成检索条目 ${index.length} 条 → handbook/search.json （${(fs.statSync(OUT).size / 1024).toFixed(1)} KB）`);
