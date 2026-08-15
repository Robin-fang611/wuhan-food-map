// 分享卡生成器（R6 免费方案 · 2026-08-15）
// 纯前端 Canvas 绘制品牌分享卡：品牌色卡片 + 「味」logo + 店名 + 一句话推荐 + 二维码占位。
// 用法：drawShareCard(canvas, data) 后 canvas.toDataURL('image/png') 即可下载/分享。
// 纯逻辑 shareCardData(m, extra) 可单测；Canvas 绘制仅在浏览器执行。
import { h } from './dom.js';

// 卡片配色（与 tokens 一致的蛮有味品牌色）
export const SHARE_CARD = {
  bg: '#f5efe6',       // 纸色
  accent: '#c0392b',   // seal-red
  ink: '#2c2440',
  ink2: '#7a5b2e',
};

// 纯函数：组装卡面数据（不含 DOM，可单测）
export function shareCardData(m, extra = {}) {
  const price = m && typeof m.avgPriceNum === 'number' ? `¥${m.avgPriceNum}` : (m && m.avgPrice) || '';
  return {
    name: (m && m.name) || '蛮有味推荐',
    zone: (m && m.zone) || '',
    category: (m && m.category) || '',
    price,
    rating: (m && m.rating) || '',
    reason: (extra.reason || (m && m.reason) || '').slice(0, 60),
    tagline: '武汉好吃的，真人探过的 · 今天吃啥？问蛮有味',
    qrPlaceholder: true,
  };
}

// 浏览器端绘制（640×400 卡面）
export function drawShareCard(canvas, data) {
  if (!canvas || typeof document === 'undefined') return null;
  const ctx = canvas.getContext('2d');
  const W = canvas.width || 640;
  const H = canvas.height || 400;
  ctx.fillStyle = SHARE_CARD.bg;
  ctx.fillRect(0, 0, W, H);
  // 顶部品牌条
  ctx.fillStyle = SHARE_CARD.accent;
  ctx.fillRect(0, 0, W, 10);
  // 味 seal
  ctx.fillStyle = SHARE_CARD.accent;
  ctx.beginPath();
  ctx.arc(56, 72, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 34px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('味', 56, 74);
  // 品牌名
  ctx.fillStyle = SHARE_CARD.ink;
  ctx.font = 'bold 26px serif';
  ctx.textAlign = 'left';
  ctx.fillText('蛮有味', 102, 66);
  ctx.fillStyle = SHARE_CARD.ink2;
  ctx.font = '13px sans-serif';
  ctx.fillText(data.tagline, 102, 92);
  // 店名（主信息）
  ctx.fillStyle = SHARE_CARD.ink;
  ctx.font = 'bold 40px serif';
  ctx.textAlign = 'left';
  const name = String(data.name || '').slice(0, 12);
  ctx.fillText(name, 56, 190);
  // 元信息行
  ctx.fillStyle = SHARE_CARD.ink2;
  ctx.font = '16px sans-serif';
  const meta = [data.zone, data.category, data.price, data.rating].filter(Boolean).join(' · ');
  ctx.fillText(meta || '今天吃啥？', 56, 228);
  // 推荐理由（最多两行）
  ctx.fillStyle = SHARE_CARD.ink;
  ctx.font = '15px sans-serif';
  const reason = String(data.reason || '');
  ctx.fillText(reason.slice(0, 24), 56, 268);
  if (reason.length > 24) ctx.fillText(reason.slice(24, 48), 56, 292);
  // 二维码占位
  ctx.fillStyle = '#e8dcc8';
  ctx.fillRect(W - 132, H - 132, 96, 96);
  ctx.strokeStyle = SHARE_CARD.ink2;
  ctx.strokeRect(W - 132, H - 132, 96, 96);
  ctx.fillStyle = SHARE_CARD.ink2;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('扫码看推荐', W - 84, H - 82);
  ctx.fillText('(正式版二维码)', W - 84, H - 64);
  return canvas;
}

// 详情页/推荐页「分享」按钮：绘制 → 下载 PNG（或 navigator.share 分享）
export function shareCardButton(m, extra = {}) {
  return h('button', {
    class: 'btn btn-ghost btn-sm', type: 'button', text: '分享卡片',
    onclick: () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 400;
        drawShareCard(canvas, shareCardData(m, extra));
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url; a.download = (m && m.name ? m.name : 'manyouwei') + '-share.png';
        document.body.appendChild(a); a.click(); a.remove();
      } catch { /* 环境不支持则静默 */ }
    },
  });
}
