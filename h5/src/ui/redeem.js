// 商家核销台（M14，v1.5）：输码 → 幂等标记已用。
// DOM 全 h() 构建（无 innerHTML，防 XSS §8）；视觉只用 tokens.css 变量。
// 真实扫码（微信/摄像头）属 v1.5，原型仅做"输码核销"+ 占位提示，不写未鉴权/不可测分支。

import { h, clear, toast } from './dom.js';
import { redeem, normalizeCode } from '../core/redemption.js';

export async function RedeemConsole(ctx = {}) {
  const { onBack } = ctx;
  const root = h('div');

  const input = h('input', {
    class: 'ac-input', type: 'text', inputmode: 'text', autocapitalize: 'characters',
    placeholder: '输入券码（如 MYW-7F3K-2Q9X）', 'aria-label': '券码', maxlength: '32'
  });

  const result = h('div', { class: 'rd-result', style: 'margin-top:14px' });

  function renderResult(r) {
    clear(result);
    if (!r) return;
    if (r.ok) {
      const c = r.coupon;
      result.appendChild(h('div', { class: 'rd-ok card' }, [
        h('div', { class: 'rd-title', text: '✓ 核销成功' }),
        rdLine('券名', c.title || '优惠券'),
        rdLine('券码', c.code, true),
        rdLine('面额', `¥${c.amount || 0}`),
        rdLine('核销时间', fmtTime(c.redeemed_at)),
        rdLine('CPS 分润', c.payout_status === '无分润' ? '无分润' : `待结算 · 预估 ¥${c.cps_estimated_amount}（CPS）`)
      ]));
    } else {
      result.appendChild(h('div', { class: 'rd-fail card' }, [
        h('div', { class: 'rd-title', text: '✗ 无法核销' }),
        h('div', { class: 'rd-reason', text: r.reason })
      ]));
    }
  }

  function rdLine(k, v, mono) {
    return h('div', { class: 'rd-line' }, [
      h('span', { class: 'rd-k', text: k }),
      h('span', { class: mono ? 'rd-v mono' : 'rd-v', text: v })
    ]);
  }

  async function doRedeem() {
    const code = normalizeCode(input.value);
    if (!code) { toast('请输入券码'); return; }
    const r = await redeem(code);
    renderResult(r);
    input.value = '';
    if (r.ok) toast('核销成功');
  }

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRedeem(); });

  root.appendChild(h('div', { class: 'detail-top' }, [
    h('button', { class: 'nav-btn', type: 'button', text: '返回', onclick: onBack }),
    h('span', { class: 'detail-top-title', text: '商家核销台' })
  ]));

  root.appendChild(h('div', { class: 'section' }, [
    h('div', { class: 'rd-intro' }, [
      h('p', { class: 'muted', text: '学生到店出示券码/二维码，商家在此输码核销。同一券码幂等，重复核销会被拒绝。' })
    ]),
    h('div', { class: 'rd-box card' }, [
      h('div', { class: 'filter-label', text: '券码' }),
      input,
      h('div', { class: 'rd-actions' }, [
        h('button', { class: 'btn btn-primary btn-block', text: '输码核销', style: 'margin-top:10px', onclick: doRedeem }),
        h('button', { class: 'btn btn-ghost btn-block', text: '扫码核销（v1.5 上线）', style: 'margin-top:8px', onclick: () => toast('正式版支持微信扫一扫 / 摄像头扫码') })
      ])
    ]),
    result,
    h('div', { class: 'footnote', text: '原型说明：核销状态存于本地（localStorage），按券码定位并幂等标记。v1.5 由后端按已验证商家会话全局查码核销（见 BFF接口契约 §4）。' })
  ]));

  return root;
}

function fmtTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
