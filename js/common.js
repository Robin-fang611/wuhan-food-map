/**
 * 武汉美食地图 - 共享工具库
 */

/* === 分类颜色映射 === */
const CATEGORY_COLORS = {
  '南湖推荐': '#B9FF66',
  '五谷杂粮': '#D4A574',
  '早餐': '#FFB400',
  '烧烤': '#FF5A5F',
  '烤肉': '#E85D3C',
  '日式烧鸟&日料': '#5B9BD5',
  '粤&闽菜&潮汕火锅': '#E89B5A',
  '西餐': '#8B5CF6',
  '自助餐': '#10B981',
  '火锅': '#EF4444',
  '苍蝇馆子': '#6B7280',
  '面包甜点': '#F472B6',
  '私房菜': '#7C3AED',
  '韩国菜': '#F59E0B',
  '泰国菜': '#84CC16',
  '湖北菜': '#DC2626',
  '其他国家菜': '#3B82F6',
};

const CATEGORY_EMOJI = {
  '南湖推荐': '★',
  '五谷杂粮': '五',
  '早餐': '早',
  '烧烤': '烧',
  '烤肉': '烤',
  '日式烧鸟&日料': '日',
  '粤&闽菜&潮汕火锅': '粤',
  '西餐': '西',
  '自助餐': '自',
  '火锅': '锅',
  '苍蝇馆子': '苍',
  '面包甜点': '甜',
  '私房菜': '私',
  '韩国菜': '韩',
  '泰国菜': '泰',
  '湖北菜': '鄂',
  '其他国家菜': '异',
};

/* === 工具函数 === */

/** 获取分类颜色 */
function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || '#999999';
}

/** 获取分类首字/emoji */
function getCategoryEmoji(category) {
  return CATEGORY_EMOJI[category] || '食';
}

/** 解析人均价格 - 返回数字（取范围中值） */
function parseAvgPrice(price) {
  if (!price || price === '') return null;
  const str = String(price).trim();
  if (str.includes('-')) {
    const parts = str.split('-').map(p => parseInt(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return Math.round((parts[0] + parts[1]) / 2);
    }
  }
  const num = parseInt(str);
  return isNaN(num) ? null : num;
}

/** 格式化价格显示 */
function formatPrice(price) {
  if (!price || price === '') return '未知';
  return '¥' + price + '/人';
}

/** 格式化评分显示 */
function formatRating(rating) {
  if (!rating || rating === '') return '';
  if (rating === '必吃') return '必吃';
  if (rating === '推荐') return '推荐';
  return rating;
}

/** 获取评分颜色 */
function getRatingColor(rating) {
  if (rating === '必吃') return '#FF5A5F';
  if (rating === '推荐') return '#D4A574';
  return '#FFB400';
}

/** 格式化距离 */
function formatDistance(km) {
  if (km === null || km === undefined) return '';
  if (km < 0) return '校内';
  if (km < 1) return Math.round(km * 1000) + 'm';
  return km.toFixed(1) + 'km';
}

/** 生成店铺图片渐变色 */
function getShopGradient(shop) {
  const color = getCategoryColor(shop.category);
  // 将 hex 转为 rgb
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `linear-gradient(135deg, rgba(${r},${g},${b},0.9) 0%, rgba(${r},${g},${b},0.5) 100%)`;
}

/** 防抖 */
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/** DOM 创建助手 */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') {
      node.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign(node.dataset, value);
    } else if (value !== null && value !== undefined) {
      node.setAttribute(key, value);
    }
  });
  const childArray = Array.isArray(children) ? children : [children];
  childArray.forEach(child => {
    if (child === null || child === undefined) return;
    if (typeof child === 'string') {
      node.appendChild(document.createTextNode(child));
    } else {
      node.appendChild(child);
    }
  });
  return node;
}

