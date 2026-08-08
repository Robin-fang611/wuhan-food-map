// 商家券玩法 UI 片段（嵌入商户详情页，对应 §4.3 领券按钮）。
// 通过 rewardEngine.participate('claim', userId, ctx) 调度，ctx 带 merchantId/merchantName/summary。
import { h, clear, toast } from './dom.js';
import { participate, getStatus } from '../core/rewardEngine.js';

export async function ClaimPanel(ctx) {
  const { userId, merchantId, merchantName, summary, onChanged } = ctx;
  const root = h('div', { class: 'card detail-claim' });

  async function mount() {
    clear(root);
    const st = await getStatus('claim', userId, { merchantId });

    const btn = h('button', {
      class: 'btn btn-primary btn-block',
      text: st.claimed ? '已领取 ✓' : '一键领券',
      onclick: async () => {
        const res = await participate('claim', userId, { merchantId, merchantName, summary });
        if (!res.ok) { toast(res.reason || '领取失败'); return; }
        toast(`已领：${res.coupons[0].title}`);
        if (onChanged) onChanged();
        mount();
      }
    });
    if (st.claimed) btn.disabled = true;

    if (summary) root.appendChild(h('div', { class: 'detail-coupon', text: summary }));
    root.appendChild(h('div', { style: 'margin-top:12px' }, [btn]));
  }

  await mount();
  return root;
}
