// 商户详情页 + 高德导航（M8）。
// 复用：纯逻辑来自 core/query.js；DOM 一律 h() 构建（无 innerHTML，防 XSS §8）；
// 视觉只用 tokens.css 变量。导航在 M11 安全接入前，使用高德「公开 URI」
// （uri.amap.com，无需 Key，不把密钥进前端，符合 §8）。

import { h, toast } from './dom.js';
import { confidenceInfo } from './confidence.js';
import { explorePanel } from './explorePanel.js';
import { allMerchants as merchants } from '../data/all-merchants.js';
import { parsePrice, distKm, CAMPUS_COORDS, WUHAN_CENTER } from '../core/query.js';
import { auth } from '../core/auth.js';
import { analytics, EVENTS } from '../core/analytics.js';
import { ClaimPanel } from './claimPanel.js';

const API_BASE = (globalThis.__MANYOUWEI_CONFIG__ && globalThis.__MANYOUWEI_CONFIG__.apiBase) || 'http://127.0.0.1:8799';

// 构造高德公开标注/导航 URI。纯函数、可在 node 直接测试。
// 关键：uri.amap.com 是网页跳转协议，不需要 Key，因此前端不持有任何密钥（§8 红线）。
export function buildAmapUrl(m) {
  if (!m || typeof m.lng !== 'number' || typeof m.lat !== 'number') return null;
  const params = new URLSearchParams({
    position: `${m.lng},${m.lat}`,
    name: m.name || '',
    src: 'manyouwei',
    coordinate: 'gaode', // 数据坐标体系为 GCJ-02
    callnative: '1'
  });
  return `https://uri.amap.com/marker?${params.toString()}`;
}

function ratingBadge(r) {
  return r === '必吃'
    ? h('span', { class: 'm-rating best', text: '必吃' })
    : r === '推荐'
      ? h('span', { class: 'm-rating good', text: '推荐' })
      : h('span', { class: 'm-rating', text: '待评' });
}

function infoRow(label, value) {
  if (value == null || value === '') return null;
  return h('div', { class: 'detail-row' }, [
    h('span', { class: 'detail-label', text: label }),
    h('span', { class: 'detail-value', text: value })
  ]);
}

function mealTags(m) {
  return Array.isArray(m.mealTime) && m.mealTime.length
    ? h('div', { class: 'm-meals' }, m.mealTime.map((t) => h('span', { class: 'm-meal', text: t })))
    : null;
}

