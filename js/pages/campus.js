/**
 * pages/campus.js — 财大周边美食地图页面逻辑
 *
 * 使用新的模块化架构重写，缩至约 280 行。
 * 依赖：core/*, components/*
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
    shops: [],
    filteredShops: [],
    activeCampus: 'all',
    activeCategory: '全部',
    searchQuery: '',
    sortBy: 'distance',
    activeTab: 'list',
    mapController: null,
  };

  const SORT_LABELS = {
    'distance': '按距离排序',
    'price-low': '价格从低到高',
    'price-high': '价格从高到低',
    'rating': '按评分排序',
  };

  const dom = {};

  function cacheDom() {
    dom.header = document.getElementById('header');
    dom.content = document.getElementById('content');
    dom.shopList = document.getElementById('shop-list');
    dom.resultTitle = document.getElementById('result-title');
    dom.sortLabel = document.getElementById('sort-label');
    dom.tabBar = document.getElementById('tab-bar');
    dom.campusToggle = document.getElementById('campus-toggle');
    dom.categoryChips = document.getElementById('category-chips');
    dom.sortBtn = document.getElementById('sort-btn');
    dom.sortDropdown = document.getElementById('sort-dropdown');
    dom.sortMenu = document.getElementById('sort-menu');
    dom.searchContainer = document.getElementById('search-container');
    dom.searchBtn = document.getElementById('search-btn');
    dom.searchInput = document.getElementById('search-input');
    dom.searchClear = document.getElementById('search-clear');
    dom.socialBtn = document.getElementById('social-btn');
    dom.shareBtn = document.getElementById('share-btn');
    dom.mapView = document.getElementById('map-view');
    dom.mapBackBtn = document.getElementById('map-back-btn');
    dom.mapCanvas = document.getElementById('amap-canvas');
    dom.mapPlaceholder = document.getElementById('map-placeholder');
  }

  // === 初始化 ===
  function init() {
    cacheDom();
    const data = window.__CAMPUS_DATA__;
    state.shops = (data && data.shops) || [];

    createSplash('江城 · 财大美食地图', '师兄师姐带你吃遍财大周边');

    // 延迟弹出广告（等待 splash 动画完成 + 再等 1.5s）
    setTimeout(() => showAdPopup('campus'), 1200);

    renderCategoryChips();
    renderTabBar();
    bindEvents();
    filterAndRender();
  }

  // === 分类筛选 ===
  function renderCategoryChips() {
    createFilterChips(dom.categoryChips,
      ['全部', '南湖推荐', '烧烤', '五谷杂粮', '早餐'],
      state.activeCategory,
      (cat) => {
        state.activeCategory = cat;
        if (window.__analytics) window.__analytics.trackFilter('category', cat);
        renderCategoryChips();
        filterAndRender();
        if (state.mapController && state.mapController.loaded) {
          state.mapController.show(() => state.filteredShops, markerContent, infoContent);
        }
      }
    );
  }

  // === 筛选 + 排序 ===
  function filterShops() {
    let result = [...state.shops];

    if (state.activeCampus === 'shouyi') {
      result = result.filter(s => s.distanceFromShouyiBoundary_km !== null && s.distanceFromShouyiBoundary_km <= 1);
    } else if (state.activeCampus === 'nanhu') {
      result = result.filter(s => s.distanceFromNanhuBoundary_km !== null && s.distanceFromNanhuBoundary_km <= 1);
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
        (s.reason || '').toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      switch (state.sortBy) {
        case 'distance': return getNearestDistance(a) - getNearestDistance(b);
        case 'price-low': return (parseAvgPrice(a.avgPrice) || 9999) - (parseAvgPrice(b.avgPrice) || 9999);
        case 'price-high': return (parseAvgPrice(b.avgPrice) || 0) - (parseAvgPrice(a.avgPrice) || 0);
        case 'rating': return getRatingScore(b.rating) - getRatingScore(a.rating);
        default: return 0;
      }
    });

    state.filteredShops = result;
    return result;
  }

  function getNearestDistance(shop) {
    if (state.activeCampus === 'shouyi') return shop.distanceToShouyi_km || 999;
    if (state.activeCampus === 'nanhu') return shop.distanceToNanhu_km || 999;
    return Math.min(shop.distanceToShouyi_km || 999, shop.distanceToNanhu_km || 999);
  }

  function getRatingScore(rating) {
    if (rating === '必吃') return 3;
    if (rating === '推荐') return 2;
    const num = parseFloat(rating);
    return isNaN(num) ? 0 : (num / 5 * 3);
  }

  function renderShopList() {
    const shops = filterShops();
    fadeListOut(dom.shopList);
    dom.resultTitle.textContent = `附近美食 · ${shops.length}家`;
    dom.sortLabel.textContent = SORT_LABELS[state.sortBy] || '按距离排序';

    if (shops.length === 0) {
      showEmpty(dom.shopList, '没有找到符合条件的美食\n试试换个筛选条件？');
      fadeListIn(dom.shopList);
      return;
    }

    dom.shopList.innerHTML = '';
    shops.forEach((shop, i) => {
      const card = createShopCard(shop, (s) => showDetail(s));
      card.style.animationDelay = `${Math.min(i * 30, 300)}ms`;
      dom.shopList.appendChild(card);
    });
    fadeListIn(dom.shopList);
  }

  function filterAndRender() {
    filterShops();
    renderShopList();
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
    return `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${color === '#B9FF66' ? '#1A1A23' : '#fff'}">${emoji}</div>`;
  }

  function infoContent(shop) {
    const navUrl = `https://uri.amap.com/navigation?to=${shop.lng},${shop.lat},${encodeURIComponent(shop.name)}&mode=walk&coordinate=gaode&callnative=1`;
    return `
      <div class="amap-info-card">
        <div class="amap-info-name">${shop.name}</div>
        <div class="amap-info-meta">
          ${shop.rating ? `<span style="color:${getRatingColor(shop.rating)};font-weight:600">${shop.rating}</span> · ` : ''}
          ¥${shop.avgPrice || '?'}/人
        </div>
        ${shop.signatureDishes ? `<div class="amap-info-dishes">招牌：${shop.signatureDishes}</div>` : ''}
        <div class="amap-info-nav" onclick="window.open('${navUrl}','_blank')">导航到这里 →</div>
      </div>`;
  }

  function showMap() {
    dom.mapView.classList.add('show');
    document.body.classList.add('no-scroll');

    if (!state.mapController) {
      const campuses = (window.__CAMPUS_DATA__ && window.__CAMPUS_DATA__.campuses) || {};
      state.mapController = new MapController('amap-canvas', {
        center: [114.349, 30.506],
        zoom: 14,
        campusMarkers: Object.values(campuses).map(c => ({
          pos: [c.center.lng, c.center.lat],
          name: c.name.replace('中南财经政法大学', ''),
        })),
      });
    }

    state.mapController.show(() => state.filteredShops, markerContent, infoContent, { size: 24 });
  }

  // === Tab 切换 ===
  function renderTabBar() {
    dom.tabBar.innerHTML = '';
    const bar = createTabBar(state.activeTab, 'lime');
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
      '<div class="section-header">' +
        '<span class="section-title" id="result-title">附近美食 · 0家</span>' +
        '<span class="section-action" id="sort-label">按距离排序</span>' +
      '</div>' +
      '<div id="shop-list"></div>';
    dom.resultTitle = document.getElementById('result-title');
    dom.sortLabel = document.getElementById('sort-label');
    dom.shopList = document.getElementById('shop-list');
    renderShopList();
  }

  function showFavoritesView() {
    const favs = Favorites.get();
    const favShops = state.shops.filter(s => favs.includes(s.name));
    dom.content.innerHTML = '';
    renderFavoriteView(dom.content, favShops, (s) => showDetail(s));
  }

  function showProfileView() {
    const favCount = Favorites.get().length;
    dom.content.innerHTML = '';
    renderProfileView(dom.content, {
      avatar: '😋',
      name: '美食探索者',
      desc: `已收藏 ${favCount} 家美食`,
      stats: [
        { icon: '🏪', value: state.shops.length, label: '总店铺' },
        { icon: '❤️', value: favCount, label: '已收藏' },
        { icon: '🗺️', value: '2', label: '校区' },
      ],
      menuItems: [
        { icon: '🎯', label: '我的收藏', action: () => switchTab('favorite') },
        { icon: '📍', label: '定位到当前位置', action: () => locateToCurrent() },
        { icon: '💬', label: '加入吃货群', action: () => showSocialModal() },
        { icon: '🔄', label: '切换到全城版', action: () => window.location.href = 'wuhan.html' },
        { icon: 'ℹ️', label: '关于', action: () => showAboutModal() },
      ],
    });
  }

  function locateToCurrent() {
    if (state.mapController) {
      state.mapController.locate();
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => showToast('地图功能需先切换到地图视图'),
        () => showToast('无法获取当前位置')
      );
    }
  }

  function showAboutModal() {
    const overlay = el('div', { className: 'modal-overlay' });
    const content = el('div', { className: 'modal-content', style: { textAlign: 'center' } });
    content.appendChild(el('div', { className: 'modal-handle' }));
    content.appendChild(el('div', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '8px' } }, '江城 · 味觉地图'));
    content.appendChild(el('div', { style: { fontSize: '13px', color: '#999', marginBottom: '20px' } }, 'Version 1.0.0'));
    content.appendChild(el('div', {
      style: { fontSize: '14px', color: '#666', lineHeight: '1.8', textAlign: 'left', marginBottom: '16px' },
    }, [
      '江城·味觉地图是一个武汉美食发现应用，帮助你探索财大周边和武汉全城的好味道。\n\n',
      '数据来源：实地探访 + 社群推荐\n',
      '覆盖范围：财大两校区 1km + 武汉全城 540+ 家店\n',
      '坐标系：GCJ-02（高德坐标系）',
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

  // === 事件绑定 ===
  function bindEvents() {
    dom.campusToggle.querySelectorAll('.toggle-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        dom.campusToggle.querySelectorAll('.toggle-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeCampus = tab.dataset.campus;
        if (window.__analytics) window.__analytics.trackFilter('campus', tab.dataset.campus);
        filterAndRender();
        if (state.mapController && state.mapController.loaded) {
          state.mapController.show(() => state.filteredShops, markerContent, infoContent);
        }
      });
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
      if (dom.sortDropdown && !dom.sortDropdown.contains(e.target) && e.target !== dom.sortBtn) {
        dom.sortDropdown.classList.add('hidden');
        dom.sortMenu.classList.remove('show');
      }
    });

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

  // === 启动 ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
