// discover.filter —— 薄绑 core/query.js:filterMerchants（数据来自 FoodDataSource，默认 sample）。
import { filterMerchants, projectMerchant } from '../runtime.js';
import { getDataSource } from '../datasource/index.js';

export default async function discoverFilter(input = {}) {
  const {
    merchants = await getDataSource().listMerchants(),
    zone = '',
    categories = [],
    mealTime = [],
    maxPrice = null,
    keyword = '',
  } = input;
  if (!Array.isArray(merchants)) return { success: false, error: 'merchants 必须是数组', hint: '传入商户数组或使用默认数据源' };
  const filtered = filterMerchants(merchants, { zone, categories, mealTime, maxPrice, keyword });
  return {
    success: true,
    output: { merchants: filtered.map((m) => projectMerchant(m)) },
  };
}
