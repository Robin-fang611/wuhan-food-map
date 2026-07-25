/**
 * core/map.js — 地图控制器
 *
 * 将三份重复的 initMap/updateMapMarkers/showMapPlaceholder 提取为统一 API。
 *
 * 使用方式：
 *   const mc = new MapController('amap-canvas', {
 *     center: [114.349, 30.506],
 *     zoom: 14,
 *   });
 *   mc.show(() => fetchShops(), createMarkerContent, createInfoContent);
 */

export class MapController {
  /**
   * @param {string} containerId - 地图容器 DOM id
   * @param {object} opts
   * @param {[number,number]} opts.center - 地图中心 [lng, lat]
   * @param {number} opts.zoom - 默认缩放级别
   * @param {string} opts.mapStyle - 地图样式，默认 'amap://styles/whitesmoke'
   * @param {string[]} opts.features - 地图要素，默认 ['bg','road','building']
   * @param {Array<{pos:[number,number],name:string,color?:string}>} [opts.campusMarkers] - 校区标记
   */
  constructor(containerId, opts = {}) {
    this.containerId = containerId;
    this.center = opts.center || [114.31, 30.55];
    this.zoom = opts.zoom || 12;
    this.mapStyle = opts.mapStyle || 'amap://styles/whitesmoke';
    this.features = opts.features || ['bg', 'road', 'building'];
    this.campusMarkers = opts.campusMarkers || null;

    this.AMap = null;
    this.map = null;
    this.loaded = false;
    this._markers = [];
    this._cluster = null;
  }

  /**
   * 显示地图（惰性初始化）
   * @param {Function} filterFn - 返回当前店铺/地点数组的函数
   * @param {Function} markerContentFn - (shop) => HTML string，创建 marker 内容
   * @param {Function} infoContentFn - (shop) => HTML string，创建信息窗口内容
   * @param {object} [markerOpts] - marker 尺寸配置
   * @param {number} [markerOpts.size=24] - marker 像素尺寸
   * @param {number} [markerOpts.markerOffset=-12] - 偏移量
   * @param {number} [markerOpts.infoOffset=-20] - 信息窗口偏移
   * @param {Function} [onNavClick] - (shop) => void 导航点击回调
   */
  show(filterFn, markerContentFn, infoContentFn, markerOpts = {}, onNavClick) {
    const cfg = window.__AMAP_CONFIG__;
    if (!cfg || !cfg.key || cfg.key === 'YOUR_AMAP_JS_API_KEY') {
      this._showPlaceholder(filterFn ? filterFn().length : 0);
      return;
    }

    if (this.AMap) {
      // 地图已就绪，直接更新
      this._updateMarkers(filterFn, markerContentFn, infoContentFn, markerOpts, onNavClick);
      return;
    }

    if (!this._loading) {
      this._loading = true;
      this._init(cfg, filterFn, markerContentFn, infoContentFn, markerOpts, onNavClick);
    }
  }

  /** 内部：初始化高德地图 */
  _init(cfg, filterFn, markerContentFn, infoContentFn, markerOpts, onNavClick) {
    if (cfg.securityJsCode) {
      window._AMapSecurityConfig = { securityJsCode: cfg.securityJsCode };
    }

    AMapLoader.load({
      key: cfg.key,
      version: cfg.version || '2.0',
      plugins: cfg.plugins || ['AMap.Scale', 'AMap.MarkerClusterer'],
    }).then((AMap) => {
      this.AMap = AMap;
      this.map = new AMap.Map(this.containerId || 'amap-canvas', {
        zoom: this.zoom,
        center: this.center,
        mapStyle: this.mapStyle,
        features: this.features,
      });
      this.loaded = true;

      // 校区标记
      if (this.campusMarkers) {
        this._addCampusMarkers();
      }

      // 店铺标记
      this._updateMarkers(filterFn, markerContentFn, infoContentFn, markerOpts, onNavClick);
    }).catch((err) => {
      console.error('Amap load error:', err);
      this._showPlaceholder(filterFn ? filterFn().length : 0);
    }).finally(() => {
      this._loading = false;
    });
  }

