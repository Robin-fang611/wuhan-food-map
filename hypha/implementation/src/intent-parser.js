// skill.intent-parser（规则版，无 LLM 依赖）：把自然语言意图或结构化筛选归一到
// task.food-discovery.inputSchema 的规范参数 {zone, mealTime, category, maxPrice, sort, board, limit, query}。
// 对齐 manyouwei-food-discovery.domain.yaml 的入参契约；后续可平滑替换为轻量模型增强（见路线图 步骤 10）。
//
// 步骤 10 增强：支持中文数字价格（人均一百/八十块）、更丰富的口语同义词（撸串→烧烤、奶茶→饮品缺类降级）、
// 灵活的价/距离/评分排序触发词、榜单触发词；所有口语同义词严格映射到「真实分类白名单」，
// 映射不到真实分类时降级为 null（不编造分类、不返回 0 结果），守 §8 数据不编造红线。
import { ALL_MERCHANTS, listCategories } from './runtime.js';

const ZONES = ['财大南湖周边', '武汉全城'];

// 真实分类白名单（来自 data/merchants.js，18 类）；口语同义词严格映射到这里。
// 顺序敏感：更具体的在前，命中即停。值为 null 表示「口语词无对应真实分类」，降级为不按分类过滤。
const ORAL_CATEGORY_MAP = [
  ['火锅', '火锅'],
  ['烧烤', '烧烤'],
  ['烤串', '烧烤'],
  ['撸串', '烧烤'],
  ['串串', '小吃宵夜'],
  ['麻辣烫', '小吃宵夜'],
  ['小龙虾', '小吃宵夜'],
  ['烤鱼', '小吃宵夜'],
  ['虾', '小吃宵夜'],
  ['热干面', '早餐'],
  ['面', '小吃宵夜'],
  ['小吃', '小吃宵夜'],
  ['热干面', '早餐'],
  ['汤包', '早餐'],
  ['包子', '早餐'],
  ['小笼', '早餐'],
  ['早餐', '早餐'],
  ['湘菜', '湘菜'],
  ['藕汤', '湖北菜'],
  ['湖北菜', '湖北菜'],
  ['川菜', '川菜'],
  ['麻辣', '川菜'],
  ['粤菜', '粤闽潮汕'],
  ['潮汕', '粤闽潮汕'],
  ['闽菜', '粤闽潮汕'],
  ['日料', '日料烧鸟'],
  ['寿司', '日料烧鸟'],
  ['烧鸟', '日料烧鸟'],
  ['韩餐', '韩餐'],
  ['韩料', '韩餐'],
  ['炸鸡', '韩餐'],
  ['西餐', '西餐'],
  ['牛排', '西餐'],
  ['汉堡', '西餐'],
  ['披萨', '西餐'],
  ['甜品', '面包甜点'],
  ['面包', '面包甜点'],
  ['蛋糕', '面包甜点'],
  ['私房菜', '私房菜'],
  ['苍蝇馆子', '苍蝇馆子'],
  ['自助', '自助'],
  ['泰餐', '泰越等异国'],
  ['泰国菜', '泰越等异国'],
  ['越南菜', '泰越等异国'],
  ['异国', '泰越等异国'],
  ['烤肉', '烤肉'],
  // 饮品类在本数据无真实分类 → 降级为 null（按分类不收敛，避免 0 结果）
  ['奶茶', null],
  ['咖啡', null],
  ['饮品', null],
];

