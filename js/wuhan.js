/**
 * 武汉全城美食地图 - 页面逻辑
 */

(function () {
  'use strict';

  // === 状态管理 ===
  const state = {
    allShops: [],          // 全部 540 家店
    filteredShops: [],     // 筛选后
    displayedShops: [],    // 当前已渲染
    activeArea: '全部',
    activeCategory: '全部',
    searchQuery: '',
    sortBy: 'rating',
    activeTab: 'list',
    amap: null,
    map: null,
    markers: [],
    cluster: null,
    mapLoaded: false,
    pageSize: 20,
    currentPage: 0,
    isLoadingMore: false,
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
    dom.areaToggle = document.getElementById('area-toggle');
    dom.categoryChips = document.getElementById('category-chips');
    dom.categoryGrid = document.getElementById('category-grid');
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
    dom.loadMore = document.getElementById('load-more');
  }

  // === 初始化 ===
  function init() {
    cacheDom();

    state.allShops = window.__WUHAN_DATA__ || [];

    // 启动屏
    createSplash();

    // 渲染区域筛选
    renderAreaToggle();

    // 渲染分类网格
    renderCategoryGrid();

    // 渲染分类筛选 chips
    renderCategoryChips();

    // 渲染底部导航
    renderTabBar();

    // 绑定事件
    bindEvents();

    // 首次渲染
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
      el('div', { className: 'splash-title' }, '鲜城 · 全城美食地图'),
      el('div', { className: 'splash-subtitle' }, `带你吃遍武汉三镇 · ${state.allShops.length}家精选`),
      el('div', { className: 'loading-dots', style: { marginTop: '8px' } }, [
        el('span'), el('span'), el('span'),
      ]),
    ]);
    document.body.appendChild(splash);
  }

  // === 区域筛选 ===
  function renderAreaToggle() {
    const areas = ['全部', '武昌', '洪山', '江汉', '江岸', '汉阳', '江夏', '硚口', '青山'];
    dom.areaToggle.innerHTML = '';

    areas.forEach(area => {
      const isActive = state.activeArea === area;
      const tab = el('div', {
        className: `toggle-tab ${isActive ? 'active amber-theme' : ''}`,
        dataset: { area: area },
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
    const categories = [
      { name: '全部', emoji: '全', color: '#1A1A23' },
      { name: '五谷杂粮', emoji: '五', color: '#D4A574' },
      { name: '烧烤', emoji: '烧', color: '#FF5A5F' },
      { name: '火锅', emoji: '锅', color: '#EF4444' },
      { name: '烤肉', emoji: '烤', color: '#E85D3C' },
      { name: '早餐', emoji: '早', color: '#FFB400' },
      { name: '面包甜点', emoji: '甜', color: '#F472B6' },
      { name: '湖北菜', emoji: '鄂', color: '#DC2626' },
    ];

    dom.categoryGrid.innerHTML = '';

    categories.forEach(cat => {
      const count = cat.name === '全部'
        ? state.allShops.length
        : state.allShops.filter(s => s.category === cat.name).length;

      const cell = el('div', {
        className: `category-cell ${state.activeCategory === cat.name ? 'active' : ''}`,
        dataset: { category: cat.name },
      });

      const icon = el('div', {
        className: 'category-icon',
        style: {
          background: cat.color,
          color: cat.name === '全部' || cat.color === '#B9FF66' ? '#1A1A23' : 'white',
        },
      }, cat.emoji);

      cell.appendChild(icon);
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

  // === 分类 Chips（横向） ===
  function renderCategoryChips() {
    const categories = [
      '全部', '五谷杂粮', '烧烤', '火锅', '烤肉', '早餐', '面包甜点', '湖北菜',
      '日式烧鸟&日料', '粤&闽菜&潮汕火锅', '西餐', '自助餐', '苍蝇馆子', '私房菜',
      '韩国菜', '泰国菜', '其他国家菜',
    ];
    dom.categoryChips.innerHTML = '';

    categories.forEach(cat => {
      const isActive = state.activeCategory === cat;
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
        state.activeCategory = cat;
        if (window.__analytics) window.__analytics.trackFilter('category', cat);
        renderCategoryGrid();
        renderCategoryChips();
        filterAndRender();
      });
      dom.categoryChips.appendChild(chip);
    });
  }

  // === 筛选 + 排序 ===
  function filterShops() {
    let result = [...state.allShops];

    // 区域筛选
    if (state.activeArea !== '全部') {
      result = result.filter(s => s.area === state.activeArea);
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
        (s.reason && s.reason.toLowerCase().includes(q)) ||
        (s.cuisine && s.cuisine.toLowerCase().includes(q))
      );
    }

    // 排序
    result.sort((a, b) => {
      switch (state.sortBy) {
        case 'rating':
          return getRatingScore(b.rating) - getRatingScore(a.rating);
        case 'price-low':
          return (parseAvgPrice(a.avgPrice) || 9999) - (parseAvgPrice(b.avgPrice) || 9999);
        case 'price-high':
          return (parseAvgPrice(b.avgPrice) || 0) - (parseAvgPrice(a.avgPrice) || 0);
        case 'distance':
          return getNearestDistance(a) - getNearestDistance(b);
        default:
          return 0;
      }
    });

    state.filteredShops = result;
    return result;
  }

  function getNearestDistance(shop) {
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

  // === 渲染列表（分页） ===
  function filterAndRender() {
    const shops = filterShops();
    state.currentPage = 0;
    state.displayedShops = [];

    const titleText = state.activeCategory === '全部'
      ? `热门推荐 · ${shops.length}家`
      : `${state.activeCategory} · ${shops.length}家`;

    dom.resultTitle.textContent = titleText;

    const sortLabels = {
      'rating': '按评分排序',
      'price-low': '价格从低到高',
      'price-high': '价格从高到低',
      'distance': '按距离排序',
    };
    dom.sortLabel.textContent = sortLabels[state.sortBy];

    dom.shopList.innerHTML = '';

    if (shops.length === 0) {
      showEmpty(dom.shopList, '没有找到符合条件的美食\n试试换个区域或分类？');
      dom.loadMore.classList.add('hidden');
      return;
    }

    // 渲染第一页
    renderShops(shops, 0);

    // 加载更多
    if (shops.length > state.pageSize) {
      dom.loadMore.classList.remove('hidden');
      setupInfiniteScroll();
    } else {
      dom.loadMore.classList.add('hidden');
    }
  }

  function renderShops(shops, page) {
    const start = page * state.pageSize;
    const end = Math.min(start + state.pageSize, shops.length);

    for (let i = start; i < end; i++) {
      const shop = shops[i];
      const card = createShopCard(shop, (s) => showDetail(s));

      // 必吃徽章
      if (shop.rating === '必吃') {
        const badge = el('div', { className: 'must-eat-badge' }, '必吃');
        card.style.position = 'relative';
        card.appendChild(badge);
      }

      card.style.animationDelay = `${Math.min((i - start) * 30, 300)}ms`;
      dom.shopList.appendChild(card);
      state.displayedShops.push(shop);
    }

    // 如果已加载完所有数据
    if (state.displayedShops.length >= shops.length) {
      dom.loadMore.classList.add('hidden');
    }
  }

  // === 无限滚动 ===
  function setupInfiniteScroll() {
    if (state.isLoadingMore) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !state.isLoadingMore) {
        loadMoreShops();
      }
    }, { rootMargin: '100px' });

    observer.observe(dom.loadMore);
    state.scrollObserver = observer;
  }

  function loadMoreShops() {
    if (state.isLoadingMore) return;
    if (state.displayedShops.length >= state.filteredShops.length) return;

    state.isLoadingMore = true;
    state.currentPage++;

    setTimeout(() => {
      renderShops(state.filteredShops, state.currentPage);
      state.isLoadingMore = false;
    }, 300);
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
    const bar = createTabBar(state.activeTab, 'amber');
    dom.tabBar.appendChild(bar);

    bar.querySelectorAll('.tab-item').forEach(item => {
      item.addEventListener('click', () => {
        switchTab(item.dataset.tab);
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
    // 恢复列表视图结构
    dom.content.innerHTML = '';

    // 分类网格
    const grid = el('div', { className: 'category-grid', id: 'category-grid' });
    dom.content.appendChild(grid);
    dom.categoryGrid = grid;
    renderCategoryGrid();

    // 区域标题
    const header = el('div', { className: 'section-header' }, [
      el('span', { className: 'section-title', id: 'result-title' }, ''),
      el('span', { className: 'section-action', id: 'sort-label' }, ''),
    ]);
    dom.content.appendChild(header);
    dom.resultTitle = header.querySelector('#result-title');
    dom.sortLabel = header.querySelector('#sort-label');

    // 店铺列表
    const listContainer = el('div', { id: 'shop-list' });
    dom.content.appendChild(listContainer);
    dom.shopList = listContainer;

    // 加载更多
    const loadMore = el('div', { className: 'load-more hidden', id: 'load-more' });
    loadMore.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div><span style="font-size:12px; color:#999; margin-left:8px;">加载更多美食...</span>';
    dom.content.appendChild(loadMore);
    dom.loadMore = loadMore;

    filterAndRender();
  }

  function renderFavoriteView() {
    const favs = Favorites.get();
    const favShops = state.allShops.filter(s => favs.includes(s.name));

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

        if (shop.rating === '必吃') {
          const badge = el('div', { className: 'must-eat-badge' }, '必吃');
          card.style.position = 'relative';
          card.appendChild(badge);
        }

        const indicator = el('div', { className: 'fav-indicator' });
        indicator.innerHTML = Icons.heartFill;
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

    section.appendChild(el('div', { className: 'profile-header' }, [
      el('div', { className: 'profile-avatar' }, '🧭'),
      el('div', { className: 'profile-info' }, [
        el('div', { className: 'profile-name' }, '武汉美食探索者'),
        el('div', { className: 'profile-desc' }, `已收藏 ${favCount} 家 · 探索 ${state.allShops.length} 家美食`),
      ]),
    ]));

    // 统计
    const stats = el('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } });
    stats.appendChild(createStatCard('🏪', state.allShops.length, '全城店铺'));
    stats.appendChild(createStatCard('🏷️', '17', '美食分类'));
    stats.appendChild(createStatCard('❤️', favCount, '已收藏'));
    section.appendChild(stats);

    const menuItems = [
      { icon: '🎯', label: '我的收藏', action: () => switchTab('favorite') },
      { icon: '💬', label: '加入武汉吃货群', action: () => showSocialModal(window.__SOCIAL_CONFIG__.city) },
      { icon: '🏫', label: '切换到财大周边版', action: () => window.location.href = 'campus.html' },
      { icon: 'ℹ️', label: '关于', action: () => showAbout() },
    ];

    menuItems.forEach(item => {
      const menuItem = el('div', { className: 'profile-menu-item' });
      menuItem.appendChild(el('div', { className: 'profile-menu-icon', style: { fontSize: '16px' } }, item.icon));
      menuItem.appendChild(el('div', { className: 'profile-menu-label' }, item.label));
      const arrow = el('div', { className: 'profile-menu-arrow' });
      arrow.innerHTML = Icons.arrowRight;
      menuItem.appendChild(arrow);
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
    content.appendChild(el('div', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '8px' } }, '鲜城 · 全城版'));
    content.appendChild(el('div', { style: { fontSize: '13px', color: '#999', marginBottom: '20px' } }, 'Version 1.0.0'));
    content.appendChild(el('div', {
      style: { fontSize: '14px', color: '#666', lineHeight: '1.8', textAlign: 'left', marginBottom: '16px' },
    }, [
      '鲜城·全城版带你探索武汉三镇美食，覆盖 540+ 家精选店铺。\n\n',
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
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeBtn.click();
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  // === 地图视图 ===
  function showMap() {
    dom.mapView.classList.add('show');
    document.body.classList.add('no-scroll');

    if (!state.mapLoaded) {
      initMap();
    } else if (state.map) {
      updateMapMarkers();
    }
  }

  function initMap() {
    const config = window.__AMAP_CONFIG__;

    if (!config.key || config.key === 'YOUR_AMAP_JS_API_KEY') {
      showMapPlaceholder();
      return;
    }

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
        zoom: 12,
        center: [114.31, 30.55],
        mapStyle: 'amap://styles/whitesmoke',
        features: ['bg', 'road', 'building'],
      });

      state.map = map;
      state.mapLoaded = true;

      dom.mapPlaceholder.style.display = 'none';
      updateMapMarkers();
    }).catch((err) => {
      console.error('Amap load error:', err);
      showMapPlaceholder();
    });
  }

  function updateMapMarkers() {
    if (!state.map || !state.amap) return;

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
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: ${color};
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: 700;
          color: ${color === '#B9FF66' ? '#1A1A23' : '#fff'};
        ">${getCategoryEmoji(shop.category)}</div>`,
        offset: new state.amap.Pixel(-11, -11),
      });

      const infoContent = `
        <div class="amap-info-card">
          <div class="amap-info-name">${shop.name}</div>
          <div class="amap-info-meta">
            ${shop.rating ? '<span style="color:' + getRatingColor(shop.rating) + ';font-weight:600">' + shop.rating + '</span> · ' : ''}
            ${formatPrice(shop.avgPrice)} ${shop.area ? '· ' + shop.area : ''}
          </div>
          ${shop.signatureDishes ? '<div class="amap-info-dishes">招牌：' + shop.signatureDishes + '</div>' : ''}
          <div class="amap-info-nav" onclick="window.__navToShop__(${shop.lng},${shop.lat},'${shop.name.replace(/'/g, "\\'")}')">导航到这里 →</div>
        </div>
      `;
      const infoWindow = new state.amap.InfoWindow({
        content: infoContent,
        offset: new state.amap.Pixel(0, -18),
      });

      marker.on('click', () => {
        infoWindow.open(state.map, marker.getPosition());
      });

      marker.setMap(state.map);
      state.markers.push(marker);
    });

    // 聚合
    if (state.amap.MarkerClusterer) {
      state.cluster = new state.amap.MarkerClusterer(state.map, state.markers, {
        gridSize: 60,
        maxZoom: 18,
      });
    }

    // 适配视野
    if (state.markers.length > 0) {
      state.map.setFitView(state.markers, false, [60, 60, 60, 60]);
    }

    // 信息条
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

    // 简单 SVG 分布图
    const shops = filterShops();
    if (shops.length === 0) return;

    const lngs = shops.map(s => s.lng);
    const lats = shops.map(s => s.lat);
    const minLng = Math.min(...lngs) - 0.01;
    const maxLng = Math.max(...lngs) + 0.01;
    const minLat = Math.min(...lats) - 0.01;
    const maxLat = Math.max(...lats) + 0.01;
    const lngRange = maxLng - minLng;
    const latRange = maxLat - minLat;

    const w = 320, h = 420;
    const scaleX = w / lngRange;
    const scaleY = h / latRange;
    const scale = Math.min(scaleX, scaleY) * 0.85;

    let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:relative;">`;

    // 长江/汉水装饰
    svg += `<path d="M0,${h*0.3} Q${w*0.3},${h*0.25} ${w*0.5},${h*0.35} T${w},${h*0.3}" stroke="rgba(100,150,200,0.15)" stroke-width="20" fill="none"/>`;
    svg += `<path d="M${w*0.4},0 Q${w*0.45},${h*0.2} ${w*0.5},${h*0.35}" stroke="rgba(100,150,200,0.1)" stroke-width="12" fill="none"/>`;

    shops.forEach(shop => {
      const cx = (shop.lng - minLng) * scale + (w - lngRange * scale) / 2;
      const cy = h - (shop.lat - minLat) * scale - (h - latRange * scale) / 2;
      const color = getCategoryColor(shop.category);
      const r = shop.rating === '必吃' ? 4 : 3;
      svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="white" stroke-width="1" opacity="0.8"/>`;
    });

    svg += '</svg>';

    const miniMap = el('div', {
      style: {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, rgba(212,165,116,0.05), rgba(255,90,95,0.05))',
      },
    });
    miniMap.innerHTML = svg;
    dom.mapCanvas.appendChild(miniMap);
  }

  // === 事件绑定 ===
  function bindEvents() {
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

    // 社群
    // 分享按钮
    dom.shareBtn.addEventListener('click', handleShare);

    dom.socialBtn.addEventListener('click', () => {
      if (window.__analytics) window.__analytics.trackSocial();
      showSocialModal(window.__SOCIAL_CONFIG__.city);
    });

    // 滚动
    dom.content.addEventListener('scroll', () => {
      if (dom.content.scrollTop > 10) {
        dom.header.classList.add('scrolled');
      } else {
        dom.header.classList.remove('scrolled');
      }
    });

    // 导航函数
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