export async function MerchantDetail({ id, userId, onBack, goExtras }) {
  const m = merchants.find((x) => x.id === id);
  const root = h('div');

  // 收藏切换按钮（云端收藏原型：未登录存本地临时收藏，登录后合并到账号，见 §4.1）
  const favBtn = h('button', { class: 'nav-btn detail-fav', type: 'button' });
  async function syncFav() {
    const fav = await auth.isFavorite(id);
    favBtn.textContent = fav ? '已收藏' : '收藏';
    favBtn.classList.toggle('on', fav);
  }
  favBtn.addEventListener('click', async () => {
    const fav = await auth.isFavorite(id);
    if (fav) { await auth.removeFavorite(id); analytics.track(EVENTS.FAVORITE, { id, action: 'remove' }); toast('已取消收藏'); }
    else { await auth.addFavorite(id); analytics.track(EVENTS.FAVORITE, { id, action: 'add' }); toast('已加入收藏'); }
    await syncFav();
  });

  // 顶部返回条（沿用首页顶部视觉语言，sticky）
  root.appendChild(h('div', { class: 'detail-top' }, [
    h('button', { class: 'nav-btn', type: 'button', text: '返回', onclick: onBack }),
    h('span', { class: 'detail-top-title', text: '商户详情' }),
    favBtn
  ]));
  await syncFav();

  if (!m) {
    root.appendChild(h('div', { class: 'section' }, [
      h('div', { class: 'empty', text: '未找到该商户，可能已下线~' })
    ]));
    return root;
  }

  const price = parsePrice(m.avgPrice);
  const fromCoord = CAMPUS_COORDS[m.zone] || WUHAN_CENTER;
  const km = distKm(m, fromCoord);
  const distLabel = m.zone && m.zone !== '武汉全城'
    ? `距${m.zone}约 ${km.toFixed(1)} km`
    : `距市中心约 ${km.toFixed(1)} km`;

  // 头部：店名 + 评分 + 分类
  root.appendChild(h('div', { class: 'section detail-hero' }, [
    h('div', { class: 'detail-head' }, [
      h('div', { class: 'detail-name', text: m.name || '未命名商户' }),
      ratingBadge(m.rating)
    ]),
    h('div', { class: 'detail-tags' }, [
      h('span', { class: 'm-tag', text: m.category || '其他' }),
      m.cuisine ? h('span', { class: 'm-tag', text: m.cuisine }) : null
    ])
  ]));

  // 信息行（过滤空值）
  const rows = [
    infoRow('人均', price != null ? `¥${price}` : '待补'),
    infoRow('距离', distLabel),
    infoRow('适合人数', m.groupSize || null),
    infoRow('环境', m.environment || null),
    infoRow('包间', m.hasPrivateRoom || null),
    infoRow('地址', m.address || null)
  ].filter(Boolean);

  const info = h('div', { class: 'section detail-info' }, rows);

  if (m.signatureDishes) info.appendChild(h('div', { class: 'detail-block' }, [
    h('div', { class: 'detail-block-title', text: '招牌菜' }),
    h('div', { class: 'detail-dishes', text: m.signatureDishes })
  ]));
  if (m.reason) info.appendChild(h('div', { class: 'detail-block' }, [
    h('div', { class: 'detail-block-title', text: '推荐理由' }),
    h('div', { class: 'detail-reason', text: m.reason })
  ]));
  const mt = mealTags(m);
  if (mt) info.appendChild(h('div', { class: 'detail-block' }, [
    h('div', { class: 'detail-block-title', text: '适合时段' }), mt
  ]));
  if (m.has_coupon && m.coupon_summary) info.appendChild(h('div', { class: 'detail-block' }, [
    h('div', { class: 'detail-block-title', text: '优惠' }),
    h('div', { class: 'detail-coupon', text: m.coupon_summary })
  ]));

  // 数据层增强字段：把更丰富的商户信息（口味/推荐菜/评分/标签/置信度）完整呈现。
  if (m.taste) info.appendChild(h('div', { class: 'detail-block' }, [
    h('div', { class: 'detail-block-title', text: '口味' }),
    h('div', { class: 'detail-dishes', text: m.taste })
  ]));
  if (m.recommendDishes) info.appendChild(h('div', { class: 'detail-block' }, [
    h('div', { class: 'detail-block-title', text: '推荐菜' }),
    h('div', { class: 'detail-dishes', text: m.recommendDishes })
  ]));
  const ratings = [
    m.environmentRating != null ? `环境 ${m.environmentRating}` : null,
    m.serviceRating != null ? `服务 ${m.serviceRating}` : null,
  ].filter(Boolean);
  if (ratings.length) info.appendChild(h('div', { class: 'detail-block' }, [
    h('div', { class: 'detail-block-title', text: '评分' }),
    h('div', { class: 'detail-ratings' }, ratings.map((r) => h('span', { class: 'm-rating-pill', text: r })))
  ]));
  if (Array.isArray(m.tags) && m.tags.length) info.appendChild(h('div', { class: 'detail-block' }, [
    h('div', { class: 'detail-block-title', text: '标签' }),
    h('div', { class: 'detail-tags' }, m.tags.map((t) => h('span', { class: 'm-tag', text: t })))
  ]));
  // 资料置信度：诚实标注 verified（已联网核验）/ partial（部分核验）/ estimated（算法推导·待核验），不夸大。
  const ci = confidenceInfo(m);
  const confText = ci.level === 'verified'
    ? '已联网核验（武汉真实名店）'
    : ci.level === 'partial'
      ? '部分字段已核验 · 其余待探店核验'
      : '算法按品类推导 · 待探店核验';
  info.appendChild(h('div', { class: `detail-block detail-confidence detail-confidence-${ci.level}` }, [
    h('div', { class: 'detail-block-title', text: '资料置信度' }),
    h('div', { class: 'detail-confidence-val', text: confText }),
    ci.pending
      ? h('div', { class: 'detail-confidence-hint', text: '资料待探店核验，欢迎反馈纠错' })
      : null
  ]));

  // 2026-08-15 用户探店众包：estimated/partial 店可提交探店记录（补全数据）
  if (ci.pending) {
    info.appendChild(explorePanel({ merchant: m }));
  }

  // S8 · 蛮友补充（已核验的照片/描述，公开展示，诚实标注来源）
  info.appendChild(h('div', { id: 'detail-extras' }));

  root.appendChild(info);

  // S8 · 给已有店铺补充照片/描述入口（所有店铺可用）
  if (goExtras) {
    root.appendChild(h('div', { class: 'section detail-claim-wrap' }, [
      h('button', {
        class: 'btn btn-ghost btn-block', type: 'button', text: '📷 补充这家店的照片 / 描述',
        onclick: () => goExtras({ id: m.id, name: m.name })
      })
    ]));
  }

  // 异步加载「蛮友补充」区块（失败静默：本地无后端/网络差不阻塞详情页）
  loadExtras(m.id).catch(() => { /* ignore */ });

  // 领券按钮（claim 玩法，对应 §4.3 领券闭环；仅对有券商户展示）
  if (m.has_coupon) {
    root.appendChild(h('div', { class: 'section detail-claim-wrap' }, [
      await ClaimPanel({
        userId,
        merchantId: m.id,
        merchantName: m.name,
        summary: m.coupon_summary || '',
        onChanged: () => analytics.track(EVENTS.CLAIM, { id: m.id })
      })
    ]));
  }

  // 高德导航按钮（公开 URI，无 Key；缺坐标时禁用）
  const url = buildAmapUrl(m);
  if (url) {
    root.appendChild(h('div', { class: 'section detail-nav-wrap' }, [
      h('a', {
        class: 'btn btn-primary btn-block detail-nav',
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
        text: '高德导航'
      })
    ]));
  } else {
    root.appendChild(h('div', { class: 'section detail-nav-wrap' }, [
      h('a', { class: 'btn btn-primary btn-block detail-nav', text: '导航暂不可用（缺少坐标）', href: '#' })
    ]));
  }

  root.appendChild(h('div', { class: 'footnote', text: '距离为直线参考距离；导航将跳转高德地图（公开链接，无需密钥）。v1.5 接入账号后坐标更精准。' }));

  return root;
}

// S8 · 拉取并渲染「蛮友补充」区块（已核验的 extras：照片 + 描述）。
async function loadExtras(merchantId) {
  const wrap = document.getElementById('detail-extras');
  if (!wrap) return;
  const { merchantExtras } = await import('../../../hypha/integration/agent-client.js');
  const r = await merchantExtras(merchantId);
  if (!r || !r.ok || !r.items.length) return;
  const items = r.items;
  wrap.appendChild(h('div', { class: 'detail-block' }, [
    h('div', { class: 'detail-block-title', text: '蛮友补充' }),
    h('div', { class: 'extras-note muted', text: '以下内容由用户补充、管理员核验后展示' }),
    ...items.flatMap((it) => [
      it.description
        ? h('div', { class: 'extras-desc', text: it.description })
        : null,
      Array.isArray(it.images) && it.images.length
        ? h('div', { class: 'extras-photos' }, it.images.map((p) =>
            h('img', { class: 'extras-photo', src: API_BASE + p, alt: '蛮友补充照片', loading: 'lazy' })))
        : null,
    ]),
  ]));
}
