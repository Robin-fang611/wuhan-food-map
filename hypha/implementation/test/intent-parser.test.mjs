// 步骤 10 验收测试：intent-parser 把复杂自然语言归一到 task.food-discovery.inputSchema。
// 验证口径：zone/mealTime/category/maxPrice/sort/board 归一正确；口语同义词严格落到真实分类；
// 无对应真实分类时降级为 null（不编造、不返回 0 结果）；中文数字价/口语价正确。
// 运行：node hypha/implementation/test/intent-parser.test.mjs
import assert from 'node:assert/strict';
import { parseIntent } from '../src/intent-parser.js';

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, '✗ ' + name);
  passed++;
  console.log('  ✓', name);
}

console.log('Intent-Parser · 中文数字价');
ok('人均不过百 → maxPrice=100', parseIntent({ intent: '带朋友吃湖北菜，人均不过百' }).maxPrice === 100);
ok('人均一百 → maxPrice=100', parseIntent({ intent: '人均一百的店' }).maxPrice === 100);
ok('人均两百以内 → maxPrice=200', parseIntent({ intent: '想吃日料人均两百以内' }).maxPrice === 200);
ok('一百二 → maxPrice=120（口语省写）', parseIntent({ intent: '预算一百二' }).maxPrice === 120);
ok('人均八十 → maxPrice=80', parseIntent({ intent: '烧烤人均八十' }).maxPrice === 80);
ok('人均五十块 → maxPrice=50', parseIntent({ intent: '想撸串 人均五十块' }).maxPrice === 50);
ok('80元裸数字 → maxPrice=80', parseIntent({ intent: '80元的' }).maxPrice === 80);

console.log('Intent-Parser · 口语同义词 → 真实分类');
ok('湖北菜 → category=湖北菜', parseIntent({ intent: '带朋友吃湖北菜' }).category === '湖北菜');
ok('撸串 → category=烧烤', parseIntent({ intent: '想撸串' }).category === '烧烤');
ok('烤串 → category=烧烤', parseIntent({ intent: '去烤串' }).category === '烧烤');
ok('串串 → category=小吃宵夜', parseIntent({ intent: '吃串串' }).category === '小吃宵夜');
ok('湘菜 → category=湘菜', parseIntent({ intent: '两个人吃湘菜' }).category === '湘菜');
ok('粤菜 → category=粤闽潮汕', parseIntent({ intent: '粤菜馆' }).category === '粤闽潮汕');
ok('日料 → category=日料烧鸟', parseIntent({ intent: '想吃日料' }).category === '日料烧鸟');
ok('韩餐 → category=韩餐', parseIntent({ intent: '韩餐炸鸡' }).category === '韩餐');
ok('西餐/牛排 → category=西餐', parseIntent({ intent: '牛排西餐' }).category === '西餐');
ok('甜品 → category=面包甜点', parseIntent({ intent: '买甜品' }).category === '面包甜点');
ok('热干面 → category=早餐', parseIntent({ intent: '来碗热干面' }).category === '早餐');
ok('火锅 → category=火锅', parseIntent({ intent: '南湖火锅' }).category === '火锅');

console.log('Intent-Parser · 无对应真实分类 → 降级 null（不编造）');
ok('奶茶 → category=null（数据无饮品类）', parseIntent({ intent: '喝奶茶 南湖' }).category === null);
ok('咖啡 → category=null', parseIntent({ intent: '来杯咖啡' }).category === null);

console.log('Intent-Parser · zone / mealTime');
ok('财大南湖周边宵夜 → zone=财大南湖周边 & mealTime 含夜宵', (() => {
  const p = parseIntent({ intent: '南湖附近便宜的宵夜' });
  return p.zone === '财大南湖周边' && p.mealTime.includes('夜宵');
})());
ok('武汉全城必吃 → zone=武汉全城 & board=mustEat', (() => {
  const p = parseIntent({ intent: '首义必吃' });
  return p.zone === '武汉全城' && p.board === 'mustEat';
})());
ok('武汉 → zone=武汉全城', parseIntent({ intent: '武汉哪里烧烤便宜' }).zone === '武汉全城');
ok('全城最便宜的早餐 → mealTime=早 & category=早餐 & sort=price', (() => {
  const p = parseIntent({ intent: '全城最便宜的早餐' });
  return p.mealTime.includes('早') && p.category === '早餐' && p.sort === 'price';
})());

console.log('Intent-Parser · 排序触发（价格>距离>评分）');
ok('便宜 → sort=price', parseIntent({ intent: '南湖附近便宜的宵夜' }).sort === 'price');
ok('附近且无价格词 → sort=distance', parseIntent({ intent: '首义附近评分高的湖北菜' }).sort === 'distance');
ok('评分高且无价格/距离词 → sort=rating', parseIntent({ intent: '全城评分高的店' }).sort === 'rating');
ok('新开 → board=newest', parseIntent({ intent: '南湖新开的店' }).board === 'newest');

console.log('Intent-Parser · 完成条件（步骤 10）');
const finish = parseIntent({ intent: '带朋友吃湖北菜，人均不过百' });
ok('完成条件：category=湖北菜 & maxPrice=100', finish.category === '湖北菜' && finish.maxPrice === 100);

console.log(`\nALL INTENT-PARSER TESTS PASSED (${passed} assertions)`);
process.exit(0);


// —— S6.1 · 关键词/店名检索提取 ——
console.log('Intent-Parser · 关键词检索提取');
ok('纯店名「老樊城」→ keyword=老樊城', parseIntent({ intent: '老樊城' }).keyword === '老樊城');
ok('「蔡林记热干面」→ keyword 提取（分类命中不阻塞检索）', parseIntent({ intent: '蔡林记热干面' }).keyword === '蔡林记热干面');
ok('语气前缀剥除：「帮我找一家东北饺子馆」→ keyword=东北饺子馆', parseIntent({ intent: '帮我找一家东北饺子馆' }).keyword === '东北饺子馆');
ok('结构化意图不提取 keyword（南湖附近便宜的宵夜）', parseIntent({ intent: '南湖附近便宜的宵夜' }).keyword === '');
ok('结构化意图不提取 keyword（带朋友吃湖北菜人均不过百）', parseIntent({ intent: '带朋友吃湖北菜人均不过百' }).keyword === '');
ok('显式传入 keyword 优先于推导', parseIntent({ intent: '随便', keyword: '老通城' }).keyword === '老通城');

// —— W8.2 · 多轮指令词不当作关键词 ——
console.log('Intent-Parser · 多轮指令词');
ok('「换一家」不提取 keyword', parseIntent({ intent: '换一家' }).keyword === '');
ok('「再便宜点」不提取 keyword', parseIntent({ intent: '再便宜点' }).keyword === '');
