// 签到玩法 UI 片段（嵌入首页）。通过 rewardEngine.participate 调度，不直接触碰存储。
import { h, clear, toast } from './dom.js';
import { participate, getStatus } from '../core/rewardEngine.js';
import { last7Days, dowLabel, todayStr } from '../utils/date.js';
import { CHECKIN_BONUS } from '../data/couponCatalog.js';

export async function CheckinPanel(ctx) {
  const { userId, onChanged } = ctx;
  const root = h('div', { class: 'card' });

  async function mount() {
    clear(root);
    const st = await getStatus('checkin', userId);

    const strip = h('div', { class: 'streak-strip' });
    for (const d of last7Days()) {
      const done = st.dates.includes(d);
      const isToday = d === todayStr();
      strip.appendChild(h('div', {
        class: ['streak-day', done ? 'done' : '', isToday ? 'today' : ''].filter(Boolean).join(' ')
      }, [
        h('span', { class: 'dow', text: dowLabel(d) }),
        h('span', { text: done ? '✓' : (isToday ? '今' : '') })
      ]));
    }

    const nextHint = (st.streak > 0 && (st.streak + 1) % 7 === 0)
      ? `再签到 1 天得「${CHECKIN_BONUS.title}」大奖！`
      : `连续签到越久，券越大；每满 7 天额外有奖。`;

    const btn = h('button', {
      class: 'btn btn-primary btn-block',
      text: st.signedToday ? '今日已签到 ✓' : '今日签到 · 领通用券',
      onclick: async () => {
        const res = await participate('checkin', userId);
        if (!res.ok) { toast(res.reason || '签到失败'); return; }
        toast(res.bonus
          ? `连续 ${res.status.streak} 天！得券 ${res.coupons.length} 张（含大奖）`
          : `连续 ${res.status.streak} 天！得券 ${res.coupons.length} 张`);
        if (onChanged) onChanged();
        mount();
      }
    });
    if (st.signedToday) btn.disabled = true;

    root.appendChild(h('div', { class: 'streak-num', text: `连续 ${st.streak} 天` }));
    root.appendChild(strip);
    root.appendChild(h('div', { class: 'reward-hint', text: nextHint }));
    root.appendChild(h('div', { style: 'margin-top:12px' }, [btn]));
  }

  await mount();
  return root;
}
