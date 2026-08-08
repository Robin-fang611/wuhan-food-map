// 榜单纯函数测试（无 DOM，node 直接跑）。
import { rankMustEat, rankValue, rankLateNight, rankNew, buildRankings } from '../src/core/ranking.js';
import { parsePrice } from '../src/core/query.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

// 贴近真实字段的 fixtures（注意：无价格/无评级/地推 用于边界用例）
const M = [
  { id: 'm0100', name: '必吃便宜', zone: '首义', category: '早餐', cuisine: '', mealTime: ['早'], avgPrice: '8', rating: '必吃', source: '编辑', status: '已发布' },
  { id: 'm0101', name: '必吃贵',   zone: '首义', category: '火锅', cuisine: '', mealTime: ['午', '晚'], avgPrice: '120', rating: '必吃', source: '编辑', status: '已发布' },
  { id: 'm0200', name: '推荐中等', zone: '南湖', category: '湘菜', cuisine: '', mealTime: ['午', '晚'], avgPrice: '66', rating: '推荐', source: '编辑', status: '已发布' },
  { id: 'm0201', name: '夜宵必吃', zone: '首义', category: '小吃宵夜', cuisine: '', mealTime: ['夜宵'], avgPrice: '20', rating: '必吃', source: '编辑', status: '已发布' },
  { id: 'm0202', name: '夜宵推荐', zone: '南湖', category: '烧烤', cuisine: '', mealTime: ['夜宵'], avgPrice: '55', rating: '推荐', source: '编辑', status: '已发布' },
  { id: 'm0300', name: '无评级',   zone: '全城', category: '湖北菜', cuisine: '', mealTime: ['午'], avgPrice: '40', rating: '', source: '编辑', status: '已发布' },
  { id: 'm0400', name: '新收录A',  zone: '全城', category: '面包甜点', cuisine: '', mealTime: [], avgPrice: '30', rating: '推荐', source: '地推', status: '已发布' },
  { id: 'm0401', name: '新收录B',  zone: '全城', category: '西餐', cuisine: '', mealTime: [], avgPrice: '80', rating: '必吃', source: '地推', status: '已发布' },
  { id: 'm0500', name: '无价格推荐', zone: '全城', category: '日料烧鸟', cuisine: '', mealTime: ['晚'], avgPrice: '', rating: '推荐', source: '编辑', status: '已发布' }
];

console.log('# 必吃榜');
const best = rankMustEat(M);
ok(best.length === 4, `必吃榜含 4 条 (实际 ${best.length})`);
ok(best.every((m) => m.rating === '必吃'), '必吃榜全部为必吃');
ok(best[0].id === 'm0100' && best[1].id === 'm0201', '必吃榜按人均升序(8 < 20 < 80 < 120)');

console.log('# 性价比榜');
const val = rankValue(M);
ok(val.length === 7, `性价比榜含 7 条(必吃/推荐且有价) (实际 ${val.length})`);
ok(val.every((m) => (m.rating === '必吃' || m.rating === '推荐') && parsePrice(m.avgPrice) != null), '性价比榜剔除无价格/无评级项');
ok(val[0].id === 'm0100' && val[val.length - 1].id === 'm0101', '性价比榜最高分(必吃¥8)在前、最低分(必吃¥120)垫底');

console.log('# 夜宵榜');
const night = rankLateNight(M);
ok(night.length === 2, `夜宵榜含 2 条(mealTime 含夜宵) (实际 ${night.length})`);
ok(night[0].id === 'm0201' && night[1].id === 'm0202', '夜宵榜必吃先于推荐');

console.log('# 新收录');
const neu = rankNew(M);
ok(neu.length === 2, `新收录含 2 条(source=地推) (实际 ${neu.length})`);
ok(neu[0].id === 'm0401' && neu[1].id === 'm0400', '新收录按 id 倒序(越新越前)');

console.log('# 组合与边界');
const all = buildRankings(M, { limit: 1 });
ok(all.mustEat.length === 1 && all.value.length === 1 && all.lateNight.length === 1 && all.newest.length === 1, 'buildRankings 按 limit 截断每榜');
const snap = JSON.stringify(M);
rankMustEat(M); rankValue(M); rankLateNight(M); rankNew(M); buildRankings(M);
ok(JSON.stringify(M) === snap, '榜单函数不修改原数组');
ok(rankMustEat([]).length === 0 && rankValue([]).length === 0, '空入参返回空数组');

console.log(`\nranking 测试： ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
