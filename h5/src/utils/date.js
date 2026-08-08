// 本地日期工具（签到按自然日，用本地时区 YYYY-MM-DD）。

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return todayStr(dt);
}

// 最近 7 天（含今天）的列表，供连续签到条展示
export function last7Days() {
  const out = [];
  for (let i = 6; i >= 0; i--) out.push(shiftDays(todayStr(), -i));
  return out;
}

export function dowLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return ['日', '一', '二', '三', '四', '五', '六'][w];
}
