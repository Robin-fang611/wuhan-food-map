// 玩法插件：新人任务（v2 预留玩法，本轮落地）。
// 实现 PlayPlugin 契约。一次性任务奖励：完成即领，不可重复（防刷/防重复）。
import { store } from '../core/store.js';
import { issueCoupon } from '../core/couponIssuer.js';
import { TASK_REWARD } from '../data/couponCatalog.js';
import { TaskPanel } from '../ui/taskPanel.js';

export const taskPlugin = {
  id: 'task',
  name: '新人任务',
  desc: '完成新手任务，领一次性见面礼券',

  // 当前进度：是否已领取
  async getStatus(userId) {
    const done = (await store.getCoupons(userId)).some((c) => c.play_type === 'task');
    return { done };
  },

  // 资格校验：一次性，已领不可再领
  async canParticipate(userId) {
    const st = await this.getStatus(userId);
    if (st.done) return { allowed: false, reason: '任务奖励已领取~' };
    return { allowed: true };
  },

  // 执行任务：发一次性见面礼券
  async participate(userId) {
    const gate = await this.canParticipate(userId);
    if (!gate.allowed) return { ok: false, reason: gate.reason };
    const coupon = await issueCoupon(userId, {
      title: TASK_REWARD.title, discountDesc: TASK_REWARD.discountDesc,
      playType: 'task', amount: TASK_REWARD.amount, validDays: TASK_REWARD.validDays
    });
    return { ok: true, status: { done: true }, coupons: [coupon] };
  },

  render(ctx) { return TaskPanel(ctx); }
};
