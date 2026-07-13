/**
 * 周边游玩页面逻辑
 */

(function () {
  'use strict';

  // === 游玩分类配置 ===
  var PLAY_CATEGORIES = {
    '景点名胜': { color: '#8B5CF6', emoji: '🏛️', icon: '🏛️' },
    '街道区巷': { color: '#F59E0B', emoji: '🏘️', icon: '🏘️' },
    '书店打卡': { color: '#3B82F6', emoji: '📚', icon: '📚' },
    '寺庙道观': { color: '#10B981', emoji: '🛕', icon: '🛕' },
    '纪念馆': { color: '#EF4444', emoji: '🏛️', icon: '🏛️' },
    '博物馆': { color: '#6366F1', emoji: '🏛️', icon: '🏛️' },
    '体验打卡': { color: '#EC4899', emoji: '🚢', icon: '🚢' },
    '附近美食': { color: '#D4A574', emoji: '🍜', icon: '🍜' },
  };

  function getPlayCategoryColor(cat) {
    var c = PLAY_CATEGORIES[cat];
    return c ? c.color : '#999999';
  }

  function getPlayCategoryEmoji(cat) {
    var c = PLAY_CATEGORIES[cat];
    return c ? c.emoji : '📍';
  }

  // === 状态管理 ===
  var state = {
    data: [],
    filtered: [],
    activeCampus: 'all',
    activeCategory: '全部',
    searchQuery: '',
    activeTab: 'list',
    amap: null,
    map: null,
    markers: [],
    cluster: null,
    mapLoaded: false,
  };

  var dom = {};

  function cacheDom() {
    dom.app = document.getElementById('app');
    dom.header = document.getElementById('header');
    dom.content = document.getElementById('content');
    dom.placeList = document.getElementById('place-list');
    dom.resultTitle = document.getElementById('result-title');
    dom.countLabel = document.getElementById('count-label');
    dom.tabBar = document.getElementById('tab-bar');
    dom.campusToggle = document.getElementById('campus-toggle');
    dom.categoryChips = document.getElementById('category-chips');
    dom.searchBtn = document.getElementById('search-btn');
    dom.searchContainer = document.getElementById('search-container');
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
    state.data = window.__PLAY_DATA__ || [];
    renderCategoryChips();
    renderTabBar();
    bindEvents();
    filterAndRender();
  }

  // === 分类筛选 ===
  function renderCategoryChips() {
    var categories = ['全部', '景点名胜', '街道区巷', '书店打卡', '寺庙道观', '纪念馆', '博物馆', '体验打卡', '附近美食'];
    dom.categoryChips.innerHTML = '';

    categories.forEach(function (cat) {
      var isActive = state.activeCategory === cat;
      var chip = el('div', {
        className: 'chip ' + (isActive ? 'active' : ''),
        dataset: { category: cat },
      });

      if (cat !== '全部') {
        chip.appendChild(el('span', {
          className: 'chip-dot',
          style: { background: getPlayCategoryColor(cat) },
        }));
      }
      chip.appendChild(document.createTextNode(cat));
      chip.addEventListener('click', function () {
        state.activeCategory = cat;
        renderCategoryChips();
        filterAndRender();
        if (state.mapLoaded) updateMapMarkers();
      });
      dom.categoryChips.appendChild(chip);
    });
  }

  // === 筛选 ===
  function filterPlaces() {
    var result = state.data.slice();

    if (state.activeCampus !== 'all') {
      result = result.filter(function (p) { return p.campus === state.activeCampus; });
    }

    if (state.activeCategory !== '全部') {
      result = result.filter(function (p) { return p.category === state.activeCategory; });
    }

    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      result = result.filter(function (p) {
        return (p.name && p.name.toLowerCase().indexOf(q) >= 0) ||
               (p.category && p.category.toLowerCase().indexOf(q) >= 0) ||
               (p.description && p.description.toLowerCase().indexOf(q) >= 0) ||
               (p.address && p.address.toLowerCase().indexOf(q) >= 0);
      });
    }

    state.filtered = result;
    return result;
  }

  // === 渲染列表 ===
  function filterAndRender() {
    var places = filterPlaces();
    dom.resultTitle.textContent = '周边游玩 · ' + places.length + '处';

    var campusLabel = state.activeCampus === 'all' ? '首义 + 南湖' : state.activeCampus + '校区';
    dom.countLabel.textContent = campusLabel;

    if (places.length === 0) {
      showEmpty(dom.placeList, '没有找到符合条件的地点\n试试换个筛选条件？');
      return;
    }

    dom.placeList.innerHTML = '';
    places.forEach(function (place, i) {
      var card = createPlaceCard(place);
      card.style.animationDelay = Math.min(i * 30, 300) + 'ms';
      dom.placeList.appendChild(card);
    });
  }

  // === 创建地点卡片 ===
  function createPlaceCard(place) {
    var color = getPlayCategoryColor(place.category);
    var emoji = getPlayCategoryEmoji(place.category);
    var r = parseInt(color.slice(1, 3), 16);
    var g = parseInt(color.slice(3, 5), 16);
    var b = parseInt(color.slice(5, 7), 16);

    var card = el('div', { className: 'place-card' });

    // Banner
    var banner = el('div', {
      className: 'place-card-banner',
      style: {
        background: 'linear-gradient(135deg, rgba(' + r + ',' + g + ',' + b + ',0.25) 0%, rgba(' + r + ',' + g + ',' + b + ',0.1) 100%)',
      },
    }, [el('div', { className: 'place-card-emoji' }, emoji)]);
    card.appendChild(banner);

    // Body
    var body = el('div', { className: 'place-card-body' });

    // Header
    body.appendChild(el('div', { className: 'place-card-header' }, [
      el('div', { className: 'place-card-name' }, place.name),
      el('span', {
        className: 'place-card-cat',
        style: { background: 'rgba(' + r + ',' + g + ',' + b + ',0.15)', color: color },
      }, place.category),
    ]));

    // Description
    body.appendChild(el('div', { className: 'place-card-desc' }, place.description));

    // Meta
    var metaParts = [
      el('span', { className: 'meta-campus' }, place.campus + '校区'),
    ];
    if (place.address) {
      metaParts.push(el('span', { className: 'meta-addr' }, '📍 ' + place.address));
    }
    body.appendChild(el('div', { className: 'place-card-meta' }, metaParts));

    card.appendChild(body);

    card.addEventListener('click', function () { showDetail(place); });

    return card;
  }

  // === 详情弹窗 ===
  function showDetail(place) {
    var color = getPlayCategoryColor(place.category);
    var emoji = getPlayCategoryEmoji(place.category);
    var r = parseInt(color.slice(1, 3), 16);
    var g = parseInt(color.slice(3, 5), 16);
    var b = parseInt(color.slice(5, 7), 16);

    var overlay = el('div', { className: 'modal-overlay' });
    var content = el('div', { className: 'modal-content' });

    // Close btn
    var closeBtn = el('div', { className: 'modal-close' });
    closeBtn.innerHTML = Icons.close;
    closeBtn.addEventListener('click', function () {
      overlay.classList.remove('show');
      setTimeout(function () { overlay.remove(); }, 250);
    });
    content.appendChild(closeBtn);
    content.appendChild(el('div', { className: 'modal-handle' }));

    // Hero
    content.appendChild(el('div', {
      className: 'detail-place-hero',
      style: {
        background: 'linear-gradient(135deg, rgba(' + r + ',' + g + ',' + b + ',0.3) 0%, rgba(' + r + ',' + g + ',' + b + ',0.12) 100%)',
      },
    }, emoji));

    // Name
    content.appendChild(el('div', { className: 'detail-name' }, place.name));

    // Tags
    var tags = el('div', { className: 'detail-tags' });
    tags.appendChild(el('span', {
      className: 'detail-tag',
      style: { background: color, color: '#fff' },
    }, place.category));
    tags.appendChild(el('span', {
      className: 'detail-tag',
      style: { background: 'rgba(139, 92, 246, 0.1)', color: '#7C3AED' },
    }, place.campus + '校区'));
    content.appendChild(tags);

    // Address
    if (place.address) {
      content.appendChild(el('div', { className: 'detail-info-row' }, [
        el('div', { className: 'detail-info-label' }, '地址'),
        el('div', { className: 'detail-info-value' }, place.address),
      ]));
    }

    // Description
    if (place.description) {
      content.appendChild(el('div', { className: 'detail-info-row' }, [
        el('div', { className: 'detail-info-label' }, '简介'),
        el('div', { className: 'detail-info-value', style: { lineHeight: '1.8' } }, place.description),
      ]));
    }

    // Tips
    if (place.tips) {
      content.appendChild(el('div', { className: 'detail-place-tips' }, [
        el('div', { className: 'detail-place-tips-icon' }, '💡'),
        el('div', {}, place.tips),
      ]));
    }

    // Navigate button
    if (place.lng && place.lat) {
      var navBtn = el('div', { className: 'detail-nav-btn', style: { background: color } });
      navBtn.innerHTML = Icons.navigate;
      navBtn.appendChild(document.createTextNode(' 导航到这里'));
      navBtn.addEventListener('click', function () {
        openNavigation(place.lng, place.lat, place.name);
      });
      content.appendChild(navBtn);
    }

    overlay.appendChild(content);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeBtn.click();
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('show'); });
  }

  // === 搜索 ===
  function toggleSearch() {
    var isHidden = dom.searchContainer.classList.contains('hidden');
    if (isHidden) {
      dom.searchContainer.classList.remove('hidden');
      dom.searchContainer.classList.add('fade-in');
      setTimeout(function () { dom.searchInput.focus(); }, 100);
    } else {
      dom.searchContainer.classList.add('hidden');
      dom.searchInput.value = '';
      dom.searchClear.style.display = 'none';
      state.searchQuery = '';
      filterAndRender();
    }
  }

  var onSearchInput = debounce(function () {
    state.searchQuery = dom.searchInput.value.trim();
    dom.searchClear.style.display = state.searchQuery ? 'flex' : 'none';
    filterAndRender();
  }, 400);

  // === 底部导航 ===
  function renderTabBar() {
    dom.tabBar.innerHTML = '';
    var bar = createTabBar(state.activeTab, 'lime');
    dom.tabBar.appendChild(bar);

    bar.querySelectorAll('.tab-item').forEach(function (item) {
      item.addEventListener('click', function () {
        switchTab(item.dataset.tab);
      });
    });
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    renderTabBar();

    if (tabId === 'list') {
      dom.mapView.classList.remove('show');
      document.body.classList.remove('no-scroll');
    } else if (tabId === 'map') {
      showMap();
    } else if (tabId === 'favorite') {
      dom.mapView.classList.remove('show');
      document.body.classList.remove('no-scroll');
      showEmpty(dom.placeList, '收藏功能开发中\n敬请期待');
    } else if (tabId === 'profile') {
      dom.mapView.classList.remove('show');
      document.body.classList.remove('no-scroll');
      renderProfileView();
    }
  }

  function renderProfileView() {
    dom.content.innerHTML = '';
    dom.content.appendChild(el('div', { className: 'profile-section' }));
    var section = dom.content.querySelector('.profile-section');

    section.appendChild(el('div', { className: 'profile-header' }, [
      el('div', { className: 'profile-avatar' }, '🧭'),
      el('div', { className: 'profile-info' }, [
        el('div', { className: 'profile-name' }, '游玩探索者'),
        el('div', { className: 'profile-desc' }, '已浏览 ' + state.data.length + ' 处地点'),
      ]),
    ]));

    var stats = el('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } });
    stats.appendChild(createStatCard('📍', state.data.length, '总地点'));
    var shouyiCount = state.data.filter(function (p) { return p.campus === '首义'; }).length;
    var nanhuCount = state.data.filter(function (p) { return p.campus === '南湖'; }).length;
    stats.appendChild(createStatCard('🏫', shouyiCount, '首义'));
    stats.appendChild(createStatCard('🏫', nanhuCount, '南湖'));
    section.appendChild(stats);

    var menuItems = [
      { icon: '🔄', label: '切换到财大美食', action: function () { window.location.href = 'campus.html'; } },
      { icon: '🔄', label: '切换到全城美食', action: function () { window.location.href = 'wuhan.html'; } },
      { icon: '💬', label: '加入游玩群', action: function () { showSocialModal(window.__SOCIAL_CONFIG__.campus); } },
      { icon: 'ℹ️', label: '关于', action: function () { showAbout(); } },
    ];

    menuItems.forEach(function (item) {
      var menuItem = el('div', { className: 'profile-menu-item' });
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
        flex: '1', background: 'var(--card-bg)', borderRadius: '12px',
        padding: '12px', textAlign: 'center', boxShadow: 'var(--shadow-sm)',
      },
    }, [
      el('div', { style: { fontSize: '20px', marginBottom: '4px' } }, icon),
      el('div', { style: { fontSize: '18px', fontWeight: '700' } }, String(value)),
      el('div', { style: { fontSize: '11px', color: 'var(--text-tertiary)' } }, label),
    ]);
  }

  function showAbout() {
    var overlay = el('div', { className: 'modal-overlay' });
    var content = el('div', { className: 'modal-content', style: { textAlign: 'center' } });
    content.appendChild(el('div', { className: 'modal-handle' }));
    content.appendChild(el('div', { style: { fontSize: '20px', fontWeight: '700', marginBottom: '8px' } }, '鲜城 · 周边游玩'));
    content.appendChild(el('div', { style: { fontSize: '13px', color: '#999', marginBottom: '20px' } }, 'Version 1.0.0'));
    content.appendChild(el('div', {
      style: { fontSize: '14px', color: '#666', lineHeight: '1.8', textAlign: 'left', marginBottom: '16px' },
    }, [
      'ZUEL周边吃喝玩乐指南，带你发现财大周边的好去处。\n\n',
      '数据来源：ZUEL周边吃喝玩乐 PDF（小红薯：537634449）\n',
      '覆盖范围：首义 + 南湖两校区周边景点、街道、书店、寺庙、纪念馆等\n',
      '坐标系：GCJ-02（高德坐标系）',
    ].join('')));

    var closeBtn = el('div', { className: 'modal-close' });
    closeBtn.innerHTML = Icons.close;
    closeBtn.addEventListener('click', function () {
      overlay.classList.remove('show');
      setTimeout(function () { overlay.remove(); }, 250);
    });
    content.appendChild(closeBtn);

    overlay.appendChild(content);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeBtn.click(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('show'); });
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
    var config = window.__AMAP_CONFIG__;
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
    }).then(function (AMap) {
      state.amap = AMap;
      var map = new AMap.Map('amap-canvas', {
        zoom: 13,
        center: [114.31, 30.55],
        mapStyle: 'amap://styles/whitesmoke',
        features: ['bg', 'road', 'building'],
      });

      state.map = map;
      state.mapLoaded = true;
      dom.mapPlaceholder.style.display = 'none';

      // Add campus markers
      var shouyiCenter = [114.313162, 30.537365];
      var nanhuCenter = [114.385365, 30.474518];

      [
        { pos: shouyiCenter, name: '首义校区' },
        { pos: nanhuCenter, name: '南湖校区' },
      ].forEach(function (c) {
        var marker = new AMap.Marker({
          position: c.pos,
          content: '<div style="background:#1A1A23;color:white;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;white-space:nowrap;border:2px solid #8B5CF6;box-shadow:0 2px 8px rgba(0,0,0,0.15);">' + c.name + '</div>',
          offset: new AMap.Pixel(-30, -12),
        });
        marker.setMap(map);
      });

      updateMapMarkers();
      fitMapView();
    }).catch(function (err) {
      console.error('Amap load error:', err);
      showMapPlaceholder();
    });
  }

  function updateMapMarkers() {
    if (!state.map || !state.amap) return;

    if (state.markers.length > 0) {
      state.markers.forEach(function (m) { m.setMap(null); });
      state.markers = [];
    }
    if (state.cluster) {
      state.cluster.setMarkers([]);
    }

    var places = filterPlaces();

    places.forEach(function (place) {
      var color = getPlayCategoryColor(place.category);
      var emoji = getPlayCategoryEmoji(place.category);

      var marker = new state.amap.Marker({
        position: [place.lng, place.lat],
        content: '<div style="width:28px;height:28px;border-radius:50%;background:' + color + ';border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:14px;">' + emoji + '</div>',
        offset: new state.amap.Pixel(-14, -14),
      });

      var infoContent =
        '<div class="amap-info-card">' +
        '<div class="amap-info-name">' + place.name + '</div>' +
        '<div class="amap-info-meta"><span style="background:' + color + ';color:#fff;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;">' + place.category + '</span> · ' + place.campus + '校区</div>' +
        '<div class="amap-info-dishes" style="font-size:12px;color:#666;margin-top:4px;-webkit-line-clamp:2;overflow:hidden;">' + (place.description || '').substring(0, 80) + '...</div>' +
        '<div class="amap-info-nav" onclick="window.__navToPlace__(' + place.lng + ',' + place.lat + ',\'' + place.name.replace(/'/g, "\\'") + '\')">导航到这里 →</div>' +
        '</div>';

      var infoWindow = new state.amap.InfoWindow({
        content: infoContent,
        offset: new state.amap.Pixel(0, -24),
      });

      marker.on('click', function () {
        infoWindow.open(state.map, marker.getPosition());
      });

      marker.setMap(state.map);
      state.markers.push(marker);
    });

    if (state.amap.MarkerClusterer) {
      state.cluster = new state.amap.MarkerClusterer(state.map, state.markers, {
        gridSize: 60,
        maxZoom: 18,
      });
    }

    updateMapInfoBar(places.length);
  }

  function updateMapInfoBar(count) {
    var infoBar = dom.mapView.querySelector('.map-info-bar');
    if (!infoBar) {
      infoBar = el('div', { className: 'map-info-bar' });
      dom.mapView.querySelector('.map-canvas-wrapper').appendChild(infoBar);
    }
    infoBar.innerHTML = '';
    infoBar.appendChild(el('div', { className: 'map-info-count' }, '显示 ' + count + ' 处地点'));
    var actionEl = el('div', { className: 'map-info-action' });
    actionEl.innerHTML = Icons.list + ' 切换列表';
    actionEl.addEventListener('click', function () { switchTab('list'); });
    infoBar.appendChild(actionEl);
  }

  function fitMapView() {
    if (!state.map || !state.amap) return;
    var places = filterPlaces();
    if (places.length === 0) return;
    state.map.setFitView(state.markers, false, [60, 60, 60, 60]);
  }

  function showMapPlaceholder() {
    dom.mapPlaceholder.innerHTML = '';
    dom.mapPlaceholder.appendChild(el('div', { className: 'map-placeholder-icon' }, '🗺️'));
    dom.mapPlaceholder.appendChild(el('div', { className: 'map-placeholder-title' }, '地图功能需要配置 API Key'));
    dom.mapPlaceholder.appendChild(el('div', { className: 'map-placeholder-desc' }, '在 js/config.js 中填写高德 JS API Key 即可启用地图功能。'));
  }

  // === 事件绑定 ===
  function bindEvents() {
    dom.campusToggle.querySelectorAll('.toggle-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        dom.campusToggle.querySelectorAll('.toggle-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        state.activeCampus = tab.dataset.campus;
        filterAndRender();
        if (state.mapLoaded) updateMapMarkers();
      });
    });

    dom.searchBtn.addEventListener('click', toggleSearch);
    dom.searchInput.addEventListener('input', onSearchInput);
    dom.searchClear.addEventListener('click', function () {
      dom.searchInput.value = '';
      dom.searchClear.style.display = 'none';
      state.searchQuery = '';
      filterAndRender();
    });

    dom.mapBackBtn.addEventListener('click', function () {
      dom.mapView.classList.remove('show');
      document.body.classList.remove('no-scroll');
      switchTab('list');
    });

    dom.shareBtn.addEventListener('click', handleShare);
    dom.socialBtn.addEventListener('click', function () {
      showSocialModal(window.__SOCIAL_CONFIG__.campus);
    });

    dom.content.addEventListener('scroll', function () {
      if (dom.content.scrollTop > 10) {
        dom.header.classList.add('scrolled');
      } else {
        dom.header.classList.remove('scrolled');
      }
    });

    window.__navToPlace__ = function (lng, lat, name) {
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
