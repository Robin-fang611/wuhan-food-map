// discover.navigate —— 仅抽取 ui/detail.js:buildAmapUrl 纯函数（公开 uri.amap.com，无 Key）
import { buildAmapUrl } from '../runtime.js';

export default async function discoverNavigate(input = {}) {
  const { lng, lat, name } = input;
  // 纯函数：缺坐标返回 null（守 nav.fake-coords 红线，绝不改写/编造坐标）。
  const url = buildAmapUrl({ lng: typeof lng === 'number' ? lng : undefined, lat: typeof lat === 'number' ? lat : undefined, name });
  if (!url) {
    return { success: true, output: { url: null, name: name ?? null, hint: '缺少有效坐标，导航不可用（守红线不编造）' } };
  }
  return { success: true, output: { url, name: name ?? null } };
}
