// 统一商户聚合层（单一入口）
// 把三源合并为一份 allMerchants，供前端 5 个视图（detail/ranking/map/account/list）消费：
//   1) merchants.js       —— normalize-data.mjs 生成（原 wuhan 540 + campus 50，已收敛为两类 zone）
//   2) robin-99.mjs       —— 论文致谢名单（rating 必吃，强背书）
//   3) web-stalls.mjs     —— 网络公开资料补充（财大周边小摊 + 武汉全城名吃）
// 按归一化店名去重（去空格/小写），保留首次出现，避免三源重复卡片。
// 所有源均遵循红线：坐标仅原 590 有真实 GCJ-02；robin-99 / web-stalls 坐标 null（绝不伪造）。

import { merchants } from './merchants.js';
import { robin99, toMerchantObjects as robinObjs } from './robin-99.mjs';
import { webStalls, toMerchantObjects as webObjs } from './web-stalls.mjs';

function normName(n) {
  return (n || '').toString().replace(/\s+/g, '').toLowerCase();
}

const seen = new Set();
const merged = [];
for (const m of [...merchants, ...robinObjs(robin99), ...webObjs(webStalls)]) {
  const key = normName(m.name);
  if (!key || seen.has(key)) continue;
  seen.add(key);
  merged.push(m);
}

export const allMerchants = merged;
export default allMerchants;
