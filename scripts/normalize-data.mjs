// 数据治理 · 归一化脚本（M5）
// -------------------------------------------------------------
// 读 assets/foodmap-data/ 三源（wuhan / campus / play），按《美食集散平台产品方案》§5 统一 schema，
// 输出 h5/src/data/merchants.js（merchants）+ h5/src/data/places.js（places）。
//
// 治理动作（见 §6）：
//  1. 统一分类法：五谷杂粮(错配81) / 南湖推荐(跨源冲突109) 两种"伪分类"通过 cuisine 映射到正规分类白名单；
//     无法从 cuisine 推断时给合理默认（南湖推荐→小吃宵夜；五谷杂粮→其他）。
//  2. 校区 zone 推导：用既有 distanceTo{Shouyi,Nanhu}_km，3km 阈值归首义/南湖，否则全城。
//  3. mealTime 归一为 {早,午,晚,夜宵} 数组；rating 归一为 {必吃,推荐,空}（"可以试试"→推荐）。
//  4. 坐标沿用 GCJ-02 原值；补 id / source / status / has_coupon 等治理字段。
//
// 运行：node scripts/normalize-data.mjs
// 幂等：每次重跑重新生成两个数据模块。

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const asset = (f) => resolve(root, 'assets/foodmap-data', f);
const out = (f) => resolve(root, 'h5/src/data', f);

// 用 Function 沙箱把 `window.__X__ = ...` 的数据文件读成普通对象（不污染全局）。
function loadWindowVar(file, varName) {
  const code = readFileSync(file, 'utf8');
  const sandbox = {};
  // eslint-disable-next-line no-new-func
  new Function('window', `${code}\n;return window;`).call(null, sandbox);
  return sandbox[varName];
}

const WUHAN = loadWindowVar(asset('wuhan.js'), '__WUHAN_DATA__');
const CAMPUS = loadWindowVar(asset('campus.js'), '__CAMPUS_DATA__').shops;
const PLAY = loadWindowVar(asset('play.js'), '__PLAY_DATA__');

// ---- 统一分类白名单（§6 草案） ----
export const CATEGORY_WHITELIST = [
  '早餐', '小吃宵夜', '火锅', '烧烤', '烤肉', '湖北菜', '湘菜', '川菜',
  '粤闽潮汕', '日料烧鸟', '韩餐', '泰越等异国', '西餐', '面包甜点',
  '私房菜', '苍蝇馆子', '自助', '其他'
];

// 源 category 直接映射（清晰可判定）
const DIRECT_CATEGORY = {
  '早餐': '早餐', '烧烤': '烧烤', '烤肉': '烤肉', '日式烧鸟&日料': '日料烧鸟',
  '西餐': '西餐', '自助餐': '自助', '火锅': '火锅', '苍蝇馆子': '苍蝇馆子',
  '面包甜点': '面包甜点', '私房菜': '私房菜', '韩国菜': '韩餐',
  '泰国菜': '泰越等异国', '湖北菜': '湖北菜', '其他国家菜': '泰越等异国'
};
// 伪分类桶：须靠 cuisine 二次推断
const BUCKET_CATEGORY = new Set(['五谷杂粮', '南湖推荐']);
const NANHU_DEFAULT = '小吃宵夜';   // 南湖推荐无明细时，财大小吃街场景默认
const FIVEGRAIN_DEFAULT = '其他';   // 五谷杂粮无明细时默认

// cuisine → 正规分类（用于伪分类桶的二次推断；其余场景也兜底）
const CUISINE_TO_CAT = {
  '卤菜': '小吃宵夜', '小吃': '小吃宵夜', '小吃（混沌）': '小吃宵夜', '面': '小吃宵夜',
  '炒面': '小吃宵夜', '桂林米粉': '小吃宵夜', '饺子': '小吃宵夜',
  '包子': '早餐', '面点': '早餐', '汤包': '早餐', '早餐': '早餐',
  '湘菜': '湘菜', '川菜': '川菜', '干锅': '川菜',
  '火锅': '火锅', '重庆火锅': '火锅', '四川火锅': '火锅', '串串': '火锅', '串串香': '火锅',
  '日本料理': '日料烧鸟', '日式烤肉': '日料烧鸟', '铁板烧': '日料烧鸟',
  '烤肉': '烤肉', '火锅烤肉': '烤肉',
  '韩国菜': '韩餐', '韩国烤肉': '韩餐',
  '泰国菜': '泰越等异国', '巴基斯坦菜': '泰越等异国',
  '西餐': '西餐', '美式烤肉': '西餐', '墨西哥菜': '西餐', '德国菜': '西餐', '西班牙菜': '西餐',
  '粤菜': '粤闽潮汕', '福建菜': '粤闽潮汕',
  '湖北菜': '湖北菜', '湖北恩施菜': '湖北菜', '湖北菜（特色）': '湖北菜', '恩施菜': '湖北菜',
  '私房菜': '私房菜',
  '浙江菜': '其他', '江浙菜': '其他', '南京菜': '其他', '北京菜': '其他', '新疆菜': '其他',
  '东北菜': '其他', '东北铁锅': '其他', '海鲜': '其他', '家常': '其他', '家常菜': '其他',
  '素食': '其他', '淮扬菜': '其他', '烤全羊': '其他', '台湾菜': '其他'
};

