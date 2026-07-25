/**
 * pages/wuhan.js — 武汉全城美食地图页面逻辑
 */

import { getCategoryColor, getCategoryEmoji, parseAvgPrice, getRatingColor, Favorites, debounce } from '../core/utils.js';
import { el, Icons } from '../core/dom.js';
import { showEmpty, fadeListIn, fadeListOut } from '../core/store.js';
import { createSplash, showToast, showSocialModal, showAdPopup, handleShare } from '../core/ui.js';
import { MapController } from '../core/map.js';
import { createShopCard, createDetailModal } from '../components/ShopCard.js';
import { createTabBar } from '../components/TabBar.js';
import { createFilterChips } from '../components/FilterBar.js';
import { renderProfileView, renderFavoriteView } from '../components/ProfileView.js';

(function () {
  'use strict';

  const state = {
    allShops: [],
    filteredShops: [],
    displayedShops: [],
    activeArea: '全部',
    activeCategory: '全部',
    searchQuery: '',
    sortBy: 'rating',
    activeTab: 'list',
    mapController: null,
    pageSize: 20,
    currentPage: 0,
    isLoadingMore: false,
    scrollObserver: null,
  };

  const SORT_LABELS = {
    'rating': '按评分排序',
    'price-low': '价格从低到高',
    'price-high': '价格从高到低',
    'distance': '按距离排序',
  };

  const ALL_CATEGORIES = [
    '全部', '五谷杂粮', '烧烤', '火锅', '烤肉', '早餐', '面包甜点', '湖北菜',
    '日式烧鸟&日料', '粤&闽菜&潮汕火锅', '西餐', '自助餐', '苍蝇馆子', '私房菜',
    '韩国菜', '泰国菜', '其他国家菜',
  ];

  const AREAS = ['全部', '武昌', '洪山/江夏', '汉口', '江汉', '江岸', '汉阳', '江夏', '硚口', '青山', '光谷', '沌口', '蔡甸', '青山区'];

  const CATEGORY_GRID = [
    { name: '全部', color: '#1A1A23' },
    { name: '五谷杂粮', color: '#D4A574' },
    { name: '烧烤', color: '#FF5A5F' },
    { name: '火锅', color: '#EF4444' },
    { name: '烤肉', color: '#E85D3C' },
    { name: '早餐', color: '#FFB400' },
    { name: '面包甜点', color: '#F472B6' },
    { name: '湖北菜', color: '#DC2626' },
  ];

  const dom = {};

  function cacheDom() {
    dom.app = document.getElementById('app');
    dom.header = document.getElementById('header');
    dom.content = document.getElementById('content');
    dom.shopList = document.getElementById('shop-list');
    dom.resultTitle = document.getElementById('result-title');
    dom.sortLabel = document.getElementById('sort-label');
    dom.tabBar = document.getElementById('tab-bar');
    dom.areaToggle = document.getElementById('area-toggle');
    dom.categoryChips = document.getElementById('category-chips');
    dom.categoryGrid = document.getElementById('category-grid');
    dom.searchContainer = document.getElementById('search-container');
    dom.searchBtn = document.getElementById('search-btn');
    dom.searchInput = document.getElementById('search-input');
    dom.searchClear = document.getElementById('search-clear');
    dom.sortBtn = document.getElementById('sort-btn');
    dom.sortDropdown = document.getElementById('sort-dropdown');
    dom.sortMenu = document.getElementById('sort-menu');
    dom.socialBtn = document.getElementById('social-btn');
    dom.shareBtn = document.getElementById('share-btn');
    dom.mapView = document.getElementById('map-view');
    dom.mapBackBtn = document.getElementById('map-back-btn');
    dom.mapCanvas = document.getElementById('amap-canvas');
    dom.mapPlaceholder = document.getElementById('map-placeholder');
    dom.loadMore = document.getElementById('load-more');
  }

  function init() {
    cacheDom();
    state.allShops = window.__WUHAN_DATA__ || [];

    createSplash('江城 · 全城美食地图', `带你吃遍武汉三镇 · ${state.allShops.length}家精选`);

    setTimeout(() => showAdPopup('wuhan'), 1200);

    renderAreaToggle();
    renderCategoryGrid();
    renderCategoryChips();
    renderTabBar();
    bindEvents();
    filterAndRender();
  }

  // === 区域筛选 ===
  function renderAreaToggle() {
    dom.areaToggle.innerHTML = '';
    AREAS.forEach(area => {
      const tab = el('div', {
        className: `toggle-tab ${area === state.activeArea ? 'active amber-theme' : ''}`,
        dataset: { area },
      }, area);
      tab.addEventListener('click', () => {
        state.activeArea = area;
        if (window.__analytics) window.__analytics.trackFilter('area', area);
        renderAreaToggle();
        filterAndRender();
      });
      dom.areaToggle.appendChild(tab);
    });
  }

  // === 分类网格 ===
  function renderCategoryGrid() {
    dom.categoryGrid.innerHTML = '';
    CATEGORY_GRID.forEach(cat => {
      const count = cat.name === '全部' ? state.allShops.length
        : state.allShops.filter(s => s.category === cat.name).length;

      const cell = el('div', {
        className: `category-cell ${state.activeCategory === cat.name ? 'active' : ''}`,
        dataset: { category: cat.name },
      });

      const emoji = getCategoryEmoji(cat.name);
      cell.appendChild(el('div', {
        className: 'category-icon',
        style: { background: cat.color, color: cat.name === '全部' || cat.color === '#B9FF66' ? '#1A1A23' : 'white' },
      }, emoji || cat.name[0]));
      cell.appendChild(el('div', { className: 'category-label' }, cat.name));
      cell.appendChild(el('div', { className: 'category-count' }, count + '家'));

      cell.addEventListener('click', () => {
        state.activeCategory = cat.name;
        renderCategoryGrid();
        renderCategoryChips();
        filterAndRender();
      });
      dom.categoryGrid.appendChild(cell);
    });
  }

  // === 分类 Chips ===
  function renderCategoryChips() {
    createFilterChips(dom.categoryChips, ALL_CATEGORIES, state.activeCategory, (cat) => {
      state.activeCategory = cat;
      if (window.__analytics) window.__analytics.trackFilter('category', cat);
      renderCategoryGrid();
      renderCategoryChips();
      filterAndRender();
    });
  }

  // === 筛选排序 ===
  function filterShops() {
    let result = [...state.allShops];

    if (state.activeArea !== '全部') {
      result = result.filter(s => s.area === state.activeArea);
    }
    if (state.activeCategory !== '全部') {
      result = result.filter(s => s.category === state.activeCategory);
    }
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.signatureDishes || '').toLowerCase().includes(q) ||
        (s.address || '').toLowerCase().includes(q) ||
        (s.reason || '').toLowerCase().includes(q) ||
        (s.cuisine || '').toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      switch (state.sortBy) {
        case 'rating': return getRatingScore(b.rating) - getRatingScore(a.rating);
        case 'price-low': return (parseAvgPrice(a.avgPrice) || 9999) - (parseAvgPrice(b.avgPrice) || 9999);
        case 'price-high': return (parseAvgPrice(b.avgPrice) || 0) - (parseAvgPrice(a.avgPrice) || 0);
        case 'distance': return getNearestDistance(a) - getNearestDistance(b);
        default: return 0;
      }
    });

    state.filteredShops = result;
    return result;
  }

  function getNearestDistance(shop) {
    return Math.min(shop.distanceToShouyi_km || 999, shop.distanceToNanhu_km || 999);
  }

  function getRatingScore(rating) {
    if (rating === '必吃') return 3;
    if (rating === '推荐') return 2;
    const num = parseFloat(rating);
    return isNaN(num) ? 0 : (num / 5 * 3);
  }

  // === 渲染（分页） ===
  function filterAndRender() {
    const shops = filterShops();
    state.currentPage = 0;
    state.displayedShops = [];

    dom.resultTitle.textContent = state.activeCategory === '全部'
      ? `热门推荐 · ${shops.length}家`
      : `${state.activeCategory} · ${shops.length}家`;
    dom.sortLabel.textContent = SORT_LABELS[state.sortBy];

    dom.shopList.innerHTML = '';
    if (shops.length === 0) {
      showEmpty(dom.shopList, '没有找到符合条件的美食\n试试换个区域或分类？');
      dom.loadMore.classList.add('hidden');
      return;
    }

    renderPage(shops, 0);

    if (shops.length > state.pageSize) {
      dom.loadMore.classList.remove('hidden');
      setupInfiniteScroll();
    } else {
      dom.loadMore.classList.add('hidden');
    }
  }

  function renderPage(shops, page) {
    const start = page * state.pageSize;
    const end = Math.min(start + state.pageSize, shops.length);

    for (let i = start; i < end; i++) {
      const shop = shops[i];
      const card = createShopCard(shop, (s) => showDetail(s));
      if (shop.rating === '必吃') {
        const badge = el('div', { className: 'must-eat-badge' }, '必吃');
        card.style.position = 'relative';
        card.appendChild(badge);
      }
      card.style.animationDelay = `${Math.min((i - start) * 30, 300)}ms`;
      dom.shopList.appendChild(card);
      state.displayedShops.push(shop);
    }

    if (state.displayedShops.length >= shops.length) {
      dom.loadMore.classList.add('hidden');
    }
  }

  function setupInfiniteScroll() {
    if (state.scrollObserver) state.scrollObserver.disconnect();

    if (state.isLoadingMore) return;
    state.scrollObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !state.isLoadingMore) {
        loadMore();
      }
    }, { rootMargin: '100px' });
    state.scrollObserver.observe(dom.loadMore);
  }

  function loadMore() {
    if (state.isLoadingMore) return;
    if (state.displayedShops.length >= state.filteredShops.length) return;
    state.isLoadingMore = true;
    state.currentPage++;
    setTimeout(() => {
      renderPage(state.filteredShops, state.currentPage);
      state.isLoadingMore = false;
    }, 300);
  }

  function showDetail(shop) {
    if (window.__analytics) window.__analytics.trackShopClick(shop);
    const modal = createDetailModal(shop, null, (s) => {
      if (window.__analytics) window.__analytics.trackNavigate(s);
      const url = `https://uri.amap.com/navigation?to=${s.lng},${s.lat},${encodeURIComponent(s.name)}&mode=walk&coordinate=gaode&callnative=1`;
      window.open(url, '_blank');
    });
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
  }

  // === 地图 ===
  function markerContent(shop) {
    const color = getCategoryColor(shop.category);
    const emoji = getCategoryEmoji(shop.category) || '食';
    return `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:${color === '#B9FF66' ? '#1A1A23' : '#fff'}">${emoji}</div>`;
  }

  function infoContent(shop) {
    const navUrl = `https://uri.amap.com/navigation?to=${shop.lng},${shop.lat},${encodeURIComponent(shop.name)}&mode=walk&coordinate=gaode&callnative=1`;
    return `
      <div class="amap-info-card">
        <div class="amap-info-name">${shop.name}</div>
        <div class="amap-info-meta">
          ${shop.rating ? `<span style="color:${getRatingColor(shop.rating)};font-weight:600">${shop.rating}</span> · ` : ''}
          ¥${shop.avgPrice || '?'}/人 ${shop.area ? '· ' + shop.area : ''}
        </div>
        ${shop.signatureDishes ? `<div class="amap-info-dishes">招牌：${shop.signatureDishes}</div>` : ''}
        <div class="amap-info-nav" onclick="window.open('${navUrl}','_blank')">导航到这里 →</div>
      </div>`;
  }

  function showMap() {
    dom.mapView.classList.add('show');
    document.body.classList.add('no-scroll');

    if (!state.mapController) {
      state.mapController = new MapController('amap-canvas', {
        center: [114.31, 30.55],
        zoom: 12,
      });
    }

    state.mapController.show(() => state.filteredShops, markerContent, infoContent, { size: 22 });
  }

  // === Tab 切换 ===
  function renderTabBar() {
    dom.tabBar.innerHTML = '';
    const bar = createTabBar(state.activeTab, 'amber');
    dom.tabBar.appendChild(bar);
    bar.querySelectorAll('.tab-item').forEach(item => {
      item.addEventListener('click', () => switchTab(item.dataset.tab));
    });
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    renderTabBar();
    dom.mapView.classList.remove('show');
    document.body.classList.remove('no-scroll');

    if (tabId === 'list') {
      rebuildListView();
    } else if (tabId === 'map') {
      showMap();
    } else if (tabId === 'favorite') {
      showFavoritesView();
    } else if (tabId === 'profile') {
      showProfileView();
    }
  }

  function rebuildListView() {
    dom.content.innerHTML =
      '<div class="category-grid" id="category-grid"></div>' +
      '<div class="section-header">' +
        '<span class="section-title" id="result-title">热门推荐</span>' +
        '<span class="section-action" id="sort-label">按评分排序</span>' +
      '</div>' +
      '<div id="shop-list"></div>' +
      '<div class="load-more hidden" id="load-more">' +
        '<div class="loading-dots"><span></span><span></span><span></span></div>' +
        '<span style="font-size:12px;color:#999;margin-left:8px;">加载更多美食...</span>' +
      '</div>';

    dom.categoryGrid = document.getElementById('category-grid');
    dom.resultTitle = document.getElementById('result-title');
    dom.sortLabel = document.getElementById('sort-label');
    dom.shopList = document.getElementById('shop-list');
    dom.loadMore = document.getElementById('load-more');

    renderCategoryGrid();
    filterAndRender();
  }

  function showFavoritesView() {
    const favs = Favorites.get();
    const favShops = state.allShops.filter(s => favs.includes(s.name));
    dom.content.innerHTML = '';
    renderFavoriteView(dom.content, favShops, (s) => showDetail(s));
  }

  function showProfileView() {
    const favCount = Favorites.get().length;
    dom.content.innerHTML = '';
    renderProfileView(dom.content, {
      avatar: '🧭',
      name: '武汉美食探索者',
      desc: `已收藏 ${favCount} 家 · 探索 ${state.allShops.length} 家美食`,
      stats: [
        { icon: '🏪', value: state.allShops.length, label: '全城店铺' },
        { icon: '🏷️', value: '17', label: '美食分类' },
        { icon: '❤️', value: favCount, label: '已收藏' },
      ],
      menuItems: [
        { icon: '🎯', label: '我的收藏', action: () => switchTab('favorite') },
        { icon: '💬', label: '加入武汉吃货群', action: () => showSocialModal() },
        { icon: '🏫', label: '切换到财大周边版', action: () => window.location.href = 'campus.html' },
        { icon: 'ℹ️', label: '关于', action: () => showAboutModal() },
      ],
    });
  }

  function showAboutModal() {
    const overlay = el('div', { className: 'modal-overlay' });
    const content = el('div', { className: 'modal-content', style: { textAlign: 'center' } });
    content.appendChild(el('div', { className: 'modal-handle' }));
    content.appendChild(el('div', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '8px' } }, '江城 · 全城版'));
    content.appendChild(el('div', { style: { fontSize: '13px', color: '#999', marginBottom: '20px' } }, 'Version 1.0.0'));
    content.appendChild(el('div', {
      style: { fontSize: '14px', color: '#666', lineHeight: '1.8', textAlign: 'left', marginBottom: '16px' },
    }, [
      '江城·全城版带你探索武汉三镇美食，覆盖 540+ 家精选店铺。\n\n',
      '数据来源：实地探访 + 社群推荐\n',
      '覆盖区域：武昌、洪山、江汉、江岸、汉阳、江夏等\n',
      '分类：17 个美食分类，从早餐到夜宵全覆盖',
    ].join('')));

    const closeBtn = el('div', { className: 'modal-close' });
    closeBtn.innerHTML = Icons.close;
    closeBtn.addEventListener('click', () => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 250);
    });
    content.appendChild(closeBtn);
    overlay.appendChild(content);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeBtn.click(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  function bindEvents() {
    // 搜索
    dom.searchBtn.addEventListener('click', () => {
      const hidden = dom.searchContainer.classList.contains('hidden');
      if (hidden) {
        dom.searchContainer.classList.remove('hidden');
        dom.searchContainer.classList.add('fade-in');
        setTimeout(() => dom.searchInput.focus(), 100);
      } else {
        dom.searchContainer.classList.add('hidden');
        dom.searchInput.value = '';
        dom.searchClear.style.display = 'none';
        state.searchQuery = '';
        filterAndRender();
      }
    });
    const onSearch = debounce(() => {
      state.searchQuery = dom.searchInput.value.trim();
      dom.searchClear.style.display = state.searchQuery ? 'flex' : 'none';
      if (state.searchQuery && window.__analytics) window.__analytics.trackSearch(state.searchQuery);
      filterAndRender();
    }, 400);
    dom.searchInput.addEventListener('input', onSearch);
    dom.searchClear.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.searchClear.style.display = 'none';
      state.searchQuery = '';
      filterAndRender();
    });

    // 排序
    dom.sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.sortDropdown.classList.toggle('hidden');
      dom.sortMenu.classList.toggle('show');
    });
    dom.sortMenu.querySelectorAll('.sort-item').forEach(item => {
      item.addEventListener('click', () => {
        dom.sortMenu.querySelectorAll('.sort-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        state.sortBy = item.dataset.sort;
        dom.sortDropdown.classList.add('hidden');
        dom.sortMenu.classList.remove('show');
        filterAndRender();
      });
    });
    document.addEventListener('click', (e) => {
      if (!dom.sortDropdown.contains(e.target) && e.target !== dom.sortBtn) {
        dom.sortDropdown.classList.add('hidden');
        dom.sortMenu.classList.remove('show');
      }
    });

    // 地图返回
    dom.mapBackBtn.addEventListener('click', () => {
      dom.mapView.classList.remove('show');
      document.body.classList.remove('no-scroll');
      switchTab('list');
    });

    dom.shareBtn.addEventListener('click', handleShare);
    dom.socialBtn.addEventListener('click', () => {
      if (window.__analytics) window.__analytics.trackSocial();
      showSocialModal();
    });

    dom.content.addEventListener('scroll', () => {
      dom.header.classList.toggle('scrolled', dom.content.scrollTop > 10);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
