// discover.detail —— 数据来自 FoodDataSource（默认 sample），按 merchantId 取单店。
import { distKm, projectMerchant } from '../runtime.js';
import { getDataSource } from '../datasource/index.js';

export default async function discoverDetail(input = {}) {
  const { merchantId, zone } = input;
  if (!merchantId) return { success: false, error: '缺少 merchantId' };
  const ds = getDataSource();
  const m = await ds.getMerchantById(merchantId);
  if (!m) return { success: false, error: `未找到商户: ${merchantId}`, hint: 'merchantId 不存在' };
  const ref = ds.getZoneCoords(zone || m.zone);
  const hasCoord = typeof m.lng === 'number' && typeof m.lat === 'number';
  const distanceKm = (ref && hasCoord) ? distKm(m, ref) : null;
  return { success: true, output: projectMerchant(m, { distanceKm }) };
}
