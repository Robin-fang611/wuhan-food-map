// 伪二维码生成器（v0.5 占位）。
// 说明：真实核销需要可被商家扫码识别的二维码（v1.5 由后端生成或引入 qrcode 库）。
// 此处仅按券码确定性绘制一个视觉占位图案，保证原型可演示"出示二维码"环节，不含真实可扫数据。
export function drawFakeQR(canvas, text) {
  const N = 21, cell = canvas.width / N;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1A1A1A';
  // 确定性哈希 → 固定图案（同码同图）
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (rand() > 0.5) ctx.fillRect(x * cell, y * cell, cell, cell);
  }
  // 三个定位角（仿 QR 回字形），提升"像二维码"的辨识度
  const corner = (ox, oy) => {
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(ox * cell, oy * cell, cell * 7, cell * 7);
    ctx.fillStyle = '#fff';
    ctx.fillRect((ox + 1) * cell, (oy + 1) * cell, cell * 5, cell * 5);
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect((ox + 2) * cell, (oy + 2) * cell, cell * 3, cell * 3);
  };
  corner(0, 0); corner(N - 7, 0); corner(0, N - 7);
}