/** SVG 图标库 */
const Icons = {
  search: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="M14 14L18 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  filter: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 6H17M5 10H15M7 14H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  location: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 18S3 11.5 3 7.5C3 4.5 5.5 2 8.5 2C10 2 10 2.5 10 2.5C10 2.5 10 2 11.5 2C14.5 2 17 4.5 17 7.5C17 11.5 10 18 10 18Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="10" cy="7.5" r="2" fill="currentColor"/></svg>',
  map: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9C5 13.5 12 22 12 22S19 13.5 19 9C19 5.13 15.87 2 12 2Z" fill="currentColor"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg>',
  mapOutline: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9C5 13.5 12 22 12 22S19 13.5 19 9C19 5.13 15.87 2 12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/></svg>',
  list: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  heart: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 21S4 14.5 4 8.5C4 5.5 6.5 3 9.5 3C11 3 12 4 12 4S13 3 14.5 3C17.5 3 20 5.5 20 8.5C20 14.5 12 21 12 21Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  heartFill: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21S4 14.5 4 8.5C4 5.5 6.5 3 9.5 3C11 3 12 4 12 4S13 3 14.5 3C17.5 3 20 5.5 20 8.5C20 14.5 12 21 12 21Z"/></svg>',
  user: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 21C4 17 7.5 14 12 14S20 17 20 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  arrowRight: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 8H12.5M12.5 8L8.5 4M12.5 8L8.5 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrowLeft: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  star: '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 0L7.5 4.5H12L8.25 7.5L9.75 12L6 9L2.25 12L3.75 7.5L0 4.5H4.5L6 0Z"/></svg>',
  navigate: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 14L14 2M14 2H6M14 2V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  group: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="2"/><path d="M3 19C3 16 5.5 14 9 14S15 16 15 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="9" r="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M15 19C15 17 16.5 15.5 18.5 15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 4V8L10.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  sort: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 5H13M5 8H11M7 11H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  chat: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5C3 4 4 3 5 3H15C16 3 17 4 17 5V12C17 13 16 14 15 14H8L4 17V5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};

/** 创建店铺卡片 DOM */
function createShopCard(shop, onClick) {
  const color = getCategoryColor(shop.category);
  const emoji = getCategoryEmoji(shop.category);
  const priceText = formatPrice(shop.avgPrice);
  const ratingText = formatRating(shop.rating);
  const ratingColor = getRatingColor(shop.rating);

  const card = el('div', { className: 'shop-card entering' });

  // 图片占位
  const imgWrap = el('div', {
    className: 'shop-image',
    style: { background: getShopGradient(shop) },
  }, [
    el('div', { className: 'img-placeholder' }, emoji),
  ]);

  // 信息
  const info = el('div', { className: 'shop-info' });

  // 名称行
  const nameRow = el('div', { className: 'shop-name-row' }, [
    el('div', { className: 'shop-name' }, shop.name),
    el('span', {
      className: 'cat-badge',
      style: { background: color, color: color === '#B9FF66' ? '#1A1A23' : '#FFFFFF' },
    }, shop.category),
  ]);
  info.appendChild(nameRow);

  // 评分行
  const metaParts = [];
  if (ratingText) {
    metaParts.push(el('span', { className: 'star' }, '★'));
    metaParts.push(el('span', { style: { fontWeight: '600' } }, ratingText));
    metaParts.push(el('span', {}, '·'));
  }
  metaParts.push(el('span', {}, priceText));
  if (shop.area) {
    metaParts.push(el('span', {}, '·'));
    metaParts.push(el('span', {}, shop.area));
  }
  info.appendChild(el('div', { className: 'shop-meta' }, metaParts));

  // 招牌菜
  if (shop.signatureDishes) {
    info.appendChild(el('div', { className: 'shop-dishes' }, '招牌：' + shop.signatureDishes));
  }

  // 距离/地址
  const distParts = [];
  if (shop.distanceToNanhu_km !== undefined && shop.distanceToNanhu_km !== null) {
    distParts.push('距南湖 ' + formatDistance(shop.distanceToNanhu_km));
  }
  if (shop.distanceToShouyi_km !== undefined && shop.distanceToShouyi_km !== null) {
    if (distParts.length > 0) distParts.push(' · ');
    distParts.push('距首义 ' + formatDistance(shop.distanceToShouyi_km));
  }
  if (shop.address) {
    if (distParts.length > 0) distParts.push(' · ');
    distParts.push(shop.address);
  }
  if (distParts.length > 0) {
    info.appendChild(el('div', { className: 'shop-distance' }, distParts.join('')));
  }

  card.appendChild(imgWrap);
  card.appendChild(info);

  if (onClick) {
    card.addEventListener('click', () => onClick(shop));
  }

  // 移除 entering 动画类
  setTimeout(() => card.classList.remove('entering'), 500);

  return card;
}

