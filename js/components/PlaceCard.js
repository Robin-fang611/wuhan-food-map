/**
 * components/PlaceCard.js — 游玩地点卡片 + 详情弹窗
 *
 * 从 play.js 提取，专用于"周边游玩"页面。
 */

import { el, Icons } from '../core/dom.js';

export const PLAY_CATEGORIES = {
  '景点名胜': { color: '#8B5CF6', emoji: '🏛️' },
  '街道区巷': { color: '#F59E0B', emoji: '🏘️' },
  '书店打卡': { color: '#3B82F6', emoji: '📚' },
  '寺庙道观': { color: '#10B981', emoji: '🛕' },
  '纪念馆': { color: '#EF4444', emoji: '🏛️' },
  '博物馆': { color: '#6366F1', emoji: '🏛️' },
  '体验打卡': { color: '#EC4899', emoji: '🚢' },
  '附近美食': { color: '#D4A574', emoji: '🍜' },
};

function getPlaceCategoryColor(cat) {
  const c = PLAY_CATEGORIES[cat];
  return c ? c.color : '#999999';
}

function getPlaceCategoryEmoji(cat) {
  const c = PLAY_CATEGORIES[cat];
  return c ? c.emoji : '📍';
}

/** 创建游玩地点卡片 */
export function createPlaceCard(place, onClick) {
  const color = getPlaceCategoryColor(place.category);
  const emoji = getPlaceCategoryEmoji(place.category);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  const card = el('div', { className: 'place-card' });

  const banner = el('div', {
    className: 'place-card-banner',
    style: {
      background: `linear-gradient(135deg, rgba(${r},${g},${b},0.25) 0%, rgba(${r},${g},${b},0.1) 100%)`,
    },
  }, [el('div', { className: 'place-card-emoji' }, emoji)]);
  card.appendChild(banner);

  const body = el('div', { className: 'place-card-body' });
  body.appendChild(el('div', { className: 'place-card-header' }, [
    el('div', { className: 'place-card-name' }, place.name),
    el('span', {
      className: 'place-card-cat',
      style: { background: `rgba(${r},${g},${b},0.15)`, color },
    }, place.category),
  ]));
  body.appendChild(el('div', { className: 'place-card-desc' }, place.description));

  const metaParts = [el('span', { className: 'meta-campus' }, place.campus + '校区')];
  if (place.address) {
    metaParts.push(el('span', { className: 'meta-addr' }, '📍 ' + place.address));
  }
  body.appendChild(el('div', { className: 'place-card-meta' }, metaParts));
  card.appendChild(body);

  card.addEventListener('click', () => { if (onClick) onClick(place); });
  return card;
}

/** 游玩地点详情弹窗 */
export function createPlaceDetail(place) {
  const color = getPlaceCategoryColor(place.category);
  const emoji = getPlaceCategoryEmoji(place.category);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  const overlay = el('div', { className: 'modal-overlay' });
  const content = el('div', { className: 'modal-content' });

  const closeBtn = el('div', { className: 'modal-close' });
  closeBtn.innerHTML = Icons.close;
  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 250);
  });
  content.appendChild(closeBtn);
  content.appendChild(el('div', { className: 'modal-handle' }));

  content.appendChild(el('div', {
    className: 'detail-place-hero',
    style: {
      background: `linear-gradient(135deg, rgba(${r},${g},${b},0.3) 0%, rgba(${r},${g},${b},0.12) 100%)`,
    },
  }, emoji));

  content.appendChild(el('div', { className: 'detail-name' }, place.name));

  const tags = el('div', { className: 'detail-tags' });
  tags.appendChild(el('span', { className: 'detail-tag', style: { background: color, color: '#fff' } }, place.category));
  tags.appendChild(el('span', { className: 'detail-tag', style: { background: 'rgba(139, 92, 246, 0.1)', color: '#7C3AED' } }, place.campus + '校区'));
  content.appendChild(tags);

  if (place.address) {
    content.appendChild(el('div', { className: 'detail-info-row' }, [
      el('div', { className: 'detail-info-label' }, '地址'),
      el('div', { className: 'detail-info-value' }, place.address),
    ]));
  }
  if (place.description) {
    content.appendChild(el('div', { className: 'detail-info-row' }, [
      el('div', { className: 'detail-info-label' }, '简介'),
      el('div', { className: 'detail-info-value', style: { lineHeight: '1.8' } }, place.description),
    ]));
  }
  if (place.tips) {
    content.appendChild(el('div', { className: 'detail-place-tips' }, [
      el('div', { className: 'detail-place-tips-icon' }, '💡'),
      el('div', {}, place.tips),
    ]));
  }

  if (place.lng && place.lat) {
    const navBtn = el('div', { className: 'detail-nav-btn', style: { background: color } });
    navBtn.innerHTML = Icons.navigate;
    navBtn.appendChild(document.createTextNode(' 导航到这里'));
    navBtn.addEventListener('click', () => {
      const url = `https://uri.amap.com/navigation?to=${place.lng},${place.lat},${encodeURIComponent(place.name)}&mode=walk&coordinate=gaode&callnative=1`;
      window.open(url, '_blank');
    });
    content.appendChild(navBtn);
  }

  overlay.appendChild(content);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeBtn.click(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  return overlay;
}
