/**
 * components/ProfileView.js — "我的"页面
 *
 * 从各页面重复的 renderProfileView/renderFavoriteView 提取。
 */

import { el, Icons } from '../core/dom.js';
import { createShopCard } from './ShopCard.js';

/**
 * 渲染"我的"页面
 * @param {HTMLElement} container - 内容容器
 * @param {object} config
 * @param {string} config.avatar - 头像 emoji
 * @param {string} config.name - 用户名
 * @param {string} config.desc - 描述
 * @param {Array<{icon:string,value:string|number,label:string}>} config.stats - 统计卡片
 * @param {Array<{icon:string,label:string,action:Function}>} config.menuItems - 菜单项
 */
export function renderProfileView(container, config) {
  container.innerHTML = '';
  container.appendChild(el('div', { className: 'profile-section' }));

  const section = container.querySelector('.profile-section');

  // 用户信息
  section.appendChild(el('div', { className: 'profile-header' }, [
    el('div', { className: 'profile-avatar' }, config.avatar || '😋'),
    el('div', { className: 'profile-info' }, [
      el('div', { className: 'profile-name' }, config.name || '美食探索者'),
      el('div', { className: 'profile-desc' }, config.desc || ''),
    ]),
  ]));

  // 统计卡片
  if (config.stats && config.stats.length > 0) {
    const statsRow = el('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } });
    config.stats.forEach(s => {
      statsRow.appendChild(createStatCard(s.icon, String(s.value), s.label));
    });
    section.appendChild(statsRow);
  }

  // 菜单项
  if (config.menuItems) {
    config.menuItems.forEach(item => {
      const menuItem = el('div', { className: 'profile-menu-item' });
      menuItem.appendChild(el('div', { className: 'profile-menu-icon', style: { fontSize: '16px' } }, item.icon));
      menuItem.appendChild(el('div', { className: 'profile-menu-label' }, item.label));
      const arrow = el('div', { className: 'profile-menu-arrow' });
      arrow.innerHTML = Icons.arrowRight;
      menuItem.appendChild(arrow);
      menuItem.addEventListener('click', item.action);
      section.appendChild(menuItem);
    });
  }
}

/** 内部统计卡片 */
function createStatCard(icon, value, label) {
  return el('div', {
    style: {
      flex: '1', background: 'var(--card-bg)', borderRadius: '12px',
      padding: '12px', textAlign: 'center', boxShadow: 'var(--shadow-sm)',
    },
  }, [
    el('div', { style: { fontSize: '20px', marginBottom: '4px' } }, icon),
    el('div', { style: { fontSize: '18px', fontWeight: '700' } }, value),
    el('div', { style: { fontSize: '11px', color: 'var(--text-tertiary)' } }, label),
  ]);
}

/**
 * 渲染收藏列表（复用 ShopCard）
 * @param {HTMLElement} container - 内容容器
 * @param {Array} shops - 收藏的店铺数组
 * @param {Function} onClick - (shop) => void 点击回调
 */
export function renderFavoriteView(container, shops, onClick) {
  container.innerHTML = '';

  const title = shops.length === 0 ? '我的收藏 · 0家' : `我的收藏 · ${shops.length}家`;
  container.appendChild(el('div', { className: 'section-header' }, [
    el('span', { className: 'section-title' }, title),
  ]));

  const listContainer = el('div', { className: 'favorite-list' });

  if (shops.length === 0) {
    const empty = el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state-icon' }, '🍽️'),
      el('div', { className: 'empty-state-text' }, '还没有收藏的美食\n点击列表中的店铺卡片即可收藏'),
    ]);
    listContainer.appendChild(empty);
  } else {
    shops.forEach((shop, i) => {
      const card = createShopCard(shop, (s) => onClick(s));
      card.style.animationDelay = `${i * 30}ms`;

      // 收藏标记
      const indicator = el('div', { className: 'fav-indicator' });
      indicator.innerHTML = Icons.heartFill;
      card.style.position = 'relative';
      card.appendChild(indicator);
      listContainer.appendChild(card);
    });
  }

  container.appendChild(listContainer);
}
