// discover.rank —— 薄绑 core/ranking.js（数据来自 FoodDataSource，默认 sample）。
import { rankMustEat, rankValue, rankLateNight, rankNew, projectMerchant } from '../runtime.js';
import { getDataSource } from '../datasource/index.js';

const BOARDS = {
  mustEat: rankMustEat,
  value: rankValue,
  lateNight: rankLateNight,
  newest: rankNew,
};
const RANKED_BY = { mustEat: 'mustEat', value: 'value', lateNight: 'lateNight', newest: 'newest' };

export default async function discoverRank(input = {}) {
  const { merchants = await getDataSource().listMerchants(), board = 'mustEat', limit = 0 } = input;
  if (!BOARDS[board]) {
    return { success: false, error: `未知 board: ${board}`, hint: '可选 mustEat/value/lateNight/newest' };
  }
  if (!Array.isArray(merchants)) return { success: false, error: 'merchants 必须是数组' };
  const ranked = BOARDS[board](merchants, { limit: Number(limit) || 0 });
  return {
    success: true,
    output: { merchants: ranked.map((m) => projectMerchant(m)), board, ranked_by: RANKED_BY[board] },
  };
}
