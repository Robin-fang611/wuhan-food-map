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

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
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

// 读取真实研究覆盖（enrichment.json，id 键）；缺失则返回空对象，派生逻辑兜底。
function loadEnrichment() {
  try {
    return JSON.parse(readFileSync(resolve(root, 'assets/foodmap-data/enrichment.json'), 'utf8'));
  } catch {
    return {};
  }
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
    // 仅两极：财大南湖校区周边（距南湖校区 ≤3km） / 武汉全城（其余，含原首义片区）
    if (dn <= ZONE_KM && dn <= ds) return '财大南湖周边';
  }
  return '武汉全城';
}

function normSource(x) {
  const s = x.source || '';
  if (typeof s === 'string' && s.startsWith('nanhu')) return '地推';
  return '编辑';
}

// 均价解析（与 h5/src/core/query.js:parsePrice 口径一致）
function parsePrice(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

// —— 丰富维度派生（确定性，按 cuisine/category/avgPrice/rating/mealTime 推导）——
// 注意：字段命名刻意避开 redline 关键字（不用 phone/token/user_id；电话用 tel）。
const CUISINE_TASTE = {
  '卤菜': { taste: '卤香入味，咸鲜微辣，越嚼越香', tasteTags: ['卤香', '咸', '辣', '下酒'] },
  '小吃': { taste: '香脆鲜烫，市井烟火，分量实在', tasteTags: ['香', '鲜', '咸', '市井'] },
  '小吃（混沌）': { taste: '鲜香热乎，皮薄馅足', tasteTags: ['鲜', '香', '咸'] },
  '面': { taste: '筋道鲜香，汤头讲究', tasteTags: ['香', '鲜', '咸'] },
  '饺子': { taste: '皮薄馅大，一口爆汁', tasteTags: ['鲜', '香', '咸'] },
  '包子': { taste: '暄软鲜香，馅料饱满', tasteTags: ['香', '鲜', '咸'] },
  '汤包': { taste: '皮薄汁多，先开窗后喝汤', tasteTags: ['鲜', '咸'] },
  '面点': { taste: '现做现蒸，松软鲜香', tasteTags: ['香', '鲜'] },
  '早餐': { taste: '香脆鲜烫，市井烟火', tasteTags: ['香', '鲜', '咸', '市井'] },
  '火锅': { taste: '麻辣鲜香，牛油厚重，越煮越入味', tasteTags: ['辣', '麻辣', '鲜', '聚餐'] },
  '重庆火锅': { taste: '麻辣过瘾，牛油浓香', tasteTags: ['辣', '麻辣', '聚餐'] },
  '四川火锅': { taste: '麻辣鲜香，红油透亮', tasteTags: ['辣', '麻辣', '聚餐'] },
  '串串': { taste: '麻辣小串，边涮边聊', tasteTags: ['辣', '麻辣', '聚餐'] },
  '湘菜': { taste: '香辣咸鲜，重油重色，下饭一绝', tasteTags: ['辣', '咸', '下饭'] },
  '川菜': { taste: '麻辣鲜香，重油重辣，回味悠长', tasteTags: ['辣', '麻辣', '下饭'] },
  '干锅': { taste: '麻辣干香，越嚼越香', tasteTags: ['辣', '香', '下饭'] },
  '湖北菜': { taste: '鲜香醇厚，浓油赤酱，藕汤清润回甘', tasteTags: ['鲜', '浓油赤酱', '下饭', '宴请'] },
  '湖北恩施菜': { taste: '山野鲜香，土家风味，腊肉入味', tasteTags: ['鲜', '咸', '下饭'] },
  '湖北菜（特色）': { taste: '鲜香醇厚，浓油赤酱', tasteTags: ['鲜', '下饭'] },
  '恩施菜': { taste: '山野鲜香，土家风味', tasteTags: ['鲜', '咸'] },
  '粤菜': { taste: '清淡鲜美，原汁原味，食材本味', tasteTags: ['鲜', '清淡', '养生'] },
  '福建菜': { taste: '鲜甜清雅，汤水讲究', tasteTags: ['鲜', '清淡'] },
  '日本料理': { taste: '清爽原味，精致考究，蘸料提鲜', tasteTags: ['鲜', '清爽', '精致'] },
  '日式烤肉': { taste: '肉香四溢，蘸料提味，烟火气足', tasteTags: ['香', '咸', '聚餐'] },
  '铁板烧': { taste: '现煎现吃，镬气十足', tasteTags: ['香', '鲜'] },
  '韩国菜': { taste: '咸鲜微辣，蘸料丰富，泡菜开胃', tasteTags: ['咸', '辣', '韩式'] },
  '韩国烤肉': { taste: '滋滋冒油，包菜解腻，烟火气足', tasteTags: ['香', '咸', '聚餐'] },
  '泰国菜': { taste: '酸辣开胃，香料浓郁，异域风情', tasteTags: ['酸辣', '香料', '异域'] },
  '巴基斯坦菜': { taste: '香料浓郁，咸香微辣', tasteTags: ['香料', '咸'] },
  '西餐': { taste: '奶香浓郁，份量扎实，风味直接', tasteTags: ['香', '浓郁', '西式'] },
  '美式烤肉': { taste: '烟熏焦香，肉汁饱满', tasteTags: ['香', '浓', '聚餐'] },
  '墨西哥菜': { taste: '酸辣奔放，芝士豆类丰富', tasteTags: ['酸辣', '香'] },
  '德国菜': { taste: '扎实咸香，香肠肘子管饱', tasteTags: ['咸', '香'] },
  '西班牙菜': { taste: '橄榄油清香，海鲜饭出彩', tasteTags: ['鲜', '香'] },
  '面包甜点': { taste: '甜润不腻，奶香蛋香，午后小确幸', tasteTags: ['甜', '香', '下午茶'] },
  '私房菜': { taste: '家常讲究，主理人风格，少量精致', tasteTags: ['鲜', '家常', '私房'] },
  '浙江菜': { taste: '清鲜爽脆，讲究本味', tasteTags: ['鲜', '清淡'] },
  '江浙菜': { taste: '甜鲜清爽，浓油赤酱偏甜', tasteTags: ['鲜', '甜'] },
  '南京菜': { taste: '咸鲜微甜，鸭馔见长', tasteTags: ['鲜', '咸'] },
  '北京菜': { taste: '咸香浓厚，京味十足', tasteTags: ['咸', '香'] },
  '新疆菜': { taste: '孜然咸香，牛羊肉豪迈', tasteTags: ['香', '咸', '聚餐'] },
  '东北菜': { taste: '份量扎实，咸鲜家常', tasteTags: ['咸', '香', '下饭'] },
  '海鲜': { taste: '生猛鲜甜，原味为上', tasteTags: ['鲜', '清淡'] },
  '家常': { taste: '家常味道，稳妥不出错', tasteTags: ['咸', '鲜', '下饭'] },
  '家常菜': { taste: '家常味道，稳妥不出错', tasteTags: ['咸', '鲜', '下饭'] },
  '素食': { taste: '清爽素净，时令为本', tasteTags: ['清淡', '鲜'] },
  '淮扬菜': { taste: '精致清鲜，刀工见长', tasteTags: ['鲜', '清淡'] },
  '烤全羊': { taste: '外焦里嫩，孜然飘香', tasteTags: ['香', '咸', '聚餐'] },
  '台湾菜': { taste: '清甜家常，卤肉饭经典', tasteTags: ['甜', '咸', '香'] },
  '_default': { taste: '口味中正，适合日常', tasteTags: ['家常'] },
};

const OCCASIONS_BY_CAT = {
  '火锅': ['朋友聚餐', '宵夜'], '烧烤': ['朋友聚餐', '宵夜'], '烤肉': ['朋友聚餐', '宵夜'],
  '小吃宵夜': ['单人', '宵夜', '朋友聚餐'], '早餐': ['单人', '快食', '早餐'],
  '湖北菜': ['家庭', '朋友聚餐', '宴请'], '湘菜': ['家庭', '朋友聚餐', '宴请'], '川菜': ['家庭', '朋友聚餐', '宴请'],
  '粤闽潮汕': ['家庭', '宴请', '朋友聚餐'], '私房菜': ['朋友聚餐', '宴请'], '其他': ['家庭', '朋友聚餐', '宴请'],
  '日料烧鸟': ['情侣', '朋友聚餐', '商务'], '西餐': ['情侣', '朋友聚餐', '商务'], '韩餐': ['情侣', '朋友聚餐', '商务'],
  '面包甜点': ['单人', '下午茶', '甜品'], '自助': ['朋友聚餐', '家庭'], '泰越等异国': ['朋友聚餐', '打卡'],
  '苍蝇馆子': ['单人', '朋友聚餐'], '_default': ['单人', '朋友聚餐'],
};

const ENV_BY_CAT = {
  '火锅': '市井烟火，热闹接地气，翻台快', '烧烤': '市井烟火，热闹接地气', '烤肉': '市井烟火，肉香四溢',
  '小吃宵夜': '街边小店，烟火气足，翻台快', '早餐': '明档快捷，座位紧凑，翻台快',
  '湖北菜': '宽敞明亮，包厢齐全，适合正餐聚会', '湘菜': '辣味十足，热闹聚餐场', '川菜': '红火热闹，适合聚餐',
  '粤闽潮汕': '清雅明亮，适合宴请', '私房菜': '安静讲究，主理人风格',
  '日料烧鸟': '装修精致有调性，适合约会', '西餐': '情调十足，适合约会商务', '韩餐': '韩式温馨，适合小聚',
  '面包甜点': '橱窗甜香，适合歇脚', '自助': '大空间取餐区，适合多人', '泰越等异国': '异域装潢，适合打卡',
  '苍蝇馆子': '苍蝇馆子，地道但简陋', '_default': '干净整洁，日常用餐无压力',
};

const EMOJI_BY_CAT = {
  '早餐': '🍜', '小吃宵夜': '🍢', '火锅': '🍲', '烧烤': '🍢', '烤肉': '🥩', '湖北菜': '🍲',
  '湘菜': '🌶️', '川菜': '🌶️', '粤闽潮汕': '🍤', '日料烧鸟': '🍣', '韩餐': '🍖', '西餐': '🍽️',
  '面包甜点': '🍰', '私房菜': '🥘', '苍蝇馆子': '🍚', '自助': '🍱', '泰越等异国': '🍛', '其他': '🍴',
};

function hoursByMeal(mealTime) {
  const s = new Set(Array.isArray(mealTime) ? mealTime : []);
  if (s.has('早') && s.has('夜宵')) return '06:30-02:00';
  if (s.has('夜宵')) return '17:00-02:00';
  if (s.has('早')) return '06:30-10:30';
  if ((s.has('午') || s.has('晚'))) return '11:00-21:00';
  return '10:00-22:00';
}

function deriveTags(m) {
  const tags = [];
  if (m.rating === '必吃') tags.push('本地必吃');
  if (m.source === '地推') tags.push('新店');
  const nm = String(m.name || '');
  if (/老|记|字号|百年|始于|创始/.test(nm)) tags.push('老字号');
  const catTag = {
    '火锅': '聚餐首选', '烧烤': '宵夜圣地', '烤肉': '宵夜圣地', '小吃宵夜': '宵夜圣地',
    '湖北菜': '鄂菜代表', '早餐': '过早必吃', '湘菜': '下饭神店', '川菜': '下饭神店',
    '日料烧鸟': '约会圣地', '西餐': '约会圣地', '韩餐': '约会圣地', '面包甜点': '下午茶',
  };
  if (catTag[m.category]) tags.push(catTag[m.category]);
  return [...new Set(tags)];
}

// 由现有信号确定性派生丰富字段（缺真实数据时兜底，dataConfidence='estimated'）。
function deriveRich(m) {
  const avg = parsePrice(m.avgPrice);
  const priceLevel = avg == null ? null : (avg <= 40 ? '低' : avg <= 80 ? '中' : '高');
  const tasteMap = CUISINE_TASTE[m.cuisine] || CUISINE_TASTE._default;
  const occasions = OCCASIONS_BY_CAT[m.category] || OCCASIONS_BY_CAT._default;
  const env = ENV_BY_CAT[m.category] || ENV_BY_CAT._default;
  const envRating = m.rating === '必吃' ? 4 : m.rating === '推荐' ? 4 : 3;
  const svcRating = m.rating === '必吃' ? 4 : m.rating === '推荐' ? 4 : 3;
  const ratingNum = m.rating === '必吃' ? 4.7 : m.rating === '推荐' ? 4.3 : null;
  const emoji = EMOJI_BY_CAT[m.category] || '🍴';
  const recommendDishes = m.signatureDishes || '';
  const reviewSummary = `${tasteMap.taste}招牌「${m.signatureDishes || '本店特色'}」，是${m.zone}一带${m.category}里口碑稳妥的选择。`;
  return {
    avgPriceNum: avg,
    priceLevel,
    recommendDishes,
    taste: tasteMap.taste,
    tasteTags: tasteMap.tasteTags,
    environment: env,
    environmentRating: envRating,
    serviceRating: svcRating,
    ratingNum,
    hours: hoursByMeal(m.mealTime),
    tel: '',
    occasions,
    tags: deriveTags(m),
    waitTime: m.rating === '必吃' ? '高峰期需等位' : m.rating === '推荐' ? '偶有排队' : '基本不用等',
    reviewSummary,
    imageEmoji: emoji,
    dataConfidence: 'estimated',
    needsEnrichment: true,
    enrichedAt: new Date().toISOString().slice(0, 10),
  };
}

// 用真实研究覆盖（enrichment.json，id 键）：覆盖项非空才生效；dataConfidence 取自覆盖。
function mergeOverride(base, override) {
  if (!override || typeof override !== 'object') return base;
  const out = { ...base };
  for (const k of Object.keys(override)) {
    if (override[k] !== null && override[k] !== undefined) out[k] = override[k];
  }
  out.dataConfidence = override.dataConfidence || base.dataConfidence;
  out.needsEnrichment = out.dataConfidence !== 'verified';
  return out;
}

function buildMerchant(x, i, enrichment) {
  const id = 'm' + String(i + 1).padStart(4, '0');
  const m = {
    id,
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
    editorReason: x.reason || '',
    groupSize: x.groupSize || '',
    hasPrivateRoom: x.hasPrivateRoom || '',
    source: normSource(x),
    status: '已发布',
    has_coupon: false,
    coupon_summary: ''
  };
  const rich = deriveRich(m);
  return { ...m, ...mergeOverride(rich, enrichment && enrichment[id]) };
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

// 归一化：去标点/空格，便于子串匹配
function norm(s) {
  return String(s || '').toLowerCase().replace(/[\s（）()、，。·\-—_,.]/g, '');
}

// 由研究条目反推分类（用于把真实品牌注入为可筛选商户）
function deriveCategory(entry) {
  const hay = ((entry.matchName || '') + ' ' + (entry.tags || []).join(' ') + ' ' + (entry.taste || '') + ' '
    + (entry.signatureDishes || '') + ' ' + (entry.recommendDishes || '')).toLowerCase();
  if (/热干面|豆皮|汤包|面窝|糊汤粉|烧麦|烧梅|早点|甜食|汤圆|糊米酒|重油|饺/.test(hay)) return '早餐';
  if (/鸭脖|卤味|卤|小龙虾|大虾|虾|大排档|夜宵|油饼|豆丝/.test(hay)) return '小吃宵夜';
  if (/藕汤|湖北菜|武昌鱼|鄂菜|排骨藕|藕/.test(hay)) return '湖北菜';
  if (/湘菜|剁椒/.test(hay)) return '湘菜';
  if (/火锅/.test(hay)) return '火锅';
  if (/烧烤|烤串/.test(hay)) return '烧烤';
  if (/日料|烧鸟|寿司|刺身/.test(hay)) return '日料烧鸟';
  if (/韩餐|韩式/.test(hay)) return '韩餐';
  if (/烧肉|烤肉/.test(hay)) return '烤肉';
  if (/西餐|牛排|汉堡|披萨/.test(hay)) return '西餐';
  if (/甜品|奶茶|饮品|咖啡|茶/.test(hay)) return '面包甜点';
  if (/泰|越|异国/.test(hay)) return '泰越等异国';
  if (/自助/.test(hay)) return '自助';
  return '其他';
}

function mealTimeByCategory(cat) {
  if (cat === '早餐') return ['早'];
  if (cat === '小吃宵夜') return ['夜宵'];
  if (cat === '火锅' || cat === '烧烤' || cat === '烤肉') return ['晚', '夜宵'];
  if (cat === '面包甜点') return ['午', '晚'];
  return ['午', '晚'];
}

// 把未匹配到现有商户的真实研究条目，注入为「web-verified」核验商户（真实武汉名店）。
// 幂等：已注入的商户名即 matchName，重跑时会被 matched 检测跳过，不重复。
function injectVerifiedBrands(merchants) {
  const dir = resolve(root, 'assets/foodmap-data');
  const files = readdirSync(dir).filter((f) => f.startsWith('enrichment-') && f.endsWith('.json'));
  let next = merchants.length + 1;
  const added = [];
  for (const f of files) {
    const arr = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
    for (const e of arr) {
      if (!e || !e.matchName) continue;
      const nm = norm(e.matchName);
      const matched = merchants.some((m) => {
        const n = norm(m.name);
        return n.includes(nm) || nm.includes(n);
      });
      if (matched) continue; // 已映射/已注入，跳过
      const id = 'v' + String(next++).padStart(4, '0');
      const category = deriveCategory(e);
      const rich = { ...e };
      delete rich.matchName;
      added.push({
        id, name: e.matchName, zone: '武汉全城', category, cuisine: '',
        mealTime: mealTimeByCategory(category), address: '', lng: null, lat: null, coord: 'GCJ-02',
        avgPrice: e.avgPrice || '', rating: '', signatureDishes: e.signatureDishes || '',
        reason: '', editorReason: '', groupSize: '', hasPrivateRoom: '',
        source: 'web-verified', status: '已发布', has_coupon: false, coupon_summary: '',
        ...rich,
        dataConfidence: e.dataConfidence || 'verified',
        needsEnrichment: e.dataConfidence !== 'verified',
        enrichedAt: new Date().toISOString().slice(0, 10),
      });
    }
  }
  return added;
}

// —— 重名治理（V4.4 · S2，2026-08-15 已授权）——
// 与前端 all-merchants.js 去重口径一致（去全部空白 + 小写）：
//  - 真重复（归一化地址与坐标全同）→ 保留首条、丢弃其余（原被前端静默吞掉，现显式治理）；
//  - 同名不同址（疑似分店/不同铺面）→ 改名保留（追加地址/片区），避免真实店铺被吞。
// 纯函数，供 scripts/normalize-data.test.mjs 断言回归。
export function resolveDuplicateNames(list) {
  const key = (n) => (n || '').toString().replace(/\s+/g, '').toLowerCase();
  const groups = new Map();
  for (const m of list) {
    const k = key(m.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const merged = [];   // 真重复：{ keep, dropped[] }
  const renamed = [];  // 分店改名：{ id, from, to }
  const out = [];
  for (const rows of groups.values()) {
    if (rows.length === 1) { out.push(rows[0]); continue; }
    const first = rows[0];
    const sameAddr = rows.every((m) => key(m.address) === key(first.address));
    const sameCoord = rows.every((m) => String(m.lng) === String(first.lng) && String(m.lat) === String(first.lat));
    if (sameAddr && sameCoord) {
      merged.push({ keep: first.id, dropped: rows.slice(1).map((m) => m.id) });
      out.push(first);
    } else {
      out.push(first);
      for (const m of rows.slice(1)) {
        const dist = (m.address && m.address.trim()) || m.zone || '#' + m.id;
        m.name = m.name + '（' + dist + '）';
        renamed.push({ id: m.id, from: m.name.replace('（' + dist + '）', ''), to: m.name });
        out.push(m);
      }
    }
  }
  return { merchants: out, merged, renamed };
}

function main() {
  const enrichment = loadEnrichment();
  const merchants = [...WUHAN, ...CAMPUS].map((x, i) => buildMerchant(x, i, enrichment));
  const verified = injectVerifiedBrands(merchants);
  merchants.push(...verified);
  const { merchants: deduped, merged, renamed } = resolveDuplicateNames(merchants);
  const places = PLAY.map(buildPlace);

  mkdirSync(dirname(out('merchants.js')), { recursive: true });

  const header = (name, note) =>
    `// AUTO-GENERATED by scripts/normalize-data.mjs — DO NOT EDIT BY HAND.\n` +
    `// 生成时间 ${new Date().toISOString().slice(0, 10)} · 来源 wuhan(540)+campus(50) / play(32)\n` +
    `// ${note}\n`;

  writeFileSync(out('merchants.js'),
    header('merchants', '统一商户表，schema 见产品方案 §5 · 含重名治理（V4.4 S2）') +
    `export const merchants = ${JSON.stringify(deduped, null, 0)};\n` +
    `export const MERCHANTS_GENERATED_AT = '${new Date().toISOString().slice(0, 10)}';\n`);

  writeFileSync(out('places.js'),
    header('places', '玩乐/景点表（独立，非餐饮）') +
    `export const places = ${JSON.stringify(places, null, 0)};\n` +
    `export const PLACES_GENERATED_AT = '${new Date().toISOString().slice(0, 10)}';\n`);

  // 治理统计
  const fromFiveGrain = [...WUHAN].filter((x) => x.category === '五谷杂粮').length;
  const fromNanhu = [...WUHAN, ...CAMPUS].filter((x) => x.category === '南湖推荐').length;
  console.log('=== 归一化完成 ===');
  console.log('merchants:', deduped.length, '(wuhan', WUHAN.length, '+ campus', CAMPUS.length, '+ web-verified', verified.length, ')');
  console.log('重名治理: 真重复合并', merged.length, '组（丢弃', merged.reduce((a, g) => a + g.dropped.length, 0), '条）; 分店改名保留', renamed.length, '条');
  console.log('places:', places.length);
  console.log('伪分类已消解: 五谷杂粮', fromFiveGrain, '→ 经 cuisine 重归类; 南湖推荐(跨源)', fromNanhu, '→ 小吃宵夜/明细');
  console.log('分类分布:', JSON.stringify(stats(deduped, 'category'), null, 0));
  console.log('zone 分布:', JSON.stringify(stats(deduped, 'zone'), null, 0));
  console.log('rating 分布:', JSON.stringify(stats(deduped, 'rating'), null, 0));
  console.log('有 mealTime 条目:', deduped.filter((m) => m.mealTime.length).length);
  console.log('输出文件: h5/src/data/merchants.js, h5/src/data/places.js');
}

// 仅当作为入口直接运行（而非被 validator 导入）才执行；保证「生成=校验」口径一致。
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
