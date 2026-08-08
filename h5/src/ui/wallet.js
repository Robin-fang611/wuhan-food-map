// 我的券包：列表 + 票号条 + 点击出示核销二维码（原型占位码）。
import { h } from './dom.js';
import { store } from '../core/store.js';
import { isExpired, ticketNo } from '../core/couponIssuer.js';
import { drawFakeQR } from './qr.js';

export async function Wallet(ctx) {
  const { userId, onBack } = ctx;
  const root = h('div');
  const list = await store.getCoupons(userId);
  const now = Date.now();

  const sorted = [...list].sort((a, b) => {
    const rank = (c) => (c.status === '已得' ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return a.expires_at - b.expires_at;
  });

  root.appendChild(h('div', { class: 'section' }, [
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px' }, [
      h('h2', { text: '我的优惠券' }),
      onBack ? h('button', { class: 'nav-btn', text: '返回', onclick: onBack }) : null
    ])
  ]));

  if (sorted.length === 0) {
    root.appendChild(h('div', { class: 'empty', text: '还没有券，去首页签到领券吧~' }));
    return root;
  }

  const grid = h('div', { class: 'section', style: 'padding-top:0' });
  for (const c of sorted) {
    const expired = isExpired(c, now);
    const statusText = c.status === '已核销' ? '已核销' : expired ? '已过期' : '待使用';
    const tile = h('div', {
      class: `ticket ${c.status === '已核销' ? 'used' : ''} ${expired ? 'expired' : ''}`
    }, [
      h('div', { class: 'status-pill', text: statusText }),
      h('div', { class: 'stub' }, [h('div', { class: 'amt', text: `¥${c.amount}` })]),
      h('div', { class: 'body' }, [
        h('div', { class: 't-title', text: c.title }),
        h('div', { class: 't-desc', text: c.discount_desc }),
        h('div', { class: 't-bar' }, [
          h('span', { text: ticketNo(c) }),
          h('span', { text: c.code })
        ])
      ])
    ]);
    if (c.status === '已得' && !expired) tile.addEventListener('click', () => openQR(c));
    grid.appendChild(tile);
  }
  root.appendChild(grid);
  return root;
}

function openQR(coupon) {
  const mask = h('div', { class: 'mask' });
  const canvas = h('canvas', { class: 'qr-canvas', width: 180, height: 180 });
  const sheet = h('div', { class: 'sheet' }, [
    h('div', { class: 't-title center', text: coupon.title, style: 'margin-bottom:6px' }),
    h('div', { class: 'qr-wrap' }, [
      canvas,
      h('div', { class: 'qr-code-text', text: coupon.code }),
      h('div', { class: 'muted center', style: 'font-size:12px', text: '到店出示给商家扫码核销（原型占位码）' })
    ]),
    h('button', { class: 'btn btn-ghost btn-block', text: '关闭', style: 'margin-top:14px', onclick: () => mask.remove() })
  ]);
  mask.appendChild(sheet);
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  document.body.appendChild(mask);
  drawFakeQR(canvas, coupon.code);
}
