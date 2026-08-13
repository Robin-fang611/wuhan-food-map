// 发现 / 列表 / 搜索 / 筛选 —— UI 层。
// 严格复用架构：纯逻辑在 core/query.js；本文件只做安全渲染（h()，无 innerHTML）。
import { h, clear } from './dom.js';
import { SearchBar } from './search.js';
import { ConfidenceBadge } from './confidence.js';
import { allMerchants as merchants } from '../data/all-merchants.js';
import {
  filterMerchants, sortMerchants, listCategories, parsePrice, CAMPUS_COORDS, WUHAN_CENTER
} from '../core/query.js';

const PAGE = 20;

// 单张商户卡（纯展示，无 innerHTML）。goDetail 存在时整卡可点跳转详情页。
export function MerchantCard(m, goDetail) {
  const price = parsePrice(m.avgPrice);
  const ratingEl = m.rating === '必吃'
    ? h('span', { class: 'm-rating best', text: '必吃' })
    : m.rating === '推荐'
      ? h('span', { class: 'm-rating good', text: '推荐' })
      : null;

  const mealTags = Array.isArray(m.mealTime) && m.mealTime.length
    ? m.mealTime.map((t) => h('span', { class: 'm-meal', text: t }))
    : null;

  const props = { class: 'm-card' };
  if (goDetail) {
    props.role = 'button';
    props.tabindex = '0';
    props.onclick = () => goDetail(m.id);
  }
  const couponTag = m.cpsTag
    ? h('span', { class: 'm-coupon cps', text: '可核销优惠' })
    : (m.has_coupon ? h('span', { class: 'm-coupon', text: '有券' }) : null);
  const card = h('div', props, [
    h('div', { class: 'm-head' }, [
      h('div', { class: 'm-name', text: m.name || '未命名商户' }),
      ratingEl
    ]),
    h('div', { class: 'm-meta' }, [
      h('span', { class: 'm-tag', text: m.category || '其他' }),
      h('span', { class: 'm-price', text: price != null ? `人均 ¥${price}` : '人均 待补' }),
      ConfidenceBadge(m)
    ]),
    m.signatureDishes
      ? h('div', { class: 'm-dishes', text: `招牌：${m.signatureDishes}` })
      : null,
    m.address ? h('div', { class: 'm-addr', text: m.address }) : null,
    h('div', { class: 'm-foot' }, [
      h('div', { class: 'm-meals' }, mealTags || []),
      couponTag
    ])
  ]);

  if (goDetail) {
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goDetail(m.id); }
    });
  }
  return card;
}

// 通用 chip 按钮
function chip(label, active, onClick) {
  return h('button', {
    class: `chip ${active ? 'active' : ''}`,
    type: 'button',
    text: label,
    onclick: onClick
  });
}

// 区段标题 + 一组 chips 的容器
function chipRow(title, chips) {
  return h('div', { class: 'filter-block' }, [
    h('div', { class: 'filter-label', text: title }),
    h('div', { class: 'chips' }, chips)
  ]);
}

/**
 * 发现页（嵌入首页）。管理筛选状态并实时重算结果列表。
 */
export function Discover({ goDetail } = {}) {
  const CATS = listCategories(merchants);
  const ZONES = ['财大南湖周边', '武汉全城'];
  const MEALS = ['早', '午', '晚', '夜宵'];
  const PRICES = [
    { label: '不限', val: null },
    { label: '≤30', val: 30 },
    { label: '≤50', val: 50 },
    { label: '≤80', val: 80 }
  ];
  const SORTS = [
    { label: '评分', val: 'rating' },
    { label: '价格', val: 'price' },
    { label: '距离', val: 'distance' }
  ];

  const state = {
    zone: '财大南湖周边',
    categories: new Set(),
    mealTime: new Set(),
    maxPrice: null,
    keyword: '',
    sort: 'rating',
    page: 1
  };

  const root = h('div', { class: 'section', style: 'padding-top:0' });

  // —— 标题 ——
  root.appendChild(h('h2', {}, [
    document.createTextNode('发现好吃'),
    h('span', { class: 'tag', text: '探过' })
  ]));

  // —— 搜索框 ——
  const results = h('div', { class: 'm-list' });
  const countEl = h('div', { class: 'm-count muted' });

  function recompute() {
    const filtered = filterMerchants(merchants, {
      zone: state.zone,
      categories: [...state.categories],
      mealTime: [...state.mealTime],
      maxPrice: state.maxPrice,
      keyword: state.keyword
    });
    const fromCoord = CAMPUS_COORDS[state.zone] || WUHAN_CENTER;
    return sortMerchants(filtered, { sort: state.sort, fromCoord });
  }

  function renderResults() {
    const all = recompute();
    const total = all.length;
    const shown = all.slice(0, state.page * PAGE);
    clear(results);
    if (total === 0) {
      results.appendChild(h('div', { class: 'empty', text: '没有匹配的美食，换个筛选试试~' }));
    } else {
      for (const m of shown) results.appendChild(MerchantCard(m, goDetail));
      if (shown.length < total) {
        results.appendChild(h('button', {
          class: 'btn btn-ghost btn-block m-more',
          text: `加载更多（已显示 ${shown.length}/${total}）`,
          onclick: () => { state.page += 1; renderResults(); }
        }));
      }
    }
    countEl.textContent = `共 ${total} 家 · 当前 ${Math.min(shown.length, total)}`;
  }

  // —— 控件构建（一次性，点击只切换自身 active + 更新 state + 重算）——
  function refresh() { state.page = 1; renderResults(); }

  const zoneChips = ZONES.map((z) => chip(z, state.zone === z, () => {
    state.zone = z;
    zoneChips.forEach((c, i) => c.classList.toggle('active', ZONES[i] === z));
    refresh();
  }));

  const catChips = CATS.map((c) => chip(c, false, () => {
    if (state.categories.has(c)) state.categories.delete(c); else state.categories.add(c);
    // 重新绑定 active 态
    catChips.forEach((el, i) => el.classList.toggle('active', state.categories.has(CATS[i])));
    refresh();
  }));

  const mealChips = MEALS.map((t) => chip(t, false, () => {
    if (state.mealTime.has(t)) state.mealTime.delete(t); else state.mealTime.add(t);
    mealChips.forEach((el, i) => el.classList.toggle('active', state.mealTime.has(MEALS[i])));
    refresh();
  }));

  const priceChips = PRICES.map((p) => chip(p.label, state.maxPrice === p.val, () => {
    state.maxPrice = p.val;
    priceChips.forEach((el, i) => el.classList.toggle('active', PRICES[i].val === state.maxPrice));
    refresh();
  }));

  const sortChips = SORTS.map((s) => chip(s.label, state.sort === s.val, () => {
    state.sort = s.val;
    sortChips.forEach((el, i) => el.classList.toggle('active', SORTS[i].val === state.sort));
    refresh();
  }));

  root.appendChild(SearchBar({
    placeholder: '搜店名、招牌菜…',
    onInput: (v) => { state.keyword = v; refresh(); }
  }));

  root.appendChild(chipRow('片区', zoneChips));
  root.appendChild(chipRow('分类', catChips));
  root.appendChild(chipRow('场景', mealChips));
  root.appendChild(chipRow('人均', priceChips));
  root.appendChild(chipRow('排序', sortChips));

  root.appendChild(h('div', { class: 'm-toolbar' }, [countEl]));
  root.appendChild(results);

  renderResults();
  return root;
}
