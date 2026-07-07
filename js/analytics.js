/**
 * 鲜城 · 味觉地图 - 数据分析框架
 *
 * 使用说明：
 * 1. 默认只做本地日志记录，方便调试
 * 2. 接入百度统计：填写 __ANALYTICS_CONFIG__.baiduId 即可
 * 3. 接入自定义端点：填写 __ANALYTICS_CONFIG__.endpoint
 *
 * 事件类型：
 * - pageview: 页面浏览
 * - click_shop: 点击店铺卡片
 * - click_navigate: 点击导航
 * - click_social: 点击社群入口
 * - click_share: 点击分享
 * - click_filter: 使用筛选
 * - search: 使用搜索
 * - map_open: 打开地图
 */

(function () {
  'use strict';

  var CONFIG = window.__ANALYTICS_CONFIG__ = {
    enabled: true,
    baiduId: '',          // 填入百度统计 ID 后自动启用
    endpoint: '',         // 自定义上报接口
    logToConsole: true,   // 开发阶段打印日志
  };

  var queue = [];

  /** 百度统计初始化 */
  function initBaidu() {
    if (!CONFIG.baiduId) return;
    var _hmt = _hmt || [];
    (function () {
      var hm = document.createElement('script');
      hm.src = 'https://hm.baidu.com/hm.js?' + CONFIG.baiduId;
      var s = document.getElementsByTagName('script')[0];
      s.parentNode.insertBefore(hm, s);
    })();
  }

  /** 上报单个事件 */
  function track(type, data) {
    if (!CONFIG.enabled) return;

    var event = {
      type: type,
      data: data || {},
      url: window.location.href,
      timestamp: Date.now(),
    };

    queue.push(event);
    if (CONFIG.logToConsole) {
      console.log('[Analytics]', type, data);
    }

    // 百度统计
    if (CONFIG.baiduId && typeof _hmt !== 'undefined') {
      if (type === 'pageview') {
        _hmt.push(['_trackPageview', event.url]);
      } else {
        _hmt.push(['_trackEvent', type, JSON.stringify(data)]);
      }
    }

    // 自定义端点 (批量上报，每 30s 或满 10 条)
    if (CONFIG.endpoint) {
      flush();
    }
  }

  function flush() {
    if (queue.length === 0 || !CONFIG.endpoint) return;
    var batch = queue.splice(0, queue.length);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(CONFIG.endpoint, JSON.stringify(batch));
    } else {
      fetch(CONFIG.endpoint, {
        method: 'POST',
        body: JSON.stringify(batch),
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(function () {});
    }
  }

  // 定时刷新
  setInterval(flush, 30000);

  // 页面离开前确保数据送达
  window.addEventListener('beforeunload', flush);

  // 页面浏览
  track('pageview', { title: document.title });

  // 公开 API
  window.__analytics = {
    track: track,
    trackShopClick: function (shop) {
      track('click_shop', { name: shop.name, category: shop.category, price: shop.avgPrice });
    },
    trackNavigate: function (shop) {
      track('click_navigate', { name: shop.name });
    },
    trackSocial: function () {
      track('click_social', {});
    },
    trackShare: function (method) {
      track('click_share', { method: method });
    },
    trackFilter: function (filterType, value) {
      track('click_filter', { filterType: filterType, value: value });
    },
    trackSearch: function (query) {
      track('search', { query: query });
    },
  };

  // 初始化
  initBaidu();
})();
