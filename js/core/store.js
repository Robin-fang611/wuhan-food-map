/**
 * core/store.js — 数据层 UI 辅助
 *
 * 从 common.js 提取的加载/空态/骨架屏。
 * 负责列表容器的状态展示，不包含业务逻辑。
 */
import { el } from './dom.js';

/** 加载状态 */
export function showLoading(container, text = '加载中') {
  const loader = el('div', {
    className: 'empty-state',
    style: { padding: '40px 20px' },
  }, [
    el('div', { className: 'loading-dots' }, [
      el('span'), el('span'), el('span'),
    ]),
    el('div', { style: { fontSize: '13px', color: '#999' } }, text),
  ]);
  container.innerHTML = '';
  container.appendChild(loader);
}

/** 空状态 */
export function showEmpty(container, text = '暂无数据') {
  const empty = el('div', { className: 'empty-state' }, [
    el('div', { className: 'empty-state-icon' }, '🍽️'),
    el('div', { className: 'empty-state-text' }, text),
  ]);
  container.innerHTML = '';
  container.appendChild(empty);
}

/** 骨架屏占位 */
export function showSkeleton(container, count = 4) {
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const card = el('div', { className: 'skeleton-card' }, [
      el('div', { className: 'sk-img skeleton' }),
      el('div', { className: 'sk-lines' }, [
        el('div', { className: 'skeleton-line sk-1 skeleton' }),
        el('div', { className: 'skeleton-line sk-2 skeleton' }),
        el('div', { className: 'skeleton-line sk-3 skeleton' }),
        el('div', { className: 'skeleton-line sk-4 skeleton' }),
      ]),
    ]);
    container.appendChild(card);
  }
}

/** 列表淡出 */
export function fadeListOut(node) {
  if (node) node.style.opacity = '0';
}

/** 列表淡入 */
export function fadeListIn(node) {
  if (!node) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    node.style.opacity = '1';
  }));
}
