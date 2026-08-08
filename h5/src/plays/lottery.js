// 玩法插件：幸运抽奖（v2 预留玩法，本轮落地）。
// 实现 PlayPlugin 契约：id / name / desc / getStatus / canParticipate / participate / render。
// 设计要点（防刷，见 §8）：每日免费抽 1 次，限频防刷；随机但权重可控，rng 可注入便于测试。
import { store } from '../core/store.js';
import { issueCoupon } from '../core/couponIssuer.js';
import { todayStr } from '../utils/date.js';
import { pickLotteryPrize } from '../data/couponCatalog.js';
import { LotteryPanel } from '../ui/lotteryPanel.js';

const DAILY_LIMIT = 1; // 每日免费抽 1 次（限频，防刷）

function isSameDay(ts, dayStr) {
  return typeof ts === 'number' && todayStr(new Date(ts)) === dayStr;
}

export const lotteryPlugin = {
  id: 'lottery',
  name: '幸运抽奖',
  desc: '每日免费抽 1 次，随机得通用券',
  rng: Math.random, // 可注入，便于测试确定性结果

  // 当前进度：今日已抽次数 / 是否可抽
  async getStatus(userId) {
    const today = todayStr();
    const used = (await store.getCoupons(userId))
      .filter((c) => c.play_type === 'lottery' && isSameDay(c.issued_at, today)).length;
    return { dailyUsed: used, dailyLimit: DAILY_LIMIT, canDraw: used < DAILY_LIMIT };
  },

  // 资格校验：同日限频（防刷）
  async canParticipate(userId) {
    const st = await this.getStatus(userId);
    if (!st.canDraw) return { allowed: false, reason: '今天已经抽过啦，明天再来~' };
    return { allowed: true };
  },

  // 执行抽奖：按权重随机挑奖 → 调 CouponIssuer 发券
  async participate(userId) {
    const gate = await this.canParticipate(userId);
    if (!gate.allowed) return { ok: false, reason: gate.reason };
    const prize = pickLotteryPrize(this.rng);
    const coupon = await issueCoupon(userId, {
      title: prize.title, discountDesc: prize.discountDesc,
      playType: 'lottery', amount: prize.amount, validDays: prize.validDays
    });
    const status = await this.getStatus(userId);
    return { ok: true, status, coupons: [coupon], prize };
  },

  // 返回该玩法的 UI 片段（由宿主页嵌入）
  render(ctx) { return LotteryPanel(ctx); }
};
