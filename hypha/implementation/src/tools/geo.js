// discover.geo —— 数据来自 FoodDataSource（默认 sample），按 fromZone 参考点就近排序。
import { distKm, projectMerchant } from '../runtime.js';
import { getDataSource } from '../datasource/index.js';

export default async function discoverGeo(input = {}) {
  const { merchants = await getDataSource().listMerchants(), fromZone } = input;
  if (!Array.isArray(merchants)) return { success: false, error: 'merchants 必须是数组' };
  const ref = getDataSource().getZoneCoords(fromZone);
  let missingCoords = 0;
  const withDist = merchants.map((m) => {
    const hasCoord = typeof m.lng === 'number' && typeof m.lat === 'number';
    if (!hasCoord) missingCoords += 1;
    const distanceKm = (ref && hasCoord) ? distKm(m, ref) : null;
    return { m, distanceKm };
  });
  // 有坐标的按距离升序在前；缺坐标的排后（distanceKm=null），不编造距离。
  withDist.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });
  return {
    success: true,
    output: {
      merchants: withDist.map(({ m, distanceKm }) => projectMerchant(m, { distanceKm })),
      fromZone: fromZone || '武汉全城',
      missingCoords,
    },
  };
}
