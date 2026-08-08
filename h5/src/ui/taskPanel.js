// 任务玩法 UI 片段（嵌入首页）。通过 rewardEngine.participate 调度，不直接触碰存储。
import { h, clear, toast } from './dom.js';
import { participate, getStatus } from '../core/rewardEngine.js';

export async function TaskPanel(ctx) {
  const { userId, onChanged } = ctx;
  const root = h('div', { class: 'card' });

  async function mount() {
    clear(root);
    const st = await getStatus('task', userId);

    const btn = h('button', {
      class: 'btn btn-primary btn-block',
      text: st.done ? '已领取 ✓' : '领取新人礼',
      onclick: async () => {
        const res = await participate('task', userId);
        if (!res.ok) { toast(res.reason || '领取失败'); return; }
        toast(`领到：${res.coupons[0].title}`);
        if (onChanged) onChanged();
        mount();
      }
    });
    if (st.done) btn.disabled = true;

    root.appendChild(h('div', { class: 'reward-hint', text: '完成新手任务，领一次性见面礼券。' }));
    root.appendChild(h('div', { style: 'margin-top:12px' }, [btn]));
  }

  await mount();
  return root;
}
