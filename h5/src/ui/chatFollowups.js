// 多轮追问快捷 chips（S6 · 2026-08-15）——纯逻辑，供 reasoning.js 渲染与单测断言。
// 对齐 SPEC §3.1 对话回路：Intake 后可多轮追问（换一家 / 再便宜点 / 换个附近），
// 这些短句由后端 intent-parser / LLM 解析为会话内约束（seenIds 排除、maxPrice 下调、zone 切换）。
export const FOLLOWUP_ACTIONS = [
  { label: '换一家', followup: '换一家', resetSeen: true, hint: '排除已推荐的店，重新给主推' },
  { label: '再便宜点', followup: '再便宜点', resetSeen: false, hint: '下调人均预算重新筛' },
  { label: '换个附近', followup: '换个附近', resetSeen: false, hint: '调整片区范围重新筛' },
];

// 主推存在时追加「收藏这家」（点击后收藏当前主推店）。
export function buildFollowupChips({ hasPrimary = false } = {}) {
  const chips = FOLLOWUP_ACTIONS.map((a) => ({ ...a }));
  if (hasPrimary) chips.push({ label: '收藏这家', followup: '', resetSeen: false, primaryAction: 'favorite' });
  return chips;
}

// 判定：收到回复（含商户）后应展示追问条。
export function shouldShowFollowups({ needsClarification = false, merchantCount = 0 } = {}) {
  if (needsClarification) return false; // Agent 在反问，先答它，不急着追问
  return merchantCount > 0;
}

// 多轮指令解析（W8.2 · 2026-08-15）：追问快捷词 → 会话操作。
//  - 'change'：换一家（排除已展示，由前端传 exclude 给后端）
//  - 'cheaper'：再便宜点（前端下调 maxPrice 后随 params 回传）
//  - 'nearby'：换个附近（前端切换 zone 后随 params 回传）
//  - null：普通意图（走正常解析）
export function parseFollowup(text) {
  const t = String(text || '');
  if (/换一家|换家|再来一家|换别的/.test(t)) return 'change';
  if (/再便宜|便宜点|更便宜|降点价/.test(t)) return 'cheaper';
  if (/换个附近|换附近|换个地方|附近换|换片区/.test(t)) return 'nearby';
  return null;
}
