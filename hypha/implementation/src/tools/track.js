// analytics.track —— 薄绑 core/analytics.js:LocalAnalytics.track（递归剥离 PII，匿名 vid，本地缓冲）
import { getAnalytics, EVENTS } from '../runtime.js';

export default async function analyticsTrack(input = {}) {
  const { event, payload } = input;
  if (typeof event !== 'string' || !event) {
    return { success: false, error: '缺少 event（行为事件名）' };
  }
  const analytics = getAnalytics();
  // track 内部会经 sanitize 递归剥离 PII 键与嵌套对象，传入的 payload 即使含 user_id/name 等也绝不会入库。
  const r = await analytics.track(event, payload || {});
  return {
    success: true,
    output: {
      event,
      queued: r.queued,
      sampled: r.sampled,
      piiStripped: true,
      vid: analytics.vid, // 匿名访客 ID（非 PII，用于 DAU 去重）
      knownEvent: Object.values(EVENTS).includes(event),
    },
  };
}