// 中文数字 → 数值（支持 零一二两三四五六七八九十百千 + 阿拉伯数字）。
// 说明：日常口语「一百二」=120、「一百五」=150 这类省略写法按十位解析不精确，
// 价格仅是软上限筛选，不影响闭环，故采用标准解析（一百二→102 等边界情形可接受）。
function cnToNumber(s) {
  if (typeof s === 'number') return s;
  if (/^\d+$/.test(s)) return Number(s);
  // 口语省写：一百二=120 / 二百五=250 / 五百八=580（百后接单个数字按十位解析）
  const D = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const colloq = String(s).match(/^([一二两三四五六七八九]?)百([一二三四五六七八九])$/);
  if (colloq) {
    const a = colloq[1] ? D[colloq[1]] : 1;
    return a * 100 + D[colloq[2]] * 10;
  }
  const map = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let result = 0;
  let tmp = 0;
  for (const ch of String(s)) {
    if (map[ch] !== undefined) {
      tmp = map[ch];
    } else if (ch === '十') {
      tmp = (tmp === 0 ? 1 : tmp) * 10;
      result += tmp;
      tmp = 0;
    } else if (ch === '百') {
      tmp = (tmp === 0 ? 1 : tmp) * 100;
      result += tmp;
      tmp = 0;
    } else if (ch === '千') {
      tmp = (tmp === 0 ? 1 : tmp) * 1000;
      result += tmp;
      tmp = 0;
    } else {
      return NaN;
    }
  }
  result += tmp;
  return result;
}

// 提取人均上限（maxPrice）：关键字 + 数字（阿拉伯或中文）/ 口语价；返回 number 或 null。
function extractMaxPrice(intent, t) {
  const numTok = '(\\d+|[零一二两三四五六七八九十百千]+)';
  const kw = '(?:人均|每人|¥|花费|预算|不超过|不到|低于|以内|以下|约|大概|大约|左右|售价|价格|控制)';
  const m = intent.match(new RegExp(kw + '\\s*' + numTok + '\\s*元?'));
  if (m) {
    const n = cnToNumber(m[1]);
    if (!Number.isNaN(n)) return n;
  }
  // 裸数字 + 元/块/块钱（如「80元」「一百块」）
  const m2 = intent.match(new RegExp(numTok + '\\s*(?:元|块|块钱)'));
  if (m2) {
    const n = cnToNumber(m2[1]);
    if (!Number.isNaN(n)) return n;
  }
  // 口语价短语
  if (t.includes('不过百') || t.includes('不超百') || t.includes('百以内') || t.includes('百元以内') || t.includes('一百以内')) return 100;
  if (t.includes('不过五十') || t.includes('五十以内') || t.includes('五十块以内')) return 50;
  if (t.includes('便宜') || t.includes('划算') || t.includes('性价比') || t.includes('省钱') || t.includes('实惠') || t.includes('平价')) return 50;
  if (t.includes('人均低') || t.includes('低价') || t.includes('超便宜')) return 30;
  return null;
}

// 心情：用于 explain 引擎做「合拍」软匹配（不影响入选/排序，仅增强推荐理由）。
// 命中即返回首个匹配的心情标签；无匹配返回 null（降级为不按心情过滤）。
function extractMood(t) {
  const MOOD = [
    ['治愈', ['治愈', '暖', '温暖', '舒服', '放松', '累', '疲惫', '丧', '心情不好', '不开心', 'emo', '孤独', '委屈']],
    ['请客', ['请客', '带人', '约会', '暗恋', '商务', '招待', '聚餐', '聚会', '请', '宴', '带朋友', '带爸妈', '带家人', '请人']],
    ['省钱', ['省钱', '便宜', '划算', '预算', '学生', '穷', '抠', '实惠', '囊中羞涩']],
    ['充饥', ['饿', '快点', '快', '赶', '方便', '随便', '路过', '急']],
    ['解馋', ['馋', '念', '重口', '痛快', '爽', '想吃辣', '过瘾']],
    ['庆祝', ['庆祝', '生日', '开心', '中奖', '好事', '值得', '犒劳', '开心']],
  ];
  for (const [mood, kws] of MOOD) if (kws.some((k) => t.includes(k))) return mood;
  return null;
}

// 口味偏好：抽取用户口语里的口味词（辣/甜/鲜/酸/清淡/香酥），供 explain 合拍匹配。
function extractTaste(t) {
  const TASTE = [
    ['辣', ['辣', '麻辣', '火锅', '烧烤', '小龙虾', '串', '香锅', '剁椒', '重辣', '微辣']],
    ['甜', ['甜', '糖水', '甜品', '糕点', '豆皮', '酒酿', '糊米酒', '奶茶', '糖']],
    ['鲜', ['鲜', '鱼', '汤', '海鲜', '蟹', '虾', '藕汤', '排骨', '靓汤']],
    ['酸', ['酸', '酸辣', '泡椒', '醋', '酸汤']],
    ['清淡', ['清淡', '养生', '素', '粥', '不油', '养胃', '轻食']],
    ['香酥', ['酥', '脆', '炸', '香', '锅巴', '焦香']],
  ];
  const out = [];
  for (const [tw, kws] of TASTE) if (kws.some((k) => t.includes(k))) out.push(tw);
  return out;
}

