// 抽奖玩法 UI 片段（嵌入首页）。通过 rewardEngine.participate 调度，不直接触碰存储。
import { h, clear, toast } from './dom.js';
import { participate, getStatus } from '../core/rewardEngine.js';

export async function LotteryPanel(ctx) {
  const { userId, onChanged } = ctx;
  const root = h('div', { class: 'card' });

  async function mount() {
    clear(root);
    const st = await getStatus('lottery', userId);

    const btn = h('button', {
      class: 'btn btn-primary btn-block',
      text: st.canDraw ? '免费抽一次' : '今日已抽 ✓',
      onclick: async () => {
        const res = await participate('lottery', userId);
        if (!res.ok) { toast(res.reason || '抽奖失败'); return; }
        toast(`抽中：${res.prize.title}`);
        if (onChanged) onChanged();
        mount();
      }
    });
    if (!st.canDraw) btn.disabled = true;

    root.appendChild(h('div', { class: 'reward-hint', text: '每日 1 次免费抽奖，随机得通用券（防刷限频）。' }));
    root.appendChild(h('div', { style: 'margin-top:12px' }, [btn]));
  }

  await mount();
  return root;
}