  /** 添加校区标记 */
  _addCampusMarkers() {
    if (!this.AMap || !this.map || !this.campusMarkers) return;
    this.campusMarkers.forEach((c) => {
      const color = c.color || '#B9FF66';
      const marker = new this.AMap.Marker({
        position: c.pos,
        content: `<div style="
          background:#1A1A23; color:white; padding:4px 10px;
          border-radius:12px; font-size:12px; font-weight:600;
          white-space:nowrap; border:2px solid ${color};
          box-shadow:0 2px 8px rgba(0,0,0,0.15);
        ">${c.name}</div>`,
        offset: new this.AMap.Pixel(-30, -12),
      });
      marker.setMap(this.map);
    });
  }

  /** 更新地图标记 */
  _updateMarkers(filterFn, markerContentFn, infoContentFn, markerOpts = {}, onNavClick) {
    if (!this.map || !this.AMap) return;

    const size = markerOpts.size || 24;
    const markerOff = markerOpts.markerOffset ?? -(size / 2);
    const infoOff = markerOpts.infoOffset ?? -20;

    // 清除旧标记
    this._clearMarkers();

    const shops = filterFn ? filterFn() : [];
    const navFn = onNavClick || function (lng, lat, name) {
      const url = `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(name)}&mode=walk&coordinate=gaode&callnative=1`;
      window.open(url, '_blank');
    };

    shops.forEach((shop) => {
      const content = markerContentFn ? markerContentFn(shop) : `<div style="
        width:${size}px; height:${size}px; border-radius:50%;
        background:#999; border:2px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.2);
      "></div>`;

      const marker = new this.AMap.Marker({
        position: [shop.lng, shop.lat],
        content: content,
        offset: new this.AMap.Pixel(markerOff, markerOff),
      });

      if (infoContentFn) {
        const info = infoContentFn(shop, navFn);
        const infoWindow = new this.AMap.InfoWindow({
          content: info,
          offset: new this.AMap.Pixel(0, infoOff),
        });
        marker.on('click', () => {
          infoWindow.open(this.map, marker.getPosition());
        });
      }

      marker.setMap(this.map);
      this._markers.push(marker);
    });

    // 聚合
    if (this.AMap.MarkerClusterer && this._markers.length > 0) {
      this._cluster = new this.AMap.MarkerClusterer(this.map, this._markers, {
        gridSize: 60,
        maxZoom: 18,
      });
    }

    // 适配视野
    if (this._markers.length > 0) {
      this.map.setFitView(this._markers, false, [60, 60, 60, 60]);
    }
  }

  /** 清除所有标记 */
  _clearMarkers() {
    if (this._markers.length > 0) {
      this._markers.forEach(m => m.setMap(null));
      this._markers = [];
    }
    if (this._cluster) {
      this._cluster.setMarkers([]);
      this._cluster = null;
    }
  }

  /** 定位到当前位置 */
  locate() {
    if (!this.map) return false;
    if (!navigator.geolocation) return false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.map.setCenter([pos.coords.longitude, pos.coords.latitude]);
        this.map.setZoom(15);
      },
      () => {}
    );
    return true;
  }

  /** 地图未就绪时的占位显示 */
  _showPlaceholder(count) {
    const canvas = document.getElementById(this.containerId || 'amap-canvas');
    if (!canvas) return;

    // 清除已有的占位
    const existing = canvas.querySelector('.map-placeholder-wrap');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.className = 'map-placeholder-wrap';
    wrap.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:40px;text-align:center;z-index:10;';

    wrap.innerHTML = `
      <div style="font-size:48px">🗺️</div>
      <div style="font-size:18px;font-weight:600">地图功能需要配置 API Key</div>
      <div style="font-size:14px;color:var(--text-tertiary, #999);max-width:280px;line-height:1.6">
        在 js/config.js 中填写高德 JS API Key 即可启用地图功能。<br>列表浏览、筛选、搜索功能不受影响。
      </div>
      <div style="font-size:12px;color:var(--amber);margin-top:8px">当前显示 ${count} 家美食</div>
    `;

    canvas.appendChild(wrap);
  }

  /** 销毁 */
  destroy() {
    this._clearMarkers();
    if (this.map) {
      this.map.destroy();
      this.map = null;
    }
    this.AMap = null;
    this.loaded = false;
  }
}
