// 地图视图（M9，辅助「看位置」）。
// 严格复用架构：纯函数在此文件顶部（可在 node 直接测试）；组件用 h() 安全渲染（无 innerHTML，防 XSS §8）；
// 视觉只用 tokens.css 变量。
//
// 关于高德 Key（§8 / M11 红线）：v0.5 不持有任何密钥。本模块交付「轻量坐标地图」——
// 按商户 GCJ-02 经纬度做等距投影定位标记，完全离线、无需 Key，满足
// 「地图容器渲染 + 标记点数量与列表一致 + 无 Key 泄露」三项验收。
// 真·高德 JS API 由 M11 安全接入（env / 后端代理注入 Key，不进前端包）后，
// 通过本文件底部的 getAmapKey() 读取运行时配置即可切换真实地图渲染，组件其余逻辑不变。

import { h, clear } from './dom.js';
import { merchants } from '../data/merchants.js';
import { buildAmapUrl } from './detail.js'; // 公开 URI 导航，无 Key
import { filterMerchants, parsePrice, ratingRank } from '../core/query.js';

const PAD = 8; // 标记距画布边缘的留白百分比

function hasCoords(m) {
  return typeof m.lng === 'number' && typeof m.lat === 'number';
}

// 计算一组商户的经纬度包围盒；无坐标点返回 null。
export function computeBBox(list) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity, n = 0;
  for (const m of list) {
    if (!hasCoords(m)) continue;
    if (m.lng < minLng) minLng = m.lng;
    if (m.lng > maxLng) maxLng = m.lng;
    if (m.lat < minLat) minLat = m.lat;
    if (m.lat > maxLat) maxLat = m.lat;
    n++;
  }
  return n === 0 ? null : { minLng, maxLng, minLat, maxLat };
}

// 把单点经度/纬度投影到画布百分比坐标（左/上，0~100）。纬度越高越靠上；越界夹紧到留白内。
export function projectPoint(m, bbox, pad = PAD) {
  const lo = pad, hi = 100 - pad;
  if (!bbox || !hasCoords(m)) return { xPct: 50, yPct: 50 };
  const { minLng, maxLng, minLat, maxLat } = bbox;
  const spanLng = maxLng - minLng;
  const spanLat = maxLat - minLat;
  const fx = spanLng > 0 ? (m.lng - minLng) / spanLng : 0.5;
  const fy = spanLat > 0 ? (m.lat - minLat) / spanLat : 0.5;
  const clamp = (v) => Math.max(lo, Math.min(hi, v));
  // 四舍五入保留 2 位小数：百分比定位无需更高精度，且避免浮点误差（如 8+0.5*84）
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    xPct: r2(clamp(lo + fx * (hi - lo))),
    yPct: r2(clamp(lo + (1 - fy) * (hi - lo))) // 纬度反转：北在上
  };
}

// 按校区筛选并投影出标记列表；按评分权重降序（必吃在前）。
// 返回 [{ ...m, xPct, yPct }]；只含有坐标的商户（缺坐标的无法落点，由 UI 计数提示）。
export function markersForZone(list, zone, pad = PAD) {
  const filtered = zone ? filterMerchants(list, { zone }) : list.slice();
  const withPos = filtered.filter(hasCoords);
  const bbox = computeBBox(withPos);
  return withPos
    .slice()
    .sort((a, b) => ratingRank(b.rating) - ratingRank(a.rating))
    .map((m) => {
      const { xPct, yPct } = projectPoint(m, bbox, pad);
      return { ...m, xPct, yPct };
    });
}

// M11 安全接入点：高德 JS API Key 由 M11 通过运行时安全配置注入（绝不写源码 / 前端包）。
// 默认返回 null —— 此时本视图走轻量坐标地图；M11 落地后读取此配置即可切换真实地图。
export function getAmapKey() {
  const cfg = (typeof globalThis !== 'undefined') && globalThis.__MANYOUWEI_CONFIG__;
  const k = cfg && cfg.amapJsKey;
  return (typeof k === 'string' && k) ? k : null;
}

function chip(label, active, onClick) {
  return h('button', { class: `chip ${active ? 'active' : ''}`, type: 'button', text: label, onclick: onClick });
}

