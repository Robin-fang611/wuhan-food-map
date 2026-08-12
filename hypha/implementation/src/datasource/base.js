// datasource/base.js —— 美食数据抽象基类（框架与具体数据集的解耦边界）。
// 任何数据集（样例 / 武汉 590 / 未来其他城市）都实现该接口即可被 Agent 框架消费，
// 框架本身（工具 / 编排 / FSM / 契约）不感知具体数据来源。
export class FoodDataSource {
  // 数据源标识（用于溯源 provenance）
  get name() {
    throw new Error('FoodDataSource.name 未实现');
  }

  // 全量商户原始记录（数组；字段形态对齐输出契约前置字段）
  async listMerchants() {
    throw new Error('listMerchants 未实现');
  }

  // 按 id 取单店；不存在返回 null
  async getMerchantById(id) {
    throw new Error('getMerchantById 未实现');
  }

  // 该数据集可用的分类清单（数组）
  getCategories() {
    throw new Error('getCategories 未实现');
  }

  // 距离计算的参考坐标 {lng,lat}；无对应区域返回 null
  getZoneCoords(zone) {
    return null;
  }
}
