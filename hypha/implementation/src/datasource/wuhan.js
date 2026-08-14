// datasource/wuhan.js —— 真实数据集接入点（暂不设为默认）。
// 包装 runtime.js 的 ALL_MERCHANTS（武汉 860 商户：merchants 567 + robin-99 + web-stalls，V4.4 S2 统一口径）+ CAMPUS_COORDS。
// 框架默认不启用；后续「灌数据」时由调用方 setDefaultDataSource(createDataSource('wuhan')) 或
// 设 env MYWO_DATASOURCE=wuhan 启用。本文件改动不影响默认 sample 行为。
import { FoodDataSource } from './base.js';
import { registerDataSource } from './registry.js';
import { ALL_MERCHANTS, CAMPUS_COORDS, WUHAN_CENTER, listCategories } from '../runtime.js';

class WuhanDataSource extends FoodDataSource {
  get name() {
    return 'wuhan';
  }

  async listMerchants() {
    return ALL_MERCHANTS;
  }

  async getMerchantById(id) {
    return ALL_MERCHANTS.find((m) => m.id === id) || null;
  }

  getCategories() {
    return listCategories();
  }

  getZoneCoords(zone) {
    return CAMPUS_COORDS[zone] || WUHAN_CENTER;
  }
}

registerDataSource('wuhan', () => new WuhanDataSource());
