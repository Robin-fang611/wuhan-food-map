// 图片选择器（S8 · 2026-08-15）：文件选择 + 压缩 + 缩略图预览 + 删除，供野店上传 / 店铺补充复用。
// 返回 { wrap, getImages }：getImages() → data URL 数组（最多 MAX_PHOTOS 张）。
import { h } from './dom.js';
import { compressImageFile, MAX_PHOTOS } from '../utils/imageCompress.js';

export function PhotoPicker({ onChange } = {}) {
  const images = []; // data URL 列表
  const thumbs = h('div', { class: 'photo-thumbs' });
  const input = h('input', {
    class: 'photo-input', type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: 'multiple',
    'aria-label': '选择照片',
  });
  const addBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '＋ 添加照片', onclick: () => input.click() });

  input.addEventListener('change', async () => {
    const files = [...(input.files || [])].slice(0, MAX_PHOTOS - images.length);
    for (const f of files) {
      try {
        const dataUrl = await compressImageFile(f);
        images.push(dataUrl);
        thumbs.appendChild(thumbEl(dataUrl, () => {
          const i = images.indexOf(dataUrl);
          if (i >= 0) images.splice(i, 1);
          thumbs.querySelectorAll('.photo-thumb').forEach((el, idx) => { if (idx >= images.length) el.remove(); });
          sync();
        }));
      } catch (e) {
        // 单张失败不阻断其余（toast 由调用方统一；这里静默跳过非法文件）
        if (typeof console !== 'undefined') console.warn('[photo]', e && e.message || e);
      }
    }
    input.value = '';
    sync();
  });

  function thumbEl(dataUrl, onRemove) {
    const img = h('img', { class: 'photo-thumb-img', src: dataUrl, alt: '预览' });
    const rm = h('button', { class: 'photo-thumb-rm', type: 'button', text: '×', 'aria-label': '删除照片' });
    rm.addEventListener('click', (e) => { e.stopPropagation(); onRemove(); });
    return h('div', { class: 'photo-thumb' }, [img, rm]);
  }

  function sync() {
    addBtn.textContent = images.length >= MAX_PHOTOS ? `最多 ${MAX_PHOTOS} 张（已满）` : `＋ 添加照片（${images.length}/${MAX_PHOTOS}）`;
    addBtn.disabled = images.length >= MAX_PHOTOS;
    if (onChange) onChange(images.slice());
  }

  const wrap = h('div', { class: 'photo-picker' }, [
    h('div', { class: 'upload-label', text: `照片（最多 ${MAX_PHOTOS} 张，可选）` }),
    h('div', { class: 'photo-row' }, [addBtn, thumbs]),
    input,
  ]);

  return { wrap, getImages: () => images.slice() };
}
