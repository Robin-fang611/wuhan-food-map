// 图片压缩工具（S8 · 2026-08-15）：浏览器端把用户选择的图片压缩为 data URL 再提交，
// 避免原图直传撑爆请求体（后端 /upload 上限 12MB；单张解码后 ≤2MB，最长边 1280px）。
// 纯浏览器 API（canvas），无 DOM 副作用；同构模块在 Node 下调用会 reject（由调用方兜底）。

export const MAX_PHOTOS = 3;
export const MAX_SIDE = 1280;
export const JPEG_QUALITY = 0.72;

// 读文件 → Image → canvas 等比压缩 → data URL（jpeg）。
export function compressImageFile(file, { maxSide = MAX_SIDE, quality = JPEG_QUALITY } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      reject(new Error('non-browser'));
      return;
    }
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type || '')) {
      reject(new Error('仅支持 jpg/png/webp 图片'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
    img.src = url;
  });
}