/** 创建详情弹窗 */
function createDetailModal(shop, onClose, onNavigate) {
  const color = getCategoryColor(shop.category);
  const emoji = getCategoryEmoji(shop.category);

  const overlay = el('div', { className: 'modal-overlay' });

  const content = el('div', { className: 'modal-content' });

  // 关闭按钮
  const closeBtn = el('div', { className: 'modal-close' });
  closeBtn.innerHTML = Icons.close;
  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('show');
    setTimeout(() => {
      overlay.remove();
      if (onClose) onClose();
    }, 250);
  });
  content.appendChild(closeBtn);
  content.appendChild(el('div', { className: 'modal-handle' }));

  // Hero 区
  const hero = el('div', {
    className: 'detail-hero',
    style: { background: getShopGradient(shop) },
  }, emoji);
  content.appendChild(hero);

  // 店名
  content.appendChild(el('div', { className: 'detail-name' }, shop.name));

  // 标签
  const tags = el('div', { className: 'detail-tags' });
  tags.appendChild(el('span', {
    className: 'detail-tag',
    style: { background: color, color: color === '#B9FF66' ? '#1A1A23' : '#FFFFFF' },
  }, shop.category));
  if (shop.rating) {
    tags.appendChild(el('span', {
      className: 'detail-tag',
      style: { background: getRatingColor(shop.rating), color: '#FFFFFF' },
    }, shop.rating));
  }
  if (shop.avgPrice) {
    tags.appendChild(el('span', {
      className: 'detail-tag',
      style: { background: '#F5F5F0', color: '#555555' },
    }, formatPrice(shop.avgPrice)));
  }
  if (shop.mealTime) {
    tags.appendChild(el('span', {
      className: 'detail-tag',
      style: { background: '#F5F5F0', color: '#555555' },
    }, shop.mealTime));
  }
  content.appendChild(tags);

  // 详细信息行
  function infoRow(label, value, iconSvg) {
    if (!value) return null;
    return el('div', { className: 'detail-info-row' }, [
      el('div', { className: 'detail-info-label' }, label),
      el('div', { className: 'detail-info-value' }, value),
    ]);
  }

  const infoRows = [
    infoRow('招牌菜', shop.signatureDishes),
    infoRow('菜系', shop.cuisine),
    infoRow('适合', shop.groupSize ? shop.groupSize + ' 人' : null),
    infoRow('用餐时间', shop.mealTime),
    infoRow('地址', shop.address),
    infoRow('区域', shop.area),
  ].filter(r => r !== null);

  infoRows.forEach(row => content.appendChild(row));

  // 推荐理由
  if (shop.reason) {
    const reasonBox = el('div', {
      style: {
        marginTop: '12px',
        padding: '12px 14px',
        background: '#FFF7ED',
        borderRadius: '12px',
        fontSize: '13px',
        color: '#666',
        lineHeight: '1.6',
      },
    }, [
      el('span', { style: { fontWeight: '600', color: '#D4A574' } }, '推荐理由  '),
      shop.reason,
    ]);
    content.appendChild(reasonBox);
  }

  // 距离信息
  const distParts = [];
  if (shop.distanceToNanhu_km !== undefined && shop.distanceToNanhu_km !== null) {
    distParts.push('南湖校区 ' + formatDistance(shop.distanceToNanhu_km));
  }
  if (shop.distanceToShouyi_km !== undefined && shop.distanceToShouyi_km !== null) {
    if (distParts.length > 0) distParts.push('  ·  ');
    distParts.push('首义校区 ' + formatDistance(shop.distanceToShouyi_km));
  }
  if (distParts.length > 0) {
    content.appendChild(el('div', {
      style: { marginTop: '12px', fontSize: '12px', color: '#999' },
    }, distParts.join('')));
  }

  // 导航按钮
  if (shop.lng && shop.lat) {
    const navBtn = el('div', { className: 'detail-nav-btn' });
    navBtn.innerHTML = Icons.navigate;
    navBtn.appendChild(document.createTextNode(' 导航到这里'));
    navBtn.addEventListener('click', () => {
      if (onNavigate) onNavigate(shop);
    });
    content.appendChild(navBtn);
  }

  overlay.appendChild(content);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeBtn.click();
    }
  });

  return overlay;
}

/** 打开高德导航 */
function openNavigation(lng, lat, name) {
  const url = `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(name)}&mode=walk&coordinate=gaode&callnative=1`;
  window.open(url, '_blank');
}

/** LocalStorage 收藏管理 */
const Favorites = {
  key: 'food_map_favorites',

  get() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || '[]');
    } catch {
      return [];
    }
  },

  toggle(name) {
    const list = this.get();
    const idx = list.indexOf(name);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(name);
    }
    localStorage.setItem(this.key, JSON.stringify(list));
    return idx < 0; // true = added, false = removed
  },

  has(name) {
    return this.get().includes(name);
  },
};

