/**
 * core/dom.js — DOM 构建函数 + SVG 图标库
 *
 * 从 common.js 提取的 DOM 辅助函数。无业务逻辑，只负责构建 DOM 节点。
 */

/** DOM 创建助手 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') {
      node.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign(node.dataset, value);
    } else if (value !== null && value !== undefined) {
      node.setAttribute(key, value);
    }
  });
  const childArray = Array.isArray(children) ? children : [children];
  childArray.forEach(child => {
    if (child === null || child === undefined) return;
    if (typeof child === 'string') {
      node.appendChild(document.createTextNode(child));
    } else {
      node.appendChild(child);
    }
  });
  return node;
}

/** SVG 图标库 */
export const Icons = {
  search: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="M14 14L18 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  filter: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 6H17M5 10H15M7 14H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  location: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 18S3 11.5 3 7.5C3 4.5 5.5 2 8.5 2C10 2 10 2.5 10 2.5C10 2.5 10 2 11.5 2C14.5 2 17 4.5 17 7.5C17 11.5 10 18 10 18Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="10" cy="7.5" r="2" fill="currentColor"/></svg>',
  map: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9C5 13.5 12 22 12 22S19 13.5 19 9C19 5.13 15.87 2 12 2Z" fill="currentColor"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg>',
  mapOutline: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9C5 13.5 12 22 12 22S19 13.5 19 9C19 5.13 15.87 2 12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/></svg>',
  list: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  heart: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 21S4 14.5 4 8.5C4 5.5 6.5 3 9.5 3C11 3 12 4 12 4S13 3 14.5 3C17.5 3 20 5.5 20 8.5C20 14.5 12 21 12 21Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  heartFill: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21S4 14.5 4 8.5C4 5.5 6.5 3 9.5 3C11 3 12 4 12 4S13 3 14.5 3C17.5 3 20 5.5 20 8.5C20 14.5 12 21 12 21Z"/></svg>',
  user: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 21C4 17 7.5 14 12 14S20 17 20 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  arrowRight: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 8H12.5M12.5 8L8.5 4M12.5 8L8.5 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrowLeft: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  star: '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 0L7.5 4.5H12L8.25 7.5L9.75 12L6 9L2.25 12L3.75 7.5L0 4.5H4.5L6 0Z"/></svg>',
  navigate: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 14L14 2M14 2H6M14 2V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  group: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="2"/><path d="M3 19C3 16 5.5 14 9 14S15 16 15 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="9" r="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M15 19C15 17 16.5 15.5 18.5 15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 4V8L10.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  sort: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 5H13M5 8H11M7 11H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  chat: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5C3 4 4 3 5 3H15C16 3 17 4 17 5V12C17 13 16 14 15 14H8L4 17V5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};
