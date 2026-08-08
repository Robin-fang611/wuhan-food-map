// 玩法插件：每日签到（v1 唯一实现的玩法）。
// 实现 PlayPlugin 契约：id / name / desc / getStatus / canParticipate / participate / render。
import { store } from '../core/store.js';
import { issueCoupon } from '../core/couponIssuer.js';
import { todayStr, shiftDays } from '../utils/date.js';
import { pickTier, CHECKIN_BONUS } from '../data/couponCatalog.js';
import { CheckinPanel } from '../ui/checkinPanel.js';

export const checkinPlugin = {
  id: 'checkin',
  name: '每日签到',
  desc: '连续签到得通用券，满 7 天额外奖励',

  // 当前进度（连续天数、今天是否已签、最近记录）
  async getStatus(userId) {
    const c = await store.getCheckin(userId);
    return {
      streak: c.streak || 0,
      lastDate: c.lastDate || null,
      signedToday: c.lastDate === todayStr(),
      dates: c.dates || []
    };
  },

  // 资格校验：同日不可重复签到（防作弊第一道）
  async canParticipate(userId) {
    const c = await store.getCheckin(userId);
    if (c.lastDate === todayStr()) {
      return { allowed: false, reason: '今天已经签到啦，明天再来~' };
    }
    return { allowed: true };
  },

  // 执行签到：更新连续天数 → 调 CouponIssuer 发券
  async participate(userId) {
    const c = await store.getCheckin(userId);
    const today = todayStr();
    // 连续判定：上次是昨天 → +1；否则断签重计为 1
    const streak = c.lastDate === shiftDays(today, -1) ? (c.streak || 0) + 1 : 1;
    const dates = [...(c.dates || []), today].slice(-30); // 仅保留近 30 天记录
    await store.saveCheckin(userId, { streak, lastDate: today, dates });

    const tier = pickTier(streak);
    const coupon = await issueCoupon(userId, {
      title: tier.title, discountDesc: tier.discountDesc,
      playType: 'checkin', amount: tier.amount
    });

    // 每满 7 天额外奖励
    const bonus = streak % 7 === 0
      ? await issueCoupon(userId, {
          title: CHECKIN_BONUS.title, discountDesc: CHECKIN_BONUS.discountDesc,
          playType: 'checkin', amount: CHECKIN_BONUS.amount, validDays: CHECKIN_BONUS.validDays
        })
      : null;

    return {
      status: { streak, signedToday: true, lastDate: today, dates },
      coupons: bonus ? [coupon, bonus] : [coupon],
      bonus: !!bonus
    };
  },

  // 返回该玩法的 UI 片段（由宿主页嵌入）
  render(ctx) { return CheckinPanel(ctx); }
};