/** 加载状态管理 */
function showLoading(container, text = '加载中') {
  const loader = el('div', {
    className: 'empty-state',
    style: { padding: '40px 20px' },
  }, [
    el('div', { className: 'loading-dots' }, [
      el('span'), el('span'), el('span'),
    ]),
    el('div', { style: { fontSize: '13px', color: '#999' } }, text),
  ]);
  container.innerHTML = '';
  container.appendChild(loader);
}

function showEmpty(container, text = '暂无数据') {
  const empty = el('div', { className: 'empty-state' }, [
    el('div', { className: 'empty-state-icon' }, '🍽️'),
    el('div', { className: 'empty-state-text' }, text),
  ]);
  container.innerHTML = '';
  container.appendChild(empty);
}

/** 创建底部 Tab Bar */
function createTabBar(activeTab, theme = 'lime') {
  const tabs = [
    { id: 'map', label: '地图', icon: Icons.mapOutline, activeIcon: Icons.map },
    { id: 'list', label: '列表', icon: Icons.list, activeIcon: Icons.list },
    { id: 'favorite', label: '收藏', icon: Icons.heart, activeIcon: Icons.heartFill },
    { id: 'profile', label: '我的', icon: Icons.user, activeIcon: Icons.user },
  ];

  const bar = el('div', { className: 'tab-bar' });

  tabs.forEach(tab => {
    const isActive = tab.id === activeTab;
    const item = el('div', {
      className: `tab-item ${isActive ? 'active' : ''} ${theme === 'amber' ? 'amber-theme' : ''}`,
      dataset: { tab: tab.id },
    });
    item.innerHTML = (isActive && tab.activeIcon ? tab.activeIcon : tab.icon) +
      `<span style="margin-top:2px">${tab.label}</span>`;
    bar.appendChild(item);
  });

  return bar;
}

/** 社群弹窗 */
function showSocialModal(config) {
  const overlay = el('div', { className: 'modal-overlay' });
  const content = el('div', { className: 'modal-content', style: { textAlign: 'center' } });

  content.appendChild(el('div', { className: 'modal-handle' }));
  content.appendChild(el('div', {
    style: { fontSize: '20px', fontWeight: '700', marginBottom: '8px' },
  }, config.title));
  content.appendChild(el('div', {
    style: { fontSize: '14px', color: '#999', marginBottom: '20px' },
  }, config.subtitle));

  if (config.qrCode) {
    content.appendChild(el('img', {
      src: config.qrCode,
      style: { width: '200px', height: '200px', borderRadius: '12px', margin: '0 auto 16px', display: 'block' },
    }));
    content.appendChild(el('div', {
      style: { fontSize: '13px', color: '#666', marginBottom: '16px' },
    }, '扫码加入群聊'));
  } else {
    content.appendChild(el('div', {
      style: {
        width: '160px', height: '160px', margin: '0 auto 16px',
        background: 'linear-gradient(135deg, #F9F4DF, #FFF7ED)',
        borderRadius: '12px', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: '48px',
      },
    }, '💬'));
    content.appendChild(el('div', {
      style: { fontSize: '13px', color: '#999', marginBottom: '16px' },
    }, '二维码待上传，请联系管理员获取群链接'));
  }

  if (config.link) {
    const linkBtn = el('div', {
      className: 'detail-nav-btn',
      style: { background: '#FF5A5F' },
    }, '点击加入群聊');
    linkBtn.addEventListener('click', () => window.open(config.link, '_blank'));
    content.appendChild(linkBtn);
  }

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

/** Toast 提示 */
function showToast(text) {
  var existing = document.querySelector('.toast-msg');
  if (existing) existing.remove();
  var t = document.createElement('div');
  t.className = 'toast-msg';
  t.textContent = text;
  Object.assign(t.style, {
    position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(26,26,35,0.9)', color: '#fff', padding: '10px 20px',
    borderRadius: '20px', fontSize: '14px', zIndex: '300',
    opacity: '0', transition: 'opacity 0.3s ease',
  });
  document.body.appendChild(t);
  requestAnimationFrame(function () { t.style.opacity = '1'; });
  setTimeout(function () {
    t.style.opacity = '0';
    setTimeout(function () { t.remove(); }, 300);
  }, 2000);
}

/** 分享功能 */
function handleShare() {
  if (window.__analytics) window.__analytics.trackShare('click');
  var url = window.location.href;
  var title = document.title;
  if (navigator.share) {
    navigator.share({ title: title, url: url }).catch(function () {});
  } else {
    copyToClipboard(url);
    showToast('链接已复制，快去分享给同学吧 🎉');
  }
}

/** 复制到剪贴板 */
function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}
