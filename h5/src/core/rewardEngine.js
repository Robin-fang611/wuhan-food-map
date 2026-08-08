// RewardEngine —— 奖励引擎核心（玩法可插拔的落地）。
//
// 设计要点（产品方案 §4.5）：
//   - 玩法 = PlayPlugin，统一契约：{ id, name, desc, getStatus, canParticipate, participate, render }
//   - 新增一种"得券方式" = 新建一个 PlayPlugin 文件 + register() 注册，
//     不改引擎、不改 CouponIssuer、不改券包 UI。
//   - 引擎不感知底层存储（走 RewardStore），不感知具体发券细节（走 CouponIssuer）。
//
// v1 仅注册 checkin；lottery / task / claim 为预留接口，未来按需实现并注册即可。

const plugins = new Map();

export function register(plugin) {
  if (!plugin || !plugin.id) throw new Error('PlayPlugin 必须有 id');
  plugins.set(plugin.id, plugin);
}

export function getPlugin(id) {
  const p = plugins.get(id);
  if (!p) throw new Error(`未知玩法：${id}`);
  return p;
}

export function listPlugins() {
  return [...plugins.values()].map((p) => ({ id: p.id, name: p.name, desc: p.desc }));
}

// 统一入口：执行某个玩法。返回 { ok, reason?, status?, coupons? }
export async function participate(playId, userId, ctx = {}) {
  const p = getPlugin(playId);
  const gate = await p.canParticipate(userId, ctx);
  if (!gate.allowed) return { ok: false, reason: gate.reason };
  const res = await p.participate(userId, ctx);
  return { ok: true, ...res };
}

export async function getStatus(playId, userId, ctx = {}) {
  const p = getPlugin(playId);
  // 转发 ctx：无上下文玩法（checkin）忽略，有上下文玩法（claim 需 merchantId）依赖它。
  return p.getStatus(userId, ctx);
}
