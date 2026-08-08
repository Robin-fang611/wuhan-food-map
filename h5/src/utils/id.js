// 通用 ID / 券码生成工具。v1.5 接 BFF 后由服务端签发更安全，此处仅原型用。

export function uid(prefix = '') {
  const r = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36).slice(-4);
  return `${prefix}${r}${t}`;
}

// 券码形如 MYW-7F3K-2Q9X（大写、易读、无易混字符）
export function couponCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉 I O 0 1
  const pick = (n) => Array.from({ length: n }, () =>
    alphabet[(Math.random() * alphabet.length) | 0]).join('');
  return `MYW-${pick(4)}-${pick(4)}`;
}
