// 搜索框组件（可复用）。输入即回调 onInput，由宿主自行决定防抖/重渲染。
import { h } from './dom.js';

/**
 * @param {object} ctx
 *   value        {string}  初始值
 *   placeholder  {string}
 *   onInput      {(v:string)=>void}  输入即时回调
 */
export function SearchBar({ value = '', placeholder = '搜店名、招牌菜…', onInput } = {}) {
  const input = h('input', {
    class: 'search-input',
    type: 'search',
    value,
    placeholder,
    'aria-label': '搜索美食'
  });
  input.addEventListener('input', () => { if (onInput) onInput(input.value); });
  // 回车/搜索按钮不提交表单（无 form），仅触发一次回调
  input.addEventListener('search', () => { if (onInput) onInput(input.value); });
  return h('div', { class: 'search-bar' }, [input]);
}
