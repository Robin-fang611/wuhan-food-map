/**
 * 对比度求解器 —— 在保持色相/饱和度不变的前提下，
 * 求出满足 WCAG AA 的最小加深量（只动明度，视觉观感变化最小）。
 *
 * 用法：node tools/contrast-fix.js
 * 输出：每个 token 的建议新值 + 前后对比度
 */
const BG = '#F6F1E7';     // --bg
const PAPER = '#FFFCF6';  // --paper
const TARGET = 4.6;       // AA 4.5 + 缓冲
const TARGET_LG = 3.2;    // AA 大字 3.0 + 缓冲

const hex2rgb = h => {
  h = h.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
};
const rgb2hex = r => '#' + r.map(v =>
  Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0').toUpperCase()).join('');

const lum = rgb => {
  const c = rgb.map(v => {
    v = v / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/* RGB ↔ HSL，只调 L 以保住色相与饱和度 */
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hsl2rgb([h, s, l]) {
  if (!s) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = t => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** 二分求解：只降 L，直到对两种底色都达标 */
function solve(hex, target) {
  const bg = hex2rgb(BG), paper = hex2rgb(PAPER);
  const orig = hex2rgb(hex);
  const worst = c => Math.min(ratio(c, bg), ratio(c, paper));
  if (worst(orig) >= target) return { hex, changed: false, before: worst(orig), after: worst(orig) };

  const [h, s, l0] = rgb2hsl(orig);
  let lo = 0, hi = l0, best = [0, 0, 0];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const c = hsl2rgb([h, s, mid]);
    if (worst(c) >= target) { best = c; lo = mid; } else { hi = mid; }
  }
  const out = best.map(Math.round);
  return { hex: rgb2hex(out), changed: true, before: worst(orig), after: worst(out) };
}

const TOKENS = [
  ['--ink-3  次要文字', '#948F82', TARGET],
  ['--red    江城红', '#C54E36', TARGET],
  ['.mrow .no 章节序号', '#C9C2B0', TARGET_LG],
  ['m xinsheng', '#C54E36', TARGET],
  ['m jiaotong', '#4A6274', TARGET],
  ['m sushe', '#8A6A4F', TARGET],
  ['m junxun', '#6B7355', TARGET],
  ['m xiaoqu', '#56707A', TARGET],
  ['m rushi', '#6E5F78', TARGET],
  ['m xueye', '#46566E', TARGET],
  ['m shenghuo', '#B06A3B', TARGET],
  ['m growth', '#4F6B57', TARGET],
  ['m jiangzhu', '#97722F', TARGET],
  ['m shetuan', '#9A5560', TARGET],
  ['m zuzhi', '#5A6472', TARGET],
  ['m jingsai', '#A9553E', TARGET],
  ['m tice', '#46716A', TARGET],
  ['--green  辅助绿', '#63715C', TARGET],
  ['--ink-2  正文次级', '#5F5B52', TARGET]
];

console.log('| Token | 原值 | 原对比 | 建议 | 新对比 | 动了吗 |');
console.log('|---|---|---|---|---|---|');
const patches = [];
for (const [name, hex, t] of TOKENS) {
  const r = solve(hex, t);
  console.log(`| ${name} | ${hex} | ${r.before.toFixed(2)} | ${r.hex} | ${r.after.toFixed(2)} | ${r.changed ? '✳ 改' : '—'} |`);
  if (r.changed) patches.push([name, hex, r.hex]);
}

/* 白字压在品牌红上（按钮态）单独验一遍 */
console.log('\n--- 反白文字（按钮）---');
const WHITE = '#FFF9F2';
for (const red of ['#C54E36', solve('#C54E36', TARGET).hex]) {
  console.log(`${WHITE} on ${red} → ${ratio(hex2rgb(WHITE), hex2rgb(red)).toFixed(2)}`);
}
console.log(`#FFFFFF on ${solve('#C54E36', TARGET).hex} → ${ratio([255, 255, 255], hex2rgb(solve('#C54E36', TARGET).hex)).toFixed(2)}`);

console.log('\n--- 待替换清单 ---');
patches.forEach(([n, a, b]) => console.log(`${a} -> ${b}   (${n})`));
