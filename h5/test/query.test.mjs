// 筛选/搜索/排序 纯函数测试（无 DOM，node 直接跑）。
import {
  ratingRank, parsePrice, distKm, searchMerchants,
  filterMerchants, sortMerchants, listCategories, CAMPUS_COORDS
} from '../src/core/query.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

// 小 fixtures（贴近真实字段与真实片区口径：数据只用「财大南湖周边 / 武汉全城」两片区）。
// 距离排序需要 lng/lat，故 fixture 也带坐标（合成参考点，仅用于单测，非真实商户坐标）。
const M = [
  { id: 'a', name: '老李热干面', zone: '财大南湖周边', category: '早餐', cuisine: '小吃', mealTime: ['早'], avgPrice: '8', rating: '必吃', signatureDishes: '热干面、豆皮', reason: '过早之王', lng: 114.3710, lat: 30.4810 },
  { id: 'b', name: '川味火锅', zone: '财大南湖周边', category: '火锅', cuisine: '火锅', mealTime: ['午', '晚'], avgPrice: '120', rating: '推荐', signatureDishes: '牛油锅底', reason: '', lng: 114.3690, lat: 30.4790 },
  { id: 'c', name: '南湖烧烤摊', zone: '武汉全城', category: '烧烤', cuisine: '烧烤', mealTime: ['晚', '夜宵'], avgPrice: '55', rating: '', signatureDishes: '烤筋子、烤鱼', reason: '宵夜好去处', lng: 114.3431, lat: 30.5864 },
  { id: 'd', name: '全城湘菜馆', zone: '武汉全城', category: '湘菜', cuisine: '湘菜', mealTime: ['午', '晚'], avgPrice: '', rating: '推荐', signatureDishes: '剁椒鱼头', reason: '', lng: 114.3055, lat: 30.5928 },
  { id: 'e', name: '深夜饺子', zone: '财大南湖周边', category: '小吃宵夜', cuisine: '饺子', mealTime: ['夜宵'], avgPrice: '20', rating: '必吃', signatureDishes: '三鲜饺子', reason: '', lng: 114.3720, lat: 30.4820 }
];

console.log('# 基础工具');
ok(parsePrice('68') === 68, 'parsePrice 字符串→数字');
ok(parsePrice('') === null, 'parsePrice 空→null');
ok(parsePrice(null) === null, 'parsePrice null→null');
ok(ratingRank('必吃') === 3 && ratingRank('推荐') === 2 && ratingRank('') === 0, 'ratingRank 权重正确');
const d = distKm(CAMPUS_COORDS['财大南湖周边'], CAMPUS_COORDS['武汉全城']);
ok(d > 8 && d < 18, `财大南湖周边↔武汉全城 距离在合理范围 (${d.toFixed(1)}km)`);

console.log('# 筛选');
ok(filterMerchants(M, { zone: '财大南湖周边' }).length === 3, '按 zone=财大南湖周边 筛出 3 条');
ok(filterMerchants(M, {}).length === 5, '无筛选返回全部');
ok(filterMerchants(M, { categories: ['火锅', '烧烤'] }).length === 2, '分类多选筛选');
ok(filterMerchants(M, { mealTime: ['夜宵'] }).length === 2, '场景=夜宵 筛出 2 条');
ok(filterMerchants(M, { maxPrice: 50 }).length === 2, '人均≤50 筛出 2 条（c=55 与均价空缺的 d 被排除）');
ok(filterMerchants(M, { zone: '财大南湖周边', maxPrice: 50 }).length === 2, '组合：财大南湖周边 + 人均≤50');

console.log('# 搜索');
ok(searchMerchants(M, '饺子').length === 1, '搜「饺子」命中招牌菜');
ok(searchMerchants(M, '热干面').length === 1, '搜「热干面」命中店名');
ok(searchMerchants(M, '宵夜').length === 1, '搜「宵夜」命中 reason');
ok(searchMerchants(M, '').length === 5, '空关键词不筛选');
ok(filterMerchants(M, { keyword: '烤' }).length === 1, 'filterMerchants 透传 keyword');

console.log('# 排序');
const byRating = sortMerchants(M, { sort: 'rating' });
ok(byRating[0].id === 'a' && byRating[1].id === 'e', '评分排序：必吃在前');
const byPrice = sortMerchants(M, { sort: 'price' });
ok(byPrice[0].id === 'a' && byPrice[byPrice.length - 1].id === 'd', '价格升序：最便宜(a=8)在前、均价空缺(d)垫底');
const byDist = sortMerchants(M.filter(m => m.zone === '财大南湖周边'), { sort: 'distance', fromCoord: CAMPUS_COORDS['财大南湖周边'] });
ok(byDist.length === 3, '距离排序不丢数据');

console.log('# 派生分类');
ok(listCategories(M).length === 5, 'listCategories 去重计数');

console.log(`\nquery 测试： ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