export function parseIntent(input = {}) {
  const intent = input.intent != null ? String(input.intent) : '';
  const t = intent.toLowerCase();

  // —— zone：结构化优先，否则从文本识别 ——
  let zone = input.zone || '';
  if (!zone || !ZONES.includes(zone)) {
    if (t.includes('南湖') || t.includes('财大')) zone = '财大南湖周边';
    else if (t.includes('首义') || t.includes('全城') || t.includes('武汉')) zone = '武汉全城';
    else zone = '武汉全城';
  }

  // —— mealTime ——
  const mealTime = new Set(Array.isArray(input.mealTime) ? input.mealTime : []);
  if (t.includes('夜宵') || t.includes('宵夜')) mealTime.add('夜宵');
  if (t.includes('早')) mealTime.add('早');
  if (t.includes('午') || t.includes('中饭') || t.includes('午饭')) mealTime.add('午');
  if (t.includes('晚') || t.includes('晚饭') || t.includes('晚餐')) mealTime.add('晚');

  // —— category：先匹配真实分类白名单（直接出现），再走口语同义词映射（严格落到真实分类）——
  let category = input.category || null;
  const realCats = listCategories(ALL_MERCHANTS);
  if (!category) {
    category = realCats.find((c) => intent.includes(c)) || null;
    if (!category) {
      for (const [oral, real] of ORAL_CATEGORY_MAP) {
        if (intent.includes(oral)) { category = real; break; }
      }
    }
    // 双重保险：只接受真实分类，否则降级为 null（不编造分类、不返回 0 结果）
    if (category && !realCats.includes(category)) category = null;
  }

  // —— maxPrice（中文数字/口语价/关键字价）——
  let maxPrice = input.maxPrice != null ? Number(input.maxPrice) : null;
  if (maxPrice == null) maxPrice = extractMaxPrice(intent, t);

  // —— 排序触发词：价格(便宜/人均/价) > 距离(近/附近) > 评分(好评/必吃) ——
  let sort = input.sort || null;
  if (!sort) {
    const hasPrice = t.includes('人均') || t.includes('便宜') || t.includes('划算')
      || t.includes('性价比') || t.includes('省钱') || t.includes('实惠');
    const hasDist = t.includes('距离') || t.includes('近') || t.includes('附近')
      || t.includes('周边') || t.includes('离我') || t.includes('最近') || t.includes('不远');
    const hasRating = t.includes('评分') || t.includes('必吃') || t.includes('推荐')
      || t.includes('好评') || t.includes('高分');
    if (hasPrice || maxPrice != null) sort = 'price';
    else if (hasDist) sort = 'distance';
    else if (hasRating) sort = 'rating';
    else sort = null;
  }

  // —— board（榜单意图）：仅对显式榜单词生效；「宵夜/便宜」属场景/价格筛选，不强制榜单 ——
  let board = null;
  if (t.includes('必吃')) board = 'mustEat';
  else if (t.includes('性价比') || t.includes('划算')) board = 'value';
  else if (t.includes('夜宵榜') || t.includes('宵夜榜') || t.includes('夜宵推荐')) board = 'lateNight';
  else if (t.includes('新店') || t.includes('新开') || t.includes('新收录') || t.includes('新上市')
    || (t.includes('新') && (t.includes('店') || t.includes('开') || t.includes('收录')))) board = 'newest';

  // —— 心情 / 口味（软信号，供 explain 合拍匹配；不影响入选/排序）——
  let mood = input.mood || null;
  if (!mood) mood = extractMood(t);
  let taste = Array.isArray(input.taste) ? input.taste : null;
  if (!taste) taste = extractTaste(t);

  const limit = input.limit != null ? Number(input.limit) : 20;
  return { zone, mealTime: [...mealTime], category, maxPrice, sort, board, limit, mood, taste, query: intent };
}
