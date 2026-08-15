// 用户探店众包面板（2026-08-15）：详情页「资料待核验」店 → 提交探店记录。
// 流程：评分（必吃/推荐/一般）+ 推荐菜 + 人均 + 口味 + 备注 + 承诺勾选 → POST /explore（JWT）。
// 登录态自动带 token（auth session）；未登录提示先登录。
// 全 h() 构建无 innerHTML。
import { h, toast } from './dom.js';
import { auth } from '../core/auth.js';
import * as authApi from '../api/auth-client.js';

const API_BASE = (globalThis.__MANYOUWEI_CONFIG__ && globalThis.__MANYOUWEI_CONFIG__.apiBase) || 'http://127.0.0.1:8799';

async function submit(payload) {
  const session = await auth.getSession();
  const token = session && session.token;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(API_BASE + '/explore', { method: 'POST', headers, body: JSON.stringify(payload) });
  return res.json().catch(() => null);
}

export function explorePanel({ merchant }) {
  const wrap = h('div', { class: 'detail-block explore-panel' });
  const title = h('div', { class: 'detail-block-title', text: '你去过这家？来探店补全数据' });
  const rating = h('select', { class: 'explore-rating', 'aria-label': '评分' }, [
    h('option', { value: '', text: '评分（必选）' }),
    h('option', { value: '必吃', text: '必吃' }),
    h('option', { value: '推荐', text: '推荐' }),
    h('option', { value: '一般', text: '一般' }),
  ]);
  const dishes = h('input', { class: 'explore-input', type: 'text', placeholder: '推荐菜（如：招牌牛肉面）', maxlength: '100' });
  const price = h('input', { class: 'explore-input', type: 'text', placeholder: '人均（如：18）', maxlength: '20' });
  const taste = h('input', { class: 'explore-input', type: 'text', placeholder: '口味（如：清淡 / 香辣）', maxlength: '40' });
  const note = h('input', { class: 'explore-input', type: 'text', placeholder: '备注（营业时间、排队等）', maxlength: '200' });
  const attest = h('label', { class: 'explore-attest' }, [
    h('input', { type: 'checkbox', class: 'explore-attest-input' }),
    h('span', { text: '我实地去过这家，承诺以上信息真实（审核后帮大家升级数据）' }),
  ]);
  const btn = h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: '提交探店记录' });
  btn.addEventListener('click', async () => {
    const ratingVal = rating.value;
    if (!ratingVal) { toast('请选择评分'); return; }
    const attestEl = wrap.querySelector('.explore-attest-input');
    if (!attestEl || !attestEl.checked) { toast('请勾选真实承诺'); return; }
    btn.disabled = true; btn.textContent = '提交中…';
    try {
      const r = await submit({
        merchantId: merchant.id, merchantName: merchant.name,
        rating: ratingVal,
        recommendDishes: dishes.value.trim(),
        avgPrice: price.value.trim(),
        taste: taste.value.trim(),
        note: note.value.trim(),
        attest: 'yes',
      });
      if (r && r.success) { toast('探店记录已提交，审核通过后会更新数据，感谢！'); wrap.remove(); }
      else toast((r && r.error) || '提交失败，请重试');
    } catch { toast('网络开小差，提交失败'); }
    btn.disabled = false; btn.textContent = '提交探店记录';
  });
  wrap.appendChild(title);
  wrap.appendChild(h('div', { class: 'explore-field', text: '这家是「资料待核验」店，你的真实记录能帮所有人更放心地选' }));
  wrap.appendChild(rating);
  wrap.appendChild(dishes);
  wrap.appendChild(price);
  wrap.appendChild(taste);
  wrap.appendChild(note);
  wrap.appendChild(attest);
  wrap.appendChild(btn);
  return wrap;
}
