// datasource/sample.js —— 框架默认数据源（明显合成，非真实商户）。
// 仅用于证明「美食发现 Agent 框架」不依赖任何具体数据集即可端到端跑通：
// 意图解析 → 筛选/榜单/距离 → 输出契约 + 溯源，且与真实数据集走同一套代码路径。
import { FoodDataSource } from './base.js';
import { registerDataSource } from './registry.js';

// 通用坐标（仅用于距离计算演示；非任何真实店铺位置）
const SAMPLE_ZONE_COORDS = {
  财大南湖周边: { lng: 114.370, lat: 30.480 },
  武汉全城: { lng: 114.337, lat: 30.510 }, // 中心参考点
};

// 7 条合成商户：跨 zone / 分类 / 评分 / 价位 / 含缺坐标样本（演示降级）。
const SAMPLE_MERCHANTS = [
  { id: 's001', name: '样例·楚味小馆(武汉全城)', zone: '武汉全城', category: '湖北菜', cuisine: '鄂菜', mealTime: ['午', '晚'], avgPrice: '45', rating: '必吃', signatureDishes: '莲藕排骨汤、沔阳三蒸', reason: '校园口碑老店', address: '样例路1号', lng: 114.306, lat: 30.544, has_coupon: false, coupon_summary: '' },
  { id: 's002', name: '样例·夜市烤串(武汉全城)', zone: '武汉全城', category: '小吃宵夜', cuisine: '烧烤', mealTime: ['夜宵'], avgPrice: '22', rating: '推荐', signatureDishes: '烤五花、烤茄子', reason: '深夜食堂', address: '样例路2号', lng: 114.304, lat: 30.542, has_coupon: false, coupon_summary: '' },
  { id: 's003', name: '样例·湖畔烧烤(财大南湖周边)', zone: '财大南湖周边', category: '烧烤', cuisine: '烧烤', mealTime: ['晚', '夜宵'], avgPrice: '50', rating: '推荐', signatureDishes: '烤生蚝、烤脑花', reason: '湖景夜宵', address: '南湖路3号', lng: 114.371, lat: 30.481, has_coupon: false, coupon_summary: '' },
  { id: 's004', name: '样例·南湖宵夜摊(财大南湖周边)', zone: '财大南湖周边', category: '小吃宵夜', cuisine: '小吃', mealTime: ['夜宵'], avgPrice: '18', rating: '必吃', signatureDishes: '炒粉、卤味', reason: '便宜大碗', address: '南湖路4号', lng: 114.369, lat: 30.479, has_coupon: false, coupon_summary: '' },
  { id: 's005', name: '样例·南湖湖北菜(财大南湖周边)', zone: '财大南湖周边', category: '湖北菜', cuisine: '鄂菜', mealTime: ['午', '晚'], avgPrice: '65', rating: null, signatureDishes: '清蒸武昌鱼', reason: '', address: '南湖路5号', lng: undefined, lat: undefined, has_coupon: false, coupon_summary: '' },
  { id: 's006', name: '样例·过早铺子(武汉全城)', zone: '武汉全城', category: '早餐', cuisine: '早点', mealTime: ['早'], avgPrice: '10', rating: '推荐', signatureDishes: '热干面、豆皮', reason: '本地过早', address: '全城路6号', lng: 114.338, lat: 30.511, has_coupon: false, coupon_summary: '' },
  { id: 's007', name: '样例·中心火锅(武汉全城)', zone: '武汉全城', category: '火锅', cuisine: '火锅', mealTime: ['晚'], avgPrice: '88', rating: '推荐', signatureDishes: '牛油锅底', reason: '聚餐首选', address: '全城路7号', lng: 114.336, lat: 30.509, has_coupon: false, coupon_summary: '' },
];

class SampleDataSource extends FoodDataSource {
  get name() {
    return 'sample-v1';
  }

  async listMerchants() {
    return SAMPLE_MERCHANTS.map((m) => ({ ...m }));
  }

  async getMerchantById(id) {
    return SAMPLE_MERCHANTS.find((m) => m.id === id) || null;
  }

  getCategories() {
    return [...new Set(SAMPLE_MERCHANTS.map((m) => m.category))];
  }

  getZoneCoords(zone) {
    return SAMPLE_ZONE_COORDS[zone] || SAMPLE_ZONE_COORDS['武汉全城'];
  }
}

registerDataSource('sample', () => new SampleDataSource());
