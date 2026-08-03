#!/usr/bin/env node
/* ============================================================
   江城 · 新生手册 —— 上线前静态体检
   用法：node tools/audit.js
   检查项：
     1. 内链 / 图片 / 附件是否存在（死链）
     2. 页面级规范：data-page、脚本链、OG 四件套、分享按钮、进群入口
     3. 内容风险：过期年份、旧群文案、旧站残留、inline style
     4. 资源体积
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'handbook');

const problems = [];
const warns = [];
function bad(f, m) { problems.push(`${f}: ${m}`); }
function warn(f, m) { warns.push(`${f}: ${m}`); }

const htmlFiles = fs.readdirSync(DIR).filter(f => f.endsWith('.html')).sort();

/* ---------- 1. 逐页检查 ---------- */
for (const f of htmlFiles) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const isHome = f === 'index.html';

  // 跳转页（章节合并后保留的旧链接落点）不按模块页标准检查，
  // 只要求它确实会跳走、且不进搜索引擎。
  if (/<meta\s+http-equiv="refresh"/i.test(src)) {
    if (!/<meta\s+name="robots"[^>]*noindex/i.test(src)) bad(f, '跳转页缺 noindex');
    if (!/location\.replace\(/.test(src)) bad(f, '跳转页缺 JS 兜底跳转');
    if (!/<link\s+rel="canonical"/i.test(src)) bad(f, '跳转页缺 canonical');
    continue;
  }

  // data-page
  const dp = src.match(/<body[^>]*data-page="([^"]+)"/);
  if (!dp) bad(f, '缺 data-page（模块配色与首页逻辑都依赖它）');
  else if (!isHome && dp[1] !== f.replace('.html', '')) {
    bad(f, `data-page="${dp[1]}" 与文件名不符`);
  }

  // 脚本链
  const scripts = [...src.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
  if (scripts.join('|') !== 'js/config.js|js/app.js') {
    bad(f, `脚本链应为 config.js → app.js，实际为 [${scripts.join(', ')}]`);
  }
  if (/type="module"/.test(src)) bad(f, '仍有 type="module"');

  // OG 四件套
  ['og:title', 'og:description', 'og:image', 'og:url'].forEach(k => {
    if (!src.includes(`property="${k}"`)) bad(f, `缺 ${k}`);
  });
  const ogUrl = src.match(/property="og:url" content="([^"]+)"/);
  if (ogUrl && !isHome && !ogUrl[1].endsWith(f)) warn(f, `og:url 指向 ${ogUrl[1]}，与文件名不一致`);

  // 分享 / 进群入口
  if (!isHome && !src.includes('id="shareBtn"')) bad(f, '模块页缺分享按钮');
  if (!/id="groupEntry"|js-group-entry/.test(src)) bad(f, '缺进群入口');

  // 死链：站内 html
  [...src.matchAll(/href="([^"#:]+\.html)/g)].forEach(m => {
    if (!fs.existsSync(path.join(DIR, m[1]))) bad(f, `死链 → ${m[1]}`);
  });
  // 死链：本地资源
  [...src.matchAll(/(?:href|src)="((?:images|assets|css|js)\/[^"]+)"/g)].forEach(m => {
    if (!fs.existsSync(path.join(DIR, m[1]))) bad(f, `资源缺失 → ${m[1]}`);
  });
  // 附件类死链（旧版本大量存在）
  if (/assets\/docs\//.test(src)) bad(f, '仍引用 assets/docs 附件');

  // 内容风险
  if (/吃喝玩乐群|新生答疑群/.test(src)) bad(f, '旧群文案未统一');
  if (/内测|解锁|密钥/.test(src)) bad(f, '内测/解锁字样残留');
  if (/jiangcheng-eats\.netlify/.test(src)) bad(f, '引用了已 404 的旧美食站');
  if (/style="/.test(src)) warn(f, 'inline style 残留');

  // 过期年份（正文里出现 2024 且非"往年存档"语境的，人工确认）
  const y2024 = (src.match(/2024/g) || []).length;
  if (y2024 && !/往年|存档|2024 级/.test(src)) warn(f, `出现 ${y2024} 处 2024，确认是否过期表述`);
}

/* ---------- 2. 索引 / 配置 ---------- */
const searchPath = path.join(DIR, 'search.json');
if (!fs.existsSync(searchPath)) bad('search.json', '缺失，搜索会空转');
else {
  const idx = JSON.parse(fs.readFileSync(searchPath, 'utf8'));
  idx.forEach(it => {
    if (!fs.existsSync(path.join(DIR, it.p))) bad('search.json', `指向不存在的页面 ${it.p}`);
  });
  const anchorMiss = idx.filter(it => {
    const html = fs.readFileSync(path.join(DIR, it.p), 'utf8');
    return it.a.startsWith('b') && !html.includes(`id="${it.a}"`);
  });
  if (anchorMiss.length) bad('search.json', `${anchorMiss.length} 条锚点在页面中不存在（需重跑 build-search）`);
}

const cfg = fs.readFileSync(path.join(DIR, 'js', 'config.js'), 'utf8');
[...cfg.matchAll(/qrCode:\s*'([^']+)'/g)].forEach(m => {
  if (!fs.existsSync(path.join(DIR, m[1]))) bad('config.js', `二维码文件缺失 → ${m[1]}`);
});
if (/AMAP|amapKey|__AMAP_CONFIG__/.test(cfg)) bad('config.js', '高德 Key 残留（已裸奔过一次）');

/* ---------- 3. 体积 ---------- */
const sizes = [];
function walk(d, base = '') {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(fp, rel); }
    else sizes.push([rel, fs.statSync(fp).size]);
  }
}
walk(DIR);
const heavy = sizes.filter(([, s]) => s > 100 * 1024).sort((a, b) => b[1] - a[1]);
const total = sizes.reduce((a, [, s]) => a + s, 0);

/* ---------- 输出 ---------- */
console.log(`\n扫描 ${htmlFiles.length} 个页面 · 站点总体积 ${(total / 1024).toFixed(0)} KB\n`);
if (heavy.length) {
  console.log('体积较大的文件：');
  heavy.forEach(([f, s]) => console.log(`  ${(s / 1024).toFixed(0).padStart(4)} KB  ${f}`));
  console.log('');
}
if (problems.length) {
  console.log(`✗ 必须修（${problems.length}）：`);
  problems.forEach(p => console.log('  · ' + p));
} else {
  console.log('✓ 无阻断性问题');
}
if (warns.length) {
  console.log(`\n△ 需人工确认（${warns.length}）：`);
  warns.forEach(p => console.log('  · ' + p));
}
console.log('');
process.exit(problems.length ? 1 : 0);
