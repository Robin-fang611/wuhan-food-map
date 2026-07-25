/**
 * pages/play.js — 周边游玩页面逻辑
 */

import { el, Icons } from '../core/dom.js';
import { debounce } from '../core/utils.js';
import { showEmpty } from '../core/store.js';
import { createSplash, showToast, showSocialModal, showAdPopup, handleShare } from '../core/ui.js';
import { MapController } from '../core/map.js';
import { createTabBar } from '../components/TabBar.js';
import { createPlaceCard, createPlaceDetail, PLAY_CATEGORIES } from '../components/PlaceCard.js';
import { createFilterChips } from '../components/FilterBar.js';
import { renderProfileView } from '../components/ProfileView.js';

(function () {
  'use strict';

  const state = {
    data: [],
    filtered: [],
    activeCampus: 'all',
    activeCategory: '全部',
    searchQuery: '',
    activeTab: 'list',
    mapController: null,
  };

  const CATEGORIES = ['全部', '景点名胜', '街道区巷', '书店打卡', '寺庙道观', '纪念馆', '博物馆', '体验打卡', '附近美食'];

  const dom = {};

  function cacheDom() {
    dom.header = document.getElementById('header');
    dom.content = document.getElementById('content');
    dom.placeList = document.getElementById('place-list');
    dom.resultTitle = document.getElementById('result-title');
    dom.countLabel = document.getElementById('count-label');
    dom.tabBar = document.getElementById('tab-bar');
    dom.campusToggle = document.getElementById('campus-toggle');
    dom.categoryChips = document.getElementById('category-chips');
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

  function init() {
    cacheDom();
    state.data = window.__PLAY_DATA__ || [];

    createSplash('江城 · 周边游玩', '探索财大周边好去处');

    setTimeout(() => showAdPopup('play'), 1200);

    renderCategoryChips();
    renderTabBar();
    bindEvents();
    filterAndRender();
  }

  function renderCategoryChips() {
    createFilterChips(dom.categoryChips, CATEGORIES, state.activeCategory, (cat) => {
      state.activeCategory = cat;
      renderCategoryChips();
      filterAndRender();
      if (state.mapController && state.mapController.loaded) {
        state.mapController.show(() => state.filtered, markerContent, infoContent);
      }
    });
  }

  function filterPlaces() {
    let result = state.data.slice();

    if (state.activeCampus !== 'all') {
      result = result.filter(p => p.campus === state.activeCampus);
    }
    if (state.activeCategory !== '全部') {
      result = result.filter(p => p.category === state.activeCategory);
    }
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      result = result.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q)
      );
    }

    state.filtered = result;
    return result;
  }

  function filterAndRender() {
    const places = filterPlaces();
    dom.resultTitle.textContent = '周边游玩 · ' + places.length + '处';
    dom.countLabel.textContent = state.activeCampus === 'all' ? '首义 + 南湖' : state.activeCampus + '校区';

    if (places.length === 0) {
      showEmpty(dom.placeList, '没有找到符合条件的地点\n试试换个筛选条件？');
      return;
    }

    dom.placeList.innerHTML = '';
    places.forEach((place, i) => {
      const card = createPlaceCard(place, (p) => showDetail(p));
      card.style.animationDelay = Math.min(i * 30, 300) + 'ms';
      dom.placeList.appendChild(card);
    });
  }

  function showDetail(place) {
    createPlaceDetail(place);
  }

  // === 地图 ===
  function markerContent(place) {
    const color = (PLAY_CATEGORIES[place.category] && PLAY_CATEGORIES[place.category].color) || '#999';
    const emoji = (PLAY_CATEGORIES[place.category] && PLAY_CATEGORIES[place.category].emoji) || '📍';
    return `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:14px;">${emoji}</div>`;
  }

  function infoContent(place) {
    const color = (PLAY_CATEGORIES[place.category] && PLAY_CATEGORIES[place.category].color) || '#999';
    const navUrl = `https://uri.amap.com/navigation?to=${place.lng},${place.lat},${encodeURIComponent(place.name)}&mode=walk&coordinate=gaode&callnative=1`;
    return `
      <div class="amap-info-card">
        <div class="amap-info-name">${place.name}</div>
        <div class="amap-info-meta">
          <span style="background:${color};color:#fff;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;">${place.category}</span>
          · ${place.campus}校区
        </div>
        <div class="amap-info-dishes" style="font-size:12px;color:#666;margin-top:4px;overflow:hidden;">${(place.description || '').substring(0, 80)}...</div>
        <div class="amap-info-nav" onclick="window.open('${navUrl}','_blank')">导航到这里 →</div>
      </div>`;
  }

  function showMap() {
    dom.mapView.classList.add('show');
    document.body.classList.add('no-scroll');

    if (!state.mapController) {
      state.mapController = new MapController('amap-canvas', {
        center: [114.31, 30.55],
        zoom: 13,
        campusMarkers: [
          { pos: [114.313162, 30.537365], name: '首义校区', color: '#8B5CF6' },
          { pos: [114.385365, 30.474518], name: '南湖校区', color: '#8B5CF6' },
        ],
      });
    }

    state.mapController.show(() => state.filtered, markerContent, infoContent, { size: 28 });
  }

  // === Tab 切换 ===
  function renderTabBar() {
    dom.tabBar.innerHTML = '';
    const tabs = [
      { id: 'list', label: '列表', icon: Icons.list, activeIcon: Icons.list },
      { id: 'map', label: '地图', icon: Icons.mapOutline, activeIcon: Icons.map },
      { id: 'profile', label: '我的', icon: Icons.user, activeIcon: Icons.user },
    ];

    const bar = el('div', { className: 'tab-bar' });
    tabs.forEach(tab => {
      const isActive = tab.id === state.activeTab;
      const item = el('div', { className: `tab-item ${isActive ? 'active' : ''}`, dataset: { tab: tab.id } });
      item.innerHTML = (isActive && tab.activeIcon ? tab.activeIcon : tab.icon) + `<span style="margin-top:2px">${tab.label}</span>`;
      bar.appendChild(item);
    });
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
    } else if (tabId === 'profile') {
      showProfileView();
    }
  }

  function rebuildListView() {
    dom.content.innerHTML =
      '<div class="section-header">' +
        '<span class="section-title" id="result-title">周边游玩 · 0处</span>' +
        '<span class="section-action" id="count-label">全部</span>' +
      '</div>' +
      '<div id="place-list"></div>';
    dom.resultTitle = document.getElementById('result-title');
    dom.countLabel = document.getElementById('count-label');
    dom.placeList = document.getElementById('place-list');
    filterAndRender();
  }

  function showProfileView() {
    dom.content.innerHTML = '';
    const nanhuCount = state.data.filter(p => p.campus === '南湖').length;
    const shouyiCount = state.data.filter(p => p.campus === '首义').length;

    renderProfileView(dom.content, {
      avatar: '🧭',
      name: '游玩探索者',
      desc: '已浏览 ' + state.data.length + ' 处地点',
      stats: [
        { icon: '📍', value: state.data.length, label: '总地点' },
        { icon: '🏫', value: shouyiCount, label: '首义' },
        { icon: '🏫', value: nanhuCount, label: '南湖' },
      ],
      menuItems: [
        { icon: '🔄', label: '切换到财大美食', action: () => window.location.href = 'campus.html' },
        { icon: '🔄', label: '切换到全城美食', action: () => window.location.href = 'wuhan.html' },
        { icon: '💬', label: '加入游玩群', action: () => showSocialModal() },
        { icon: 'ℹ️', label: '关于', action: () => showAboutModal() },
      ],
    });
  }

  function showAboutModal() {
    const overlay = el('div', { className: 'modal-overlay' });
    const content = el('div', { className: 'modal-content', style: { textAlign: 'center' } });
    content.appendChild(el('div', { className: 'modal-handle' }));
    content.appendChild(el('div', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '8px' } }, '江城 · 周边游玩'));
    content.appendChild(el('div', { style: { fontSize: '13px', color: '#999', marginBottom: '20px' } }, 'Version 1.0.0'));
    content.appendChild(el('div', {
      style: { fontSize: '14px', color: '#666', lineHeight: '1.8', textAlign: 'left', marginBottom: '16px' },
    }, [
      'ZUEL周边吃喝玩乐指南，带你发现财大周边的好去处。\n\n',
      '数据来源：ZUEL周边吃喝玩乐 PDF（小红薯：537634449）\n',
      '覆盖范围：首义 + 南湖两校区周边景点、街道、书店、寺庙、纪念馆等\n',
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

  function bindEvents() {
    dom.campusToggle.querySelectorAll('.toggle-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        dom.campusToggle.querySelectorAll('.toggle-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeCampus = tab.dataset.campus;
        filterAndRender();
        if (state.mapController && state.mapController.loaded) {
          state.mapController.show(() => state.filtered, markerContent, infoContent);
        }
      });
    });

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
    dom.socialBtn.addEventListener('click', () => showSocialModal());

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