// 高德 JS API 2.0 加载器（幂等）。必须在加载 SDK 前注入 _AMapSecurityConfig（安全密钥）。
// 仅在浏览器、且配置了 key 时才会真正发起请求；失败/超时则 reject，由调用方降级到离线图。
let amapLoading = null;
function loadAmap(key, securityCode) {
  if (typeof globalThis === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('non-browser'));
  }
  if (globalThis.AMap) return Promise.resolve(globalThis.AMap);
  if (amapLoading) return amapLoading;
  amapLoading = new Promise((resolve, reject) => {
    try {
      if (securityCode) {
        globalThis._AMapSecurityConfig = { securityJsCode: String(securityCode) };
      }
      const s = document.createElement('script');
      s.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.Scale,AMap.ToolBar`;
      s.async = true;
      s.onload = () => (globalThis.AMap ? resolve(globalThis.AMap) : reject(new Error('AMap undefined after load')));
      s.onerror = () => reject(new Error('AMap script load failed'));
      document.head.appendChild(s);
    } catch (e) { reject(e); }
  });
  return amapLoading;
}

// 地图视图组件（辅助：在导航前「看位置」）。
// 策略：配置了高德 Key → 加载真实瓦片地图；无 Key / 加载失败 → 自动降级到离线坐标图（不白屏）。
export async function MapView({ zone = '全城', goDetail, onBack } = {}) {
  const root = h('div');
  const state = { zone, selectedId: null, map: null };

  root.appendChild(h('div', { class: 'detail-top' }, [
    h('button', { class: 'nav-btn', type: 'button', text: '返回', onclick: onBack }),
    h('span', { class: 'detail-top-title', text: '地图找吃' })
  ]));

  const ZONES = ['首义', '南湖', '全城'];
  const zoneChips = ZONES.map((z) => chip(z, state.zone === z, () => {
    state.zone = z;
    state.selectedId = null;
    zoneChips.forEach((c, i) => c.classList.toggle('active', ZONES[i] === z));
    renderAll();
  }));
  root.appendChild(h('div', { class: 'section', style: 'padding-top:8px;padding-bottom:0' }, [
    h('div', { class: 'chips' }, zoneChips)
  ]));

  const countEl = h('div', { class: 'map-count muted' });
  const canvas = h('div', { class: 'map-canvas', role: 'list', 'aria-label': '商户地图标记' });
  root.appendChild(h('div', { class: 'section', style: 'padding-bottom:0' }, [countEl]));
  root.appendChild(h('div', { class: 'section', style: 'padding-top:8px' }, [canvas]));

  const info = h('div', { class: 'map-info' });
  root.appendChild(info);

  const key = getAmapKey();
  const securityCode = (globalThis.__MANYOUWEI_CONFIG__ && globalThis.__MANYOUWEI_CONFIG__.amapSecurityCode) || null;

  async function renderAll() {
    const list = filterMerchants(merchants, { zone: state.zone });
    const withPos = list.filter(hasCoords);
    const missing = list.length - withPos.length;
    countEl.textContent = `共 ${list.length} 家 · 地图显示 ${withPos.length} 家`
      + (missing > 0 ? `（${missing} 家缺坐标）` : '');
    // 切换前销毁旧地图实例，避免内存泄漏 / 重复实例
    if (state.map) { try { state.map.destroy(); } catch { /* ignore */ } state.map = null; }
    clear(canvas);
    if (key) {
      try { await renderAmap(withPos); return; }
      catch (e) { /* 降级到离线坐标图 */ }
    }
    renderOffline(withPos);
  }

  // 离线兜底：按经纬度等比投影画标记，完全离线、无需 Key（原 M9 实现）。
  function renderOffline(list) {
    const markers = markersForZone(merchants, state.zone);
    if (markers.length === 0) {
      canvas.appendChild(h('div', { class: 'empty', text: '该区域暂无可定位商户~' }));
    } else {
      for (const m of markers) {
        const isSel = m.id === state.selectedId;
        const cls = `map-pin ${isSel ? 'sel' : ''} ${m.rating === '必吃' ? 'best' : m.rating === '推荐' ? 'good' : ''}`;
        canvas.appendChild(h('button', {
          class: cls, type: 'button', role: 'listitem',
          style: `left:${m.xPct}%;top:${m.yPct}%`,
          'aria-label': m.name || '商户', title: m.name || '',
          onclick: () => { state.selectedId = m.id; renderInfo(markers); }
        }, [h('span', { class: 'map-pin-dot' })]));
      }
    }
    renderInfo(markers);
  }

  // 真实高德瓦片地图：以经纬度落点，支持平移/缩放/比例尺。
  async function renderAmap(list) {
    const AMap = await loadAmap(key, securityCode);
    const bbox = computeBBox(list);
    const center = bbox ? [(bbox.minLng + bbox.maxLng) / 2, (bbox.minLat + bbox.maxLat) / 2] : [114.305, 30.593];
    const map = new AMap.Map(canvas, { zoom: bbox ? 12 : 11, center, viewMode: '2D' });
    state.map = map;
    for (const m of list) {
      const mk = new AMap.Marker({ position: [m.lng, m.lat], title: m.name, anchor: 'bottom-center' });
      mk.on('click', () => { state.selectedId = m.id; renderInfo(list); });
      map.add(mk);
    }
    if (bbox) { try { map.setFitView(); } catch { /* ignore */ } }
    renderInfo(list);
  }

  function renderInfo(list) {
    clear(info);
    const m = list.find((x) => x.id === state.selectedId);
    if (!m) {
      info.appendChild(h('div', { class: 'map-hint muted', text: '点击地图上的标记查看商户，再选「导航」或「详情」。' }));
      return;
    }
    const price = parsePrice(m.avgPrice);
    const url = buildAmapUrl(m);
    info.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'm-head' }, [
        h('div', { class: 'm-name', text: m.name || '未命名商户' }),
        m.rating === '必吃' ? h('span', { class: 'm-rating best', text: '必吃' })
          : m.rating === '推荐' ? h('span', { class: 'm-rating good', text: '推荐' })
          : null
      ]),
      h('div', { class: 'm-meta' }, [
        h('span', { class: 'm-tag', text: m.category || '其他' }),
        h('span', { class: 'm-price', text: price != null ? `人均 ¥${price}` : '人均 待补' })
      ]),
      h('div', { class: 'map-info-actions' }, [
        url
          ? h('a', { class: 'btn btn-primary', href: url, target: '_blank', rel: 'noopener noreferrer', text: '高德导航' })
          : h('span', { class: 'muted', text: '导航暂不可用（缺坐标）' }),
        goDetail ? h('button', { class: 'btn btn-ghost', type: 'button', text: '查看详情', onclick: () => goDetail(m.id) }) : null
      ])
    ]));
  }

  renderAll();
  return root;
}
