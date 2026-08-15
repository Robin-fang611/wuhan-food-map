// 已有店铺补充资料（S8 · 2026-08-15）：用户给库内已有商户贡献照片 + 文字描述。
// 提交后进待核验（kind=extras），管理员收录（promote）后公开展示在商户详情页。
// DOM 一律 h() 构建（无 innerHTML）；调用链：detail.js「补充这家店」→ main.js view 'extras'。
import { h, toast } from './dom.js';
import { uploadMerchantExtras } from '../../../hypha/integration/agent-client.js';
import { PhotoPicker } from './photoPicker.js';

export async function MerchantExtrasView({ merchantId, merchantName, onBack } = {}) {
  const root = h('div');
  const picker = PhotoPicker();
  const descInput = h('textarea', {
    class: 'ac-input upload-textarea', name: 'description', rows: '3',
    placeholder: '补充这家店的情况：招牌菜、排队情况、营业时间、环境…（至少填照片或描述之一）',
    'aria-label': '补充描述',
  });
  const submitBtn = h('button', { class: 'btn btn-primary btn-block upload-submit', type: 'submit', text: '提交补充，等管理员核验' });

  const form = h('form', { class: 'ac-form upload-form', novalidate: 'novalidate' }, [
    h('div', { class: 'extras-merchant', text: merchantName || '这家店' }),
    h('label', { class: 'upload-field' }, [
      h('span', { class: 'upload-label', text: '补充描述（可选）' }),
      descInput,
    ]),
    picker.wrap,
    submitBtn,
  ]);
  root.appendChild(h('div', { class: 'detail-top' }, [
    h('button', { class: 'nav-btn', type: 'button', text: '返回', onclick: onBack }),
    h('span', { class: 'detail-top-title', text: '补充这家店' })
  ]));
  const errArea = h('div', { class: 'upload-err' });
  root.appendChild(form);
  root.appendChild(errArea);
  root.appendChild(h('div', { class: 'footnote', text: '补充内容经管理员核验后展示在店铺详情页；不伪造、不删除，图片仅用于展示。' }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const description = descInput.value.trim();
    const images = picker.getImages();
    if (!description && !images.length) { toast('至少补充一张照片或一段描述'); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = '提交中…';
    try {
      const r = await uploadMerchantExtras({ merchantId, merchantName, description, images });
      if (r && r.ok) {
        toast('已提交，等管理员核验后展示 ✓');
        descInput.value = '';
        onBack && onBack();
      } else {
        toast((r && r.error) || '提交失败，请重试');
      }
    } catch (err) {
      toast('网络开小差了，请重试');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '提交补充，等管理员核验';
    }
  });

  return root;
}
