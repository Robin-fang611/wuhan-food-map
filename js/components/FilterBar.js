/**
 * components/FilterBar.js — 分类筛选 + 排序 + 搜索
 *
 * 依赖 core/utils 和 core/dom。
 */

import { getCategoryColor } from '../core/utils.js';
import { el, Icons } from '../core/dom.js';

/**
 * 创建分类筛选 chips
 * @param {string[]} categories - 分类列表（含"全部"）
 * @param {string} activeCategory - 当前选中
 * @param {Function} onChange - (category) => void
 */
export function createFilterChips(container, categories, activeCategory, onChange) {
  container.innerHTML = '';

  categories.forEach(cat => {
    const isActive = cat === activeCategory;
    const chip = el('div', {
      className: `chip ${isActive ? 'active' : ''}`,
      dataset: { category: cat },
    });

    if (cat !== '全部') {
      chip.appendChild(el('span', {
        className: 'chip-dot',
        style: { background: getCategoryColor(cat) },
      }));
    }
    chip.appendChild(document.createTextNode(cat));
    chip.addEventListener('click', () => {
      if (onChange) onChange(cat);
    });
    container.appendChild(chip);
  });
}

/**
 * 创建排序菜单 DOM（已追加到 body）
 * @param {string} currentSort - 当前排序值
 * @param {object} options - { value: label } 映射
 * @param {Function} onChange - (sortValue) => void
 * @returns {{ menu: HTMLElement, labelEl: HTMLElement|null, destroy: Function }}
 */
export function createSortMenu(triggerBtn, currentSort, options, onChange) {
  const sortLabels = options;

  // 创建下拉菜单容器
  const dropdown = el('div', { className: 'sort-dropdown hidden' });
  const menu = el('div', { className: 'sort-menu' });

  Object.entries(sortLabels).forEach(([value, label]) => {
    const item = el('div', {
      className: `sort-item ${value === currentSort ? 'active' : ''}`,
      dataset: { sort: value },
    }, label);
    item.addEventListener('click', () => {
      menu.querySelectorAll('.sort-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      dropdown.classList.add('hidden');
      menu.classList.remove('show');
      if (onChange) onChange(value);
    });
    menu.appendChild(item);
  });

  dropdown.appendChild(menu);
  document.body.appendChild(dropdown);

  // 定位
  function position() {
    if (!triggerBtn) return;
    const rect = triggerBtn.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = (rect.right - 150) + 'px';
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.zIndex = '200';
  }

  function toggle() {
    position();
    dropdown.classList.toggle('hidden');
    menu.classList.toggle('show');
  }

  function close() {
    dropdown.classList.add('hidden');
    menu.classList.remove('show');
  }

  // 外部点击关闭
  const docHandler = (e) => {
    if (!dropdown.contains(e.target) && e.target !== triggerBtn) {
      close();
    }
  };
  document.addEventListener('click', docHandler);

  return {
    menu,
    dropdown,
    toggle,
    close,
    getLabel(value) {
      return sortLabels[value] || value;
    },
    destroy() {
      document.removeEventListener('click', docHandler);
      if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
    },
  };
}

/**
 * 创建搜索栏
 * @param {HTMLElement} container - 搜索容器（class="search-bar-container"）
 * @param {Function} onSearch - debounced (query) => void
 * @param {string} placeholder - 占位文本
 * @returns {{ open: Function, close: Function, input: HTMLElement }}
 */
export function createSearchBar(container, onSearch, placeholder) {
  container.innerHTML = '';
  const wrap = el('div', { className: 'search-input-wrap' });
  wrap.innerHTML = Icons.search;

  const input = el('input', {
    className: 'search-input',
    type: 'text',
    placeholder: placeholder || '搜索美食...',
  });
  wrap.appendChild(input);

  const clear = el('div', {
    className: 'icon-btn',
    style: { display: 'none' },
  });
  clear.innerHTML = Icons.close;
  wrap.appendChild(clear);
  container.appendChild(wrap);

  // 防抖搜索
  let timer;
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clear.style.display = q ? 'flex' : 'none';
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (onSearch) onSearch(q);
    }, 400);
  });

  clear.addEventListener('click', () => {
    input.value = '';
    clear.style.display = 'none';
    if (onSearch) onSearch('');
    input.focus();
  });

  return {
    open() {
      container.classList.remove('hidden');
      container.classList.add('fade-in');
      setTimeout(() => input.focus(), 100);
    },
    close() {
      container.classList.add('hidden');
      input.value = '';
      clear.style.display = 'none';
      if (onSearch) onSearch('');
    },
    input,
    clear,
  };
}