const MEAL_MAP = {
  '夜宵': ['夜宵'], '午晚餐': ['午', '晚'], '晚餐夜宵': ['晚', '夜宵'], '早餐': ['早'],
  '晚餐': ['晚'], '午餐': ['午'], '下午茶': ['午'], '全天': ['早', '午', '晚', '夜宵'],
  '午餐晚餐': ['午', '晚']
};
const MEAL_SET = new Set(['早', '午', '晚', '夜宵']);

const ZONE_KM = 3.0; // 校区周边阈值

function normCategory(x) {
  const cat = x.category;
  if (DIRECT_CATEGORY[cat]) return DIRECT_CATEGORY[cat];
  if (BUCKET_CATEGORY.has(cat)) {
    const cu = (x.cuisine || '').trim();
    if (CUISINE_TO_CAT[cu]) return CUISINE_TO_CAT[cu];
    return cat === '南湖推荐' ? NANHU_DEFAULT : FIVEGRAIN_DEFAULT;
  }
  return '其他'; // 未知源分类兜底（不应触发）
}

function normMealTime(v) {
  if (!v) return [];
  const m = MEAL_MAP[String(v).trim()];
  return m || [];
}

function normRating(v) {
  if (!v) return '';
  if (v === '必吃') return '必吃';
  if (v === '可以试试' || v === '推荐') return '推荐';
  return '';
}

function normZone(x) {
  const ds = parseFloat(x.distanceToShouyi_km);
  const dn = parseFloat(x.distanceToNanhu_km);
  if (Number.isFinite(ds) && Number.isFinite(dn)) {
    if (ds <= ZONE_KM && ds <= dn) return '首义';
    if (dn <= ZONE_KM && dn < ds) return '南湖';
  }
  return '全城';
}

function normSource(x) {
  const s = x.source || '';
  if (typeof s === 'string' && s.startsWith('nanhu')) return '地推';
  return '编辑';
}

function buildMerchant(x, i) {
  return {
    id: 'm' + String(i + 1).padStart(4, '0'),
    name: x.name || '',
    zone: normZone(x),
    category: normCategory(x),
    cuisine: (x.cuisine || '').trim(),
    mealTime: normMealTime(x.mealTime),
    address: x.address || '',
    lng: Number(x.lng),
    lat: Number(x.lat),
    coord: 'GCJ-02',
    avgPrice: x.avgPrice || '',
    rating: normRating(x.rating),
    signatureDishes: x.signatureDishes || '',
    reason: x.reason || '',
    groupSize: x.groupSize || '',
    environment: x.environment || '',
    hasPrivateRoom: x.hasPrivateRoom || '',
    source: normSource(x),
    status: '已发布',
    has_coupon: false,
    coupon_summary: ''
  };
}

function buildPlace(x, i) {
  return {
    id: 'p' + String(i + 1).padStart(4, '0'),
    name: x.name || '',
    category: x.category || '',
    campus: x.campus || '',
    address: x.address || '',
    lng: Number(x.lng),
    lat: Number(x.lat),
    description: x.description || '',
    tips: x.tips || ''
  };
}

function stats(arr, key) {
  const m = {};
  for (const x of arr) m[x[key]] = (m[x[key]] || 0) + 1;
  return m;
}

function main() {
  const merchants = [...WUHAN, ...CAMPUS].map(buildMerchant);
  const places = PLAY.map(buildPlace);

  mkdirSync(dirname(out('merchants.js')), { recursive: true });

  const header = (name, note) =>
    `// AUTO-GENERATED by scripts/normalize-data.mjs — DO NOT EDIT BY HAND.\n` +
    `// 生成时间 ${new Date().toISOString().slice(0, 10)} · 来源 wuhan(540)+campus(50) / play(32)\n` +
    `// ${note}\n`;

  writeFileSync(out('merchants.js'),
    header('merchants', '统一商户表，schema 见产品方案 §5') +
    `export const merchants = ${JSON.stringify(merchants, null, 0)};\n` +
    `export const MERCHANTS_GENERATED_AT = '${new Date().toISOString().slice(0, 10)}';\n`);

  writeFileSync(out('places.js'),
    header('places', '玩乐/景点表（独立，非餐饮）') +
    `export const places = ${JSON.stringify(places, null, 0)};\n` +
    `export const PLACES_GENERATED_AT = '${new Date().toISOString().slice(0, 10)}';\n`);

  // 治理统计
  const fromFiveGrain = [...WUHAN].filter((x) => x.category === '五谷杂粮').length;
  const fromNanhu = [...WUHAN, ...CAMPUS].filter((x) => x.category === '南湖推荐').length;
  console.log('=== 归一化完成 ===');
  console.log('merchants:', merchants.length, '(wuhan', WUHAN.length, '+ campus', CAMPUS.length, ')');
  console.log('places:', places.length);
  console.log('伪分类已消解: 五谷杂粮', fromFiveGrain, '→ 经 cuisine 重归类; 南湖推荐(跨源)', fromNanhu, '→ 小吃宵夜/明细');
  console.log('分类分布:', JSON.stringify(stats(merchants, 'category'), null, 0));
  console.log('zone 分布:', JSON.stringify(stats(merchants, 'zone'), null, 0));
  console.log('rating 分布:', JSON.stringify(stats(merchants, 'rating'), null, 0));
  console.log('有 mealTime 条目:', merchants.filter((m) => m.mealTime.length).length);
  console.log('输出文件: h5/src/data/merchants.js, h5/src/data/places.js');
}

// 仅当作为入口直接运行（而非被 validator 导入）才执行；保证「生成=校验」口径一致。
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
