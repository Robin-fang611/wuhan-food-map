/**
 * 财大周边美食地图 - 页面逻辑
 */

(function () {
  'use strict';

  // === 状态管理 ===
  const state = {
    data: null,           // campus_data
    shops: [],             // 当前显示的店铺
    filteredShops: [],     // 筛选后的店铺
    activeCampus: 'all',   // all / shouyi / nanhu
    activeCategory: '全部',
    searchQuery: '',
    sortBy: 'distance',    // distance / price-low / price-high / rating
    activeTab: 'list',     // list / map / favorite / profile
    amap: null,            // 高德地图实例
    markers: [],           // 当前标记
    cluster: null,         // 聚合器
    mapLoaded: false,
  };

  // === DOM 引用 ===
  const dom = {};

  function cacheDom() {
    dom.app = document.getElementById('app');
    dom.header = document.getElementById('header');
    dom.content = document.getElementById('content');
    dom.shopList = document.getElementById('shop-list');
    dom.resultTitle = document.getElementById('result-title');
    dom.sortLabel = document.getElementById('sort-label');
    dom.tabBar = document.getElementById('tab-bar');
    dom.campusToggle = document.getElementById('campus-toggle');
    dom.categoryChips = document.getElementById('category-chips');
    dom.searchBtn = document.getElementById('search-btn');
    dom.searchContainer = document.getElementById('search-container');
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
  }

  // === 初始化 ===
  function init() {
    cacheDom();

    // 加载数据
    state.data = window.__CAMPUS_DATA__;
    state.shops = state.data.shops;

    // 创建启动屏
    createSplash();

    // 渲染分类
    renderCategoryChips();

    // 渲染底部导航
    renderTabBar();

    // 绑定事件
    bindEvents();

    // 首次渲染列表
    filterAndRender();

    // 隐藏启动屏
    setTimeout(() => {
      const splash = document.getElementById('splash');
      if (splash) splash.classList.add('hide');
      setTimeout(() => splash && splash.remove(), 500);
    }, 800);
  }

  // === 启动屏 ===
  function createSplash() {
    const splash = el('div', { className: 'splash-screen', id: 'splash' }, [
      el('div', { className: 'splash-logo' }, '味'),
      el('div', { className: 'splash-title' }, '鲜城 · 财大美食地图'),
      el('div', { className: 'splash-subtitle' }, '师兄师姐带你吃遍财大周边'),
      el('div', { className: 'loading-dots', style: { marginTop: '8px' } }, [
        el('span'), el('span'), el('span'),
      ]),
    ]);
    document.body.appendChild(splash);
  }

  // === 分类筛选 ===
  function renderCategoryChips() {
    const categories = ['全部', '南湖推荐', '烧烤', '五谷杂粮', '早餐'];
    dom.categoryChips.innerHTML = '';

    categories.forEach(cat => {
      const isActive = state.activeCategory === cat;
      const chip = el('div', {
        className: `chip ${isActive ? 'active' : ''}`,
        dataset: { category: cat },
      });

      if (cat !== '全部') {
        const color = getCategoryColor(cat);
        chip.appendChild(el('span', {
          className: 'chip-dot',
          style: { background: color },
        }));
      }
      chip.appendChild(document.createTextNode(cat));
      chip.addEventListener('click', () => {
        state.activeCategory = cat;
        if (window.__analytics) window.__analytics.trackFilter('category', cat);
        renderCategoryChips();
        filterAndRender();
      });
      dom.categoryChips.appendChild(chip);
    });
  }

  // === 筛选 + 排序 ===
  function filterShops() {
    let result = [...state.shops];

    // 校区筛选
    if (state.activeCampus === 'shouyi') {
      result = result.filter(s =>
        s.distanceFromShouyiBoundary_km !== null &&
        s.distanceFromShouyiBoundary_km <= 1
      );
    } else if (state.activeCampus === 'nanhu') {
      result = result.filter(s =>
        s.distanceFromNanhuBoundary_km !== null &&
        s.distanceFromNanhuBoundary_km <= 1
      );
    }

    // 分类筛选
    if (state.activeCategory !== '全部') {
      result = result.filter(s => s.category === state.activeCategory);
    }

    // 搜索筛选
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.signatureDishes && s.signatureDishes.toLowerCase().includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q)) ||
        (s.reason && s.reason.toLowerCase().includes(q))
      );
    }

    // 排序
    result.sort((a, b) => {
      switch (state.sortBy) {
        case 'distance':
          return getNearestDistance(a) - getNearestDistance(b);
        case 'price-low':
          return (parseAvgPrice(a.avgPrice) || 9999) - (parseAvgPrice(b.avgPrice) || 9999);
        case 'price-high':
          return (parseAvgPrice(b.avgPrice) || 0) - (parseAvgPrice(a.avgPrice) || 0);
        case 'rating':
          return getRatingScore(b.rating) - getRatingScore(a.rating);
        default:
          return 0;
      }
    });

    state.filteredShops = result;
    return result;
  }

  function getNearestDistance(shop) {
    if (state.activeCampus === 'shouyi') {
      return shop.distanceToShouyi_km || 999;
    }
    if (state.activeCampus === 'nanhu') {
      return shop.distanceToNanhu_km || 999;
    }
    // 全部取最近
    const d1 = shop.distanceToShouyi_km || 999;
    const d2 = shop.distanceToNanhu_km || 999;
    return Math.min(d1, d2);
  }

  function getRatingScore(rating) {
    if (rating === '必吃') return 3;
    if (rating === '推荐') return 2;
    const num = parseFloat(rating);
    return isNaN(num) ? 0 : num / 5 * 3;
  }

  // === 渲染列表 ===
  function filterAndRender() {
    const shops = filterShops();
    dom.resultTitle.textContent = `附近美食 · ${shops.length}家`;

    const sortLabels = {
      'distance': '按距离排序',
      'price-low': '价格从低到高',
      'price-high': '价格从高到低',
      'rating': '按评分排序',
    };
    dom.sortLabel.textContent = sortLabels[state.sortBy];

    if (shops.length === 0) {
      showEmpty(dom.shopList, '没有找到符合条件的美食\n试试换个筛选条件？');
      return;
    }

    dom.shopList.innerHTML = '';
    shops.forEach((shop, i) => {
      const card = createShopCard(shop, (s) => showDetail(s));
      card.style.animationDelay = `${Math.min(i * 30, 300)}ms`;
      dom.shopList.appendChild(card);
    });
  }

  // === 详情弹窗 ===
  function showDetail(shop) {
    if (window.__analytics) window.__analytics.trackShopClick(shop);
    const modal = createDetailModal(shop, null, (s) => {
      if (window.__analytics) window.__analytics.trackNavigate(s);
      openNavigation(s.lng, s.lat, s.name);
    });
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
  }

  // === 搜索 ===
  function toggleSearch() {
    const isHidden = dom.searchContainer.classList.contains('hidden');
    if (isHidden) {
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
  }

  const onSearchInput = debounce(() => {
    state.searchQuery = dom.searchInput.value.trim();
    dom.searchClear.style.display = state.searchQuery ? 'flex' : 'none';
    if (state.searchQuery && window.__analytics) window.__analytics.trackSearch(state.searchQuery);
    filterAndRender();
  }, 400);

  // === 排序菜单 ===
  function toggleSortMenu() {
    // 定位排序菜单
    const rect = dom.sortBtn.getBoundingClientRect();
    dom.sortDropdown.style.left = (rect.right - 150) + 'px';
    dom.sortDropdown.style.top = (rect.bottom + 4) + 'px';
    dom.sortDropdown.classList.toggle('hidden');
    dom.sortMenu.classList.toggle('show');
  }

  function closeSortMenu() {
    dom.sortDropdown.classList.add('hidden');
    dom.sortMenu.classList.remove('show');
  }

  // === 底部导航 ===
  function renderTabBar() {
    dom.tabBar.innerHTML = '';
    const bar = createTabBar(state.activeTab, 'lime');
    dom.tabBar.appendChild(bar);

    bar.querySelectorAll('.tab-item').forEach(item => {
      item.addEventListener('click', () => {
        const tabId = item.dataset.tab;
        switchTab(tabId);
      });
    });
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    renderTabBar();

    switch (tabId) {
      case 'list':
        dom.mapView.classList.remove('show');
        renderListView();
        break;
      case 'map':
        showMap();
        break;
      case 'favorite':
        dom.mapView.classList.remove('show');
        renderFavoriteView();
        break;
      case 'profile':
        dom.mapView.classList.remove('show');
        renderProfileView();
        break;
    }
  }

  function renderListView() {
    // 恢复列表视图
    dom.content.innerHTML = '';
    const header = el('div', { className: 'section-header' }, [
      el('span', { className: 'section-title', id: 'result-title' }, `附近美食 · ${state.filteredShops.length}家`),
      el('span', { className: 'section-action', id: 'sort-label' }, getSortLabel()),
    ]);
    dom.content.appendChild(header);

    const listContainer = el('div', { id: 'shop-list' });
    dom.content.appendChild(listContainer);

    dom.shopList = listContainer;
    dom.resultTitle = header.querySelector('#result-title');
    dom.sortLabel = header.querySelector('#sort-label');

    filterAndRender();
  }

  function renderFavoriteView() {
    const favs = Favorites.get();
    const favShops = state.shops.filter(s => favs.includes(s.name));

    dom.content.innerHTML = '';
    dom.content.appendChild(el('div', { className: 'section-header' }, [
      el('span', { className: 'section-title' }, `我的收藏 · ${favShops.length}家`),
    ]));

    const listContainer = el('div', { className: 'favorite-list' });

    if (favShops.length === 0) {
      showEmpty(listContainer, '还没有收藏的美食\n点击列表中的店铺卡片即可收藏');
    } else {
      favShops.forEach((shop, i) => {
        const card = createShopCard(shop, (s) => showDetail(s));
        card.style.animationDelay = `${i * 30}ms`;
        // 添加收藏标记
        const indicator = el('div', { className: 'fav-indicator' });
        indicator.innerHTML = Icons.heartFill;
        card.style.position = 'relative';
        card.appendChild(indicator);
        listContainer.appendChild(card);
      });
    }

    dom.content.appendChild(listContainer);
  }

  function renderProfileView() {
    const favCount = Favorites.get().length;

    dom.content.innerHTML = '';
    dom.content.appendChild(el('div', { className: 'profile-section' }));

    const section = dom.content.querySelector('.profile-section');

    // 用户信息
    section.appendChild(el('div', { className: 'profile-header' }, [
      el('div', { className: 'profile-avatar' }, '😋'),
      el('div', { className: 'profile-info' }, [
        el('div', { className: 'profile-name' }, '美食探索者'),
        el('div', { className: 'profile-desc' }, `已收藏 ${favCount} 家美食`),
      ]),
    ]));

    // 统计卡片
    const stats = el('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } });
    stats.appendChild(createStatCard('🏪', state.shops.length, '总店铺'));
    stats.appendChild(createStatCard('❤️', favCount, '已收藏'));
    stats.appendChild(createStatCard('🗺️', '2', '校区'));
    section.appendChild(stats);

    // 菜单项
    const menuItems = [
      { icon: '🎯', label: '我的收藏', action: () => switchTab('favorite') },
      { icon: '📍', label: '定位到当前位置', action: () => locateToCurrent() },
      { icon: '💬', label: '加入吃货群', action: () => showSocialModal(window.__SOCIAL_CONFIG__.campus) },
      { icon: '🔄', label: '切换到全城版', action: () => window.location.href = 'wuhan.html' },
      { icon: 'ℹ️', label: '关于', action: () => showAbout() },
    ];

    menuItems.forEach(item => {
      const menuItem = el('div', { className: 'profile-menu-item' });
      menuItem.appendChild(el('div', { className: 'profile-menu-icon', style: { fontSize: '16px' } }, item.icon));
      menuItem.appendChild(el('div', { className: 'profile-menu-label' }, item.label));
      menuItem.appendChild(el('div', { className: 'profile-menu-arrow' }));
      menuItem.querySelector('.profile-menu-arrow').innerHTML = Icons.arrowRight;
      menuItem.addEventListener('click', item.action);
      section.appendChild(menuItem);
    });
  }

  function createStatCard(icon, value, label) {
    return el('div', {
      style: {
        flex: '1',
        background: 'var(--card-bg)',
        borderRadius: '12px',
        padding: '12px',
        textAlign: 'center',
        boxShadow: 'var(--shadow-sm)',
      },
    }, [
      el('div', { style: { fontSize: '20px', marginBottom: '4px' } }, icon),
      el('div', { style: { fontSize: '18px', fontWeight: '700' } }, String(value)),
      el('div', { style: { fontSize: '11px', color: 'var(--text-tertiary)' } }, label),
    ]);
  }

  function showAbout() {
    const overlay = el('div', { className: 'modal-overlay' });
    const content = el('div', { className: 'modal-content', style: { textAlign: 'center' } });
    content.appendChild(el('div', { className: 'modal-handle' }));
    content.appendChild(el('div', {
      style: { fontSize: '20px', fontWeight: '700', marginBottom: '8px' },
    }, '鲜城 · 味觉地图'));
    content.appendChild(el('div', {
      style: { fontSize: '13px', color: '#999', marginBottom: '20px' },
    }, 'Version 1.0.0'));
    content.appendChild(el('div', {
      style: { fontSize: '14px', color: '#666', lineHeight: '1.8', textAlign: 'left', marginBottom: '16px' },
    }, [
      '鲜城·味觉地图是一个武汉美食发现应用，帮助你探索财大周边和武汉全城的好味道。\n\n',
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
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeBtn.click();
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  function getSortLabel() {
    const labels = {
      'distance': '按距离排序',
      'price-low': '价格从低到高',
      'price-high': '价格从高到低',
      'rating': '按评分排序',
    };
    return labels[state.sortBy] || '按距离排序';
  }

  // === 地图视图 ===
  function showMap() {
    dom.mapView.classList.add('show');
    document.body.classList.add('no-scroll');

    if (!state.mapLoaded) {
      initMap();
    } else if (state.amap) {
      updateMapMarkers();
    }
  }

  function initMap() {
    const config = window.__AMAP_CONFIG__;

    // 检查 Key 是否配置
    if (!config.key || config.key === 'YOUR_AMAP_JS_API_KEY') {
      showMapPlaceholder();
      return;
    }

    // 设置安全密钥
    if (config.securityJsCode) {
      window._AMapSecurityConfig = { securityJsCode: config.securityJsCode };
    }

    AMapLoader.load({
      key: config.key,
      version: config.version,
      plugins: config.plugins,
    }).then((AMap) => {
      state.amap = AMap;
      const map = new AMap.Map('amap-canvas', {
        zoom: 14,
        center: [114.349, 30.506], // 两校区中心
        mapStyle: 'amap://styles/whitesmoke',
        features: ['bg', 'road', 'building'],
      });

      state.map = map;
      state.mapLoaded = true;

      // 隐藏占位
      dom.mapPlaceholder.style.display = 'none';

      // 添加校区标记
      addCampusMarkers();

      // 添加店铺标记
      updateMapMarkers();

      // 适配视野
      fitMapView();
    }).catch((err) => {
      console.error('Amap load error:', err);
      showMapPlaceholder();
    });
  }

  function addCampusMarkers() {
    const campuses = state.data.campuses;

    Object.entries(campuses).forEach(([key, campus]) => {
      const marker = new state.amap.Marker({
        position: [campus.center.lng, campus.center.lat],
        content: `<div style="
          background: #1A1A23;
          color: white;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          border: 2px solid #B9FF66;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        ">${campus.name.replace('中南财经政法大学', '')}</div>`,
        offset: new state.amap.Pixel(-30, -12),
      });
      marker.setMap(state.map);
    });
  }

  function updateMapMarkers() {
    if (!state.map || !state.amap) return;

    // 清除旧标记
    if (state.markers.length > 0) {
      state.markers.forEach(m => m.setMap(null));
      state.markers = [];
    }
    if (state.cluster) {
      state.cluster.setMarkers([]);
    }

    const shops = filterShops();

    shops.forEach(shop => {
      const color = getCategoryColor(shop.category);

      const marker = new state.amap.Marker({
        position: [shop.lng, shop.lat],
        content: `<div style="
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${color};
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
          color: ${color === '#B9FF66' ? '#1A1A23' : '#fff'};
        ">${getCategoryEmoji(shop.category)}</div>`,
        offset: new state.amap.Pixel(-12, -12),
      });

      // 信息窗口
      const infoContent = `
        <div class="amap-info-card">
          <div class="amap-info-name">${shop.name}</div>
          <div class="amap-info-meta">
            ${shop.rating ? '<span style="color:' + getRatingColor(shop.rating) + ';font-weight:600">' + shop.rating + '</span> · ' : ''}
            ${formatPrice(shop.avgPrice)}
          </div>
          ${shop.signatureDishes ? '<div class="amap-info-dishes">招牌：' + shop.signatureDishes + '</div>' : ''}
          <div class="amap-info-nav" onclick="window.__navToShop__(${shop.lng},${shop.lat},'${shop.name.replace(/'/g, "\\'")}')">导航到这里 →</div>
        </div>
      `;
      const infoWindow = new state.amap.InfoWindow({
        content: infoContent,
        offset: new state.amap.Pixel(0, -20),
      });

      marker.on('click', () => {
        infoWindow.open(state.map, marker.getPosition());
      });

      marker.setMap(state.map);
      state.markers.push(marker);
    });

    // 使用聚合
    if (state.amap.MarkerClusterer) {
      state.cluster = new state.amap.MarkerClusterer(state.map, state.markers, {
        gridSize: 60,
        maxZoom: 18,
        renderMarker: (ctx) => {
          ctx.marker.setContent(ctx.marker.getContent());
        },
      });
    }

    // 更新底部信息条
    updateMapInfoBar(shops.length);
  }

  function updateMapInfoBar(count) {
    let infoBar = dom.mapView.querySelector('.map-info-bar');
    if (!infoBar) {
      infoBar = el('div', { className: 'map-info-bar' });
      dom.mapView.querySelector('.map-canvas-wrapper').appendChild(infoBar);
    }
    infoBar.innerHTML = '';
    infoBar.appendChild(el('div', { className: 'map-info-count' }, `显示 ${count} 家美食`));
    const actionEl = el('div', { className: 'map-info-action' });
    actionEl.innerHTML = Icons.list + ' 切换列表';
    actionEl.addEventListener('click', () => switchTab('list'));
    infoBar.appendChild(actionEl);
  }

  function fitMapView() {
    if (!state.map || !state.amap) return;

    const shops = filterShops();
    if (shops.length === 0) return;

    const lngs = shops.map(s => s.lng);
    const lats = shops.map(s => s.lat);

    // 加入校区坐标
    const campuses = state.data.campuses;
    Object.values(campuses).forEach(c => {
      lngs.push(c.center.lng);
      lats.push(c.center.lat);
    });

    state.map.setFitView(state.markers, false, [60, 60, 60, 60]);
  }

  function showMapPlaceholder() {
    dom.mapPlaceholder.innerHTML = '';
    dom.mapPlaceholder.appendChild(el('div', { className: 'map-placeholder-icon' }, '🗺️'));
    dom.mapPlaceholder.appendChild(el('div', { className: 'map-placeholder-title' }, '地图功能需要配置 API Key'));
    dom.mapPlaceholder.appendChild(el('div', { className: 'map-placeholder-desc' },
      '在 js/config.js 中填写高德 JS API Key 即可启用地图功能。\n列表浏览、筛选、搜索功能不受影响。'
    ));
    dom.mapPlaceholder.appendChild(el('div', { className: 'map-placeholder-hint' },
      `当前显示 ${state.filteredShops.length} 家美食`
    ));

    // 在占位区域显示简单的位置分布图
    const miniMap = el('div', {
      style: {
        position: 'absolute',
        inset: '0',
        background: 'linear-gradient(135deg, rgba(185,255,102,0.1), rgba(212,165,116,0.1))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
    });

    // 简单的 SVG 分布图
    const shops = filterShops();
    const campuses = state.data.campuses;
    const allLngs = [...shops.map(s => s.lng), campuses.shouyi.center.lng, campuses.nanhu.center.lng];
    const allLats = [...shops.map(s => s.lat), campuses.shouyi.center.lat, campuses.nanhu.center.lat];
    const minLng = Math.min(...allLngs);
    const maxLng = Math.max(...allLngs);
    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);
    const padding = 0.01;
    const range = Math.max(maxLng - minLng + padding * 2, maxLat - minLat + padding * 2);

    const w = 300, h = 400;
    const scale = Math.min(w, h) / range * 0.8;

    let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:relative;">`;

    // 校区圆圈
    Object.entries(campuses).forEach(([key, campus]) => {
      const cx = ((campus.center.lng - minLng + padding) * scale) + (w - range * scale) / 2;
      const cy = h - ((campus.center.lat - minLat + padding) * scale) - (h - range * scale) / 2;
      const r = campus.radius_km * scale * 0.8;
      svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(185,255,102,0.15)" stroke="#B9FF66" stroke-width="1.5" stroke-dasharray="4,3"/>`;
      svg += `<text x="${cx}" y="${cy + r + 14}" text-anchor="middle" font-size="10" fill="#666" font-weight="600">${campus.name.replace('中南财经政法大学', '')}</text>`;
    });

    // 店铺点
    shops.forEach(shop => {
      const cx = ((shop.lng - minLng + padding) * scale) + (w - range * scale) / 2;
      const cy = h - ((shop.lat - minLat + padding) * scale) - (h - range * scale) / 2;
      const color = getCategoryColor(shop.category);
      svg += `<circle cx="${cx}" cy="${cy}" r="3" fill="${color}" stroke="white" stroke-width="1"/>`;
    });

    svg += '</svg>';
    miniMap.innerHTML = svg;

    // 替换占位内容
    dom.mapPlaceholder.style.display = 'none';
    dom.mapCanvas.appendChild(miniMap);
  }

  function locateToCurrent() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (state.map) {
            const lng = pos.coords.longitude;
            const lat = pos.coords.latitude;
            state.map.setCenter([lng, lat]);
            state.map.setZoom(15);
          } else {
            alert('地图功能需要配置 API Key');
          }
        },
        () => {
          alert('无法获取当前位置');
        }
      );
    }
  }

  // === 事件绑定 ===
  function bindEvents() {
    // 校区切换
    dom.campusToggle.querySelectorAll('.toggle-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        dom.campusToggle.querySelectorAll('.toggle-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeCampus = tab.dataset.campus;
        if (window.__analytics) window.__analytics.trackFilter('campus', tab.dataset.campus);
        filterAndRender();
        if (state.mapLoaded) updateMapMarkers();
      });
    });

    // 搜索
    dom.searchBtn.addEventListener('click', toggleSearch);
    dom.searchInput.addEventListener('input', onSearchInput);
    dom.searchClear.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.searchClear.style.display = 'none';
      state.searchQuery = '';
      filterAndRender();
    });

    // 排序
    dom.sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSortMenu();
    });
    dom.sortMenu.querySelectorAll('.sort-item').forEach(item => {
      item.addEventListener('click', () => {
        dom.sortMenu.querySelectorAll('.sort-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        state.sortBy = item.dataset.sort;
        closeSortMenu();
        filterAndRender();
      });
    });
    document.addEventListener('click', (e) => {
      if (!dom.sortDropdown.contains(e.target) && e.target !== dom.sortBtn) {
        closeSortMenu();
      }
    });

    // 地图返回
    dom.mapBackBtn.addEventListener('click', () => {
      dom.mapView.classList.remove('show');
      document.body.classList.remove('no-scroll');
      switchTab('list');
    });

    // 分享按钮
    dom.shareBtn.addEventListener('click', handleShare);

    // 社群按钮
    dom.socialBtn.addEventListener('click', () => {
      if (window.__analytics) window.__analytics.trackSocial();
      showSocialModal(window.__SOCIAL_CONFIG__.campus);
    });

    // 滚动监听
    dom.content.addEventListener('scroll', () => {
      if (dom.content.scrollTop > 10) {
        dom.header.classList.add('scrolled');
      } else {
        dom.header.classList.remove('scrolled');
      }
    });

    // 导航函数（供地图信息窗口调用）
    window.__navToShop__ = (lng, lat, name) => {
      openNavigation(lng, lat, name);
    };
  }

  // === 启动 ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
