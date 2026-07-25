/**
 * components/ShopCard.js — 店铺卡片 + 详情弹窗
 *
 * 从 common.js 提取，依赖 core/utils 和 core/dom。
 */

import { getCategoryColor, getCategoryEmoji, getShopGradient, formatPrice, formatRating, getRatingColor, formatDistance } from '../core/utils.js';
import { el, Icons } from '../core/dom.js';

/** 创建店铺卡片 DOM */
export function createShopCard(shop, onClick) {
  const color = getCategoryColor(shop.category);
  const emoji = getCategoryEmoji(shop.category);
  const priceText = formatPrice(shop.avgPrice);
  const ratingText = formatRating(shop.rating);
  const ratingColor = getRatingColor(shop.rating);

  const card = el('div', {
    className: 'shop-card entering',
    tabindex: '0',
    role: 'button',
    'aria-label': `查看店铺 ${shop.name} 详情`,
  });

  // 图片占位
  const imgWrap = el('div', {
    className: 'shop-image',
    style: { background: getShopGradient(shop) },
  }, [
    el('div', { className: 'img-placeholder' }, emoji),
  ]);

  // 信息
  const info = el('div', { className: 'shop-info' });

  const nameRow = el('div', { className: 'shop-name-row' }, [
    el('div', { className: 'shop-name' }, shop.name),
    el('span', {
      className: 'cat-badge',
      style: { background: color, color: color === '#B9FF66' ? '#1A1A23' : '#FFFFFF' },
    }, shop.category),
  ]);
  info.appendChild(nameRow);

  // 评分行
  const metaParts = [];
  if (ratingText) {
    metaParts.push(el('span', { className: 'star' }, '★'));
    metaParts.push(el('span', { style: { fontWeight: '600' } }, ratingText));
    metaParts.push(el('span', {}, '·'));
  }
  metaParts.push(el('span', {}, priceText));
  if (shop.area) {
    metaParts.push(el('span', {}, '·'));
    metaParts.push(el('span', {}, shop.area));
  }
  info.appendChild(el('div', { className: 'shop-meta' }, metaParts));

  // 招牌菜
  if (shop.signatureDishes) {
    info.appendChild(el('div', { className: 'shop-dishes' }, '招牌：' + shop.signatureDishes));
  }

  // 距离
  const distParts = [];
  if (shop.distanceToNanhu_km !== undefined && shop.distanceToNanhu_km !== null) {
    distParts.push('距南湖 ' + formatDistance(shop.distanceToNanhu_km));
  }
  if (shop.distanceToShouyi_km !== undefined && shop.distanceToShouyi_km !== null) {
    if (distParts.length > 0) distParts.push(' · ');
    distParts.push('距首义 ' + formatDistance(shop.distanceToShouyi_km));
  }
  if (shop.address) {
    if (distParts.length > 0) distParts.push(' · ');
    distParts.push(shop.address);
  }
  if (distParts.length > 0) {
    info.appendChild(el('div', { className: 'shop-distance' }, distParts.join('')));
  }

  card.appendChild(imgWrap);
  card.appendChild(info);

  if (onClick) {
    card.addEventListener('click', () => onClick(shop));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        onClick(shop);
      }
    });
  }

  setTimeout(() => card.classList.remove('entering'), 500);

  return card;
}

/** 创建详情弹窗 */
export function createDetailModal(shop, onClose, onNavigate) {
  const color = getCategoryColor(shop.category);
  const emoji = getCategoryEmoji(shop.category);

  const overlay = el('div', { className: 'modal-overlay' });
  const content = el('div', { className: 'modal-content' });

  // 关闭按钮
  const closeBtn = el('div', { className: 'modal-close' });
  closeBtn.innerHTML = Icons.close;
  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('show');
    setTimeout(() => {
      overlay.remove();
      if (onClose) onClose();
    }, 250);
  });
  content.appendChild(closeBtn);
  content.appendChild(el('div', { className: 'modal-handle' }));

  // Hero
  content.appendChild(el('div', {
    className: 'detail-hero',
    style: { background: getShopGradient(shop) },
  }, emoji));

  // 店名
  content.appendChild(el('div', { className: 'detail-name' }, shop.name));

  // 标签
  const tags = el('div', { className: 'detail-tags' });
  tags.appendChild(el('span', {
    className: 'detail-tag',
    style: { background: color, color: color === '#B9FF66' ? '#1A1A23' : '#FFFFFF' },
  }, shop.category));
  if (shop.rating) {
    tags.appendChild(el('span', {
      className: 'detail-tag',
      style: { background: getRatingColor(shop.rating), color: '#FFFFFF' },
    }, shop.rating));
  }
  if (shop.avgPrice) {
    tags.appendChild(el('span', {
      className: 'detail-tag',
      style: { background: '#F5F5F0', color: '#555555' },
    }, formatPrice(shop.avgPrice)));
  }
  if (shop.mealTime) {
    tags.appendChild(el('span', {
      className: 'detail-tag',
      style: { background: '#F5F5F0', color: '#555555' },
    }, shop.mealTime));
  }
  content.appendChild(tags);

  // 详情行
  const infoRows = [
    ['招牌菜', shop.signatureDishes],
    ['菜系', shop.cuisine],
    ['适合', shop.groupSize ? shop.groupSize + ' 人' : null],
    ['用餐时间', shop.mealTime],
    ['地址', shop.address],
    ['区域', shop.area],
  ].filter(([, v]) => v).map(([label, value]) => {
    return el('div', { className: 'detail-info-row' }, [
      el('div', { className: 'detail-info-label' }, label),
      el('div', { className: 'detail-info-value' }, value),
    ]);
  });

  infoRows.forEach(row => content.appendChild(row));

  // 推荐理由
  if (shop.reason) {
    content.appendChild(el('div', {
      style: { marginTop: '12px', padding: '12px 14px', background: '#FFF7ED', borderRadius: '12px', fontSize: '13px', color: '#666', lineHeight: '1.6' },
    }, [
      el('span', { style: { fontWeight: '600', color: '#D4A574' } }, '推荐理由  '),
      shop.reason,
    ]));
  }

  // 距离
  const distParts = [];
  if (shop.distanceToNanhu_km !== undefined && shop.distanceToNanhu_km !== null) {
    distParts.push('南湖校区 ' + formatDistance(shop.distanceToNanhu_km));
  }
  if (shop.distanceToShouyi_km !== undefined && shop.distanceToShouyi_km !== null) {
    if (distParts.length > 0) distParts.push('  ·  ');
    distParts.push('首义校区 ' + formatDistance(shop.distanceToShouyi_km));
  }
  if (distParts.length > 0) {
    content.appendChild(el('div', {
      style: { marginTop: '12px', fontSize: '12px', color: '#999' },
    }, distParts.join('')));
  }

  // 导航按钮
  if (shop.lng && shop.lat) {
    const navBtn = el('div', { className: 'detail-nav-btn' });
    navBtn.innerHTML = Icons.navigate;
    navBtn.appendChild(document.createTextNode(' 导航到这里'));
    navBtn.addEventListener('click', () => {
      if (onNavigate) onNavigate(shop);
    });
    content.appendChild(navBtn);
  }

  overlay.appendChild(content);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeBtn.click();
  });

  overlay.addEventListener('transitionend', (ev) => {
    if (ev.propertyName === 'opacity' && overlay.classList.contains('show')) {
      const cb = overlay.querySelector('.modal-close');
      if (cb && document.activeElement !== cb) cb.focus();
    }
  });

  return overlay;
}
