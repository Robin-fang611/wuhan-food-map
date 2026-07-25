/**
 * components/TabBar.js — 底部导航栏
 */

import { el, Icons } from '../core/dom.js';

/**
 * 创建底部 Tab Bar
 * @param {string} activeTab - 当前活跃 tab id
 * @param {'lime'|'amber'} theme - 主题色
 * @param {Array<{id:string,label:string}>} [customTabs] - 自定义 tab 列表（默认使用 4 个标准 tab）
 * @returns {HTMLElement} tab-bar 容器
 */
export function createTabBar(activeTab, theme = 'lime', customTabs) {
  const defaultTabs = [
    { id: 'map', label: '地图', icon: Icons.mapOutline, activeIcon: Icons.map },
    { id: 'list', label: '列表', icon: Icons.list, activeIcon: Icons.list },
    { id: 'favorite', label: '收藏', icon: Icons.heart, activeIcon: Icons.heartFill },
    { id: 'profile', label: '我的', icon: Icons.user, activeIcon: Icons.user },
  ];

  const tabs = customTabs || defaultTabs;

  const bar = el('div', { className: 'tab-bar' });

  tabs.forEach(tab => {
    const isActive = tab.id === activeTab;
    const item = el('div', {
      className: `tab-item ${isActive ? 'active' : ''} ${theme === 'amber' ? 'amber-theme' : ''}`,
      dataset: { tab: tab.id },
    });
    item.innerHTML = (isActive && tab.activeIcon ? tab.activeIcon : tab.icon) +
      `<span style="margin-top:2px">${tab.label}</span>`;
    bar.appendChild(item);
  });

  return bar;
}
