// 优惠券档位配置（签到玩法用）。集中在此，便于运营调整，不改玩法逻辑。
// 全部为「通用券」（platform 通用，v1 不绑具体商家，降低冷启动复杂度）。

// 按连续天数发放的基础券（streak 1~6）
export const CHECKIN_TIERS = [
  { minStreak: 1, amount: 3,  title: '满20减3 通用券', discountDesc: '到店出示二维码，满20元立减3元', validDays: 30 },
  { minStreak: 3, amount: 6,  title: '满30减6 通用券', discountDesc: '到店出示二维码，满30元立减6元', validDays: 30 }
];

// 每满 7 天连续，额外发放的大奖券
export const CHECKIN_BONUS = {
  amount: 12, title: '满50减12 通用券', discountDesc: '连续签到7天奖励，到店满50元立减12元', validDays: 45
};

// 根据连续天数挑基础券（取满足条件的最高档）
export function pickTier(streak) {
  let chosen = CHECKIN_TIERS[0];
  for (const t of CHECKIN_TIERS) if (streak >= t.minStreak) chosen = t;
  return chosen;
}

// 抽奖奖品池（lottery 玩法用）。weight 为相对权重，rng 可注入便于测试。
// 全部为「通用券」（与签到一致，v1 不绑具体商家，降低冷启动复杂度）。
export const LOTTERY_PRIZES = [
  { title: '满15减2 通用券', discountDesc: '到店出示二维码，满15元立减2元', amount: 2,  validDays: 14, weight: 40 },
  { title: '满20减4 通用券', discountDesc: '到店出示二维码，满20元立减4元', amount: 4,  validDays: 21, weight: 30 },
  { title: '满30减8 通用券', discountDesc: '到店出示二维码，满30元立减8元', amount: 8,  validDays: 30, weight: 20 },
  { title: '满50减15 通用券', discountDesc: '手气爆发！满50元立减15元', amount: 15, validDays: 45, weight: 10 }
];

// 按权重抽一个奖品；rng 可注入（测试用确定性随机）。
export function pickLotteryPrize(rng = Math.random) {
  const total = LOTTERY_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (const p of LOTTERY_PRIZES) { if ((r -= p.weight) < 0) return p; }
  return LOTTERY_PRIZES[LOTTERY_PRIZES.length - 1];
}

// 任务奖励（task 玩法用）：一次性新手见面礼。
export const TASK_REWARD = {
  title: '新人见面礼 通用券', discountDesc: '完成任务礼：到店满25元立减5元', amount: 5, validDays: 30
};

// 直接领商家券默认配置（claim 玩法用；具体券面以商户 coupon_summary 为准）。
export const CLAIM_DEFAULT = { amount: 5, titleSuffix: '专属券' };
