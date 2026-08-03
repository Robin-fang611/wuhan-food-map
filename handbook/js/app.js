/* ============================================================
   LinkYou · 新生手册 —— 全站统一交互层
   ------------------------------------------------------------
   设计约定：
   1. 本文件是**普通 script**（非 ES module），16 个页面统一加载
      script 链恒为：js/config.js → js/app.js
   2. 全站通用行为（返回 / 手风琴 / 进群 / 分享 / 弹窗 / 底部栏 /
      搜索 / 滚动揭示）只在这里定义一次，改一处管 16 页。
   3. 不依赖任何外部库，不需要构建步骤，可直接拖拽部署。
   ============================================================ */
(function () {
  'use strict';
  /* 渐进增强标记：JS 一旦执行就给 <html> 加 .js，
     CSS 据此才把 .reveal 内容初始隐藏并做揭示动效；
     JS 未执行/失败则内容默认可见，绝不丢内容。 */
  document.documentElement.classList.add('js');

  /* ==========================================================
     -1. 老内核垫片
     微信安卓 X5 / 老版本 WebView 缺以下方法时，全站交互会直接抛错，
     这里用最小成本补齐，避免"整页点不动"这种致命故障。
     ========================================================== */
  if (window.NodeList && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
  }
  if (window.HTMLCollection && !HTMLCollection.prototype.forEach) {
    HTMLCollection.prototype.forEach = Array.prototype.forEach;
  }
  if (window.Element && !Element.prototype.remove) {
    Element.prototype.remove = function () {
      if (this.parentNode) this.parentNode.removeChild(this);
    };
  }
  if (!Element.prototype.closest) {
    Element.prototype.closest = function (sel) {
      var el = this;
      var matches = el.matches || el.msMatchesSelector || el.webkitMatchesSelector;
      while (el && el.nodeType === 1) {
        if (matches.call(el, sel)) return el;
        el = el.parentElement || el.parentNode;
      }
      return null;
    };
  }

  var CFG = window.__SOCIAL_CONFIG__ || { groups: [] };
  var SITE = window.__SITE_CONFIG__ || {};
  var SHARE_TEXT = SITE.shareText || '财大 2026 新生手册，报到/军训/选课攻略都在这，快看👉';

  /* ==========================================================
     0. 极简埋点（预留 endpoint，当前只落 console + 本地计数）
     ========================================================== */
  var analytics = {
    track: function (event, detail) {
      try {
        var key = 'jc_stat_' + event;
        var n = parseInt(localStorage.getItem(key) || '0', 10) + 1;
        localStorage.setItem(key, String(n));
      } catch (e) { /* 隐私模式忽略 */ }
      if (SITE.analyticsEndpoint) {
        try {
          navigator.sendBeacon(
            SITE.analyticsEndpoint,
            JSON.stringify({ e: event, d: detail || '', p: location.pathname, t: Date.now() })
          );
        } catch (e) { /* 忽略 */ }
      }
    },
    trackShare: function (detail) { this.track('share', detail); }
  };
  window.__analytics = analytics;

  /* ==========================================================
     1. Toast 轻提示
     ========================================================== */
  function showToast(text) {
    var existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();
    var t = document.createElement('div');
    t.className = 'toast-msg';
    t.textContent = text;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2200);
  }

  /* ==========================================================
     2. 剪贴板
     ========================================================== */
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  /* ==========================================================
     3. 社群弹窗（全站唯一实现）
     ------------------------------------------------------------
     - auto  : 自动弹出，0.8s 后可关；同一设备间隔 ≥24h 才再弹
     - manual: 点击进群按钮，立即可关、点遮罩可关
     ========================================================== */
  var AD_INTERVAL = 24 * 60 * 60 * 1000; // 24 小时

  function showSocialModal(mode) {
    var isAuto = mode === 'auto';
    var groups = CFG.groups || [];
    if (!groups.length) return;

    if (isAuto) {
      try {
        var last = parseInt(localStorage.getItem('jc_group_popup_at') || '0', 10);
        if (last && Date.now() - last < AD_INTERVAL) return;
      } catch (e) { /* 忽略 */ }
    }

    analytics.track(isAuto ? 'popup_auto' : 'group_click');

    var overlay = document.createElement('div');
    overlay.className = 'ad-overlay';

    var qrHtml = groups.map(function (g) {
      return '<div class="ad-qr-item">'
        + '<div class="ad-qr-frame"><img class="ad-qr-img" src="' + (g.qrCode || '') + '" alt="' + g.title + '" loading="lazy"></div>'
        + '<div class="ad-qr-name">' + g.title + '</div>'
        + '<div class="ad-qr-desc">' + (g.subtitle || '') + '</div>'
        + '</div>';
    }).join('');

    overlay.innerHTML =
      '<div class="ad-sheet">'
      + '<div class="ad-close-area"><button class="ad-close-btn" id="adCloseBtn" aria-label="关闭">✕</button></div>'
      + '<div class="ad-body">'
      + '<div class="ad-title">加入 <span class="highlight">2026 新生群</span></div>'
      + '<div class="ad-subtitle">师兄师姐在线答疑，选课 / 宿舍 / 社团全搞定</div>'
      + '<div class="ad-qr-row">' + qrHtml + '</div>'
      + '<p class="ad-hint">长按识别二维码加入</p>'
      + '</div></div>';

    var closeBtn = overlay.querySelector('#adCloseBtn');
    var dismissed = false;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      overlay.classList.remove('show');
      setTimeout(function () { overlay.remove(); }, 300);
      if (isAuto) {
        try { localStorage.setItem('jc_group_popup_at', String(Date.now())); } catch (e) { /* 忽略 */ }
      }
    }

    closeBtn.addEventListener('click', dismiss);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(); });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onEsc); }
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('show'); });

    // 自动弹窗：0.8s 内先不响应误触，之后正常；但 ✕ 始终可点、遮罩始终可关
    if (isAuto) {
      closeBtn.classList.add('warming');
      setTimeout(function () { closeBtn.classList.remove('warming'); }, 800);
    }
  }

  /* ==========================================================
     4. 分享（话术 + 链接；微信内降级为复制）
     ========================================================== */
  function currentShareUrl() {
    var base = SITE.origin || location.origin;
    var path = location.pathname.replace(/\/index\.html$/, '/');
    return base + path;
  }

  function shareLink() {
    var url = currentShareUrl();
    var text = SHARE_TEXT + ' ' + url;
    var isWeixin = /micromessenger/i.test(navigator.userAgent);
    analytics.trackShare('link');

    if (!isWeixin && navigator.share) {
      navigator.share({ title: document.title, text: SHARE_TEXT, url: url })
        .catch(function () { copyToClipboard(text); showToast('已复制，发给同学吧'); });
    } else {
      copyToClipboard(text);
      showToast(isWeixin ? '已复制，粘贴到群里发给同学' : '已复制，发给同学吧');
    }
  }

  /* ==========================================================
     4.5 分享海报（canvas 现画，长按保存）
     ------------------------------------------------------------
     手册的传播介质是微信群和朋友圈，图片比链接好使得多：
     不会被折叠、带二维码能直接进群。
     ========================================================== */
  function currentPageTitle() {
    var h1 = document.querySelector('.module-hero h1');
    if (h1) return h1.textContent.trim();
    return '2026 新生手册';
  }

  function currentPageDesc() {
    var p = document.querySelector('.module-hero p');
    if (p) return p.textContent.trim();
    var og = document.querySelector('meta[property="og:description"]');
    return og ? og.getAttribute('content') : '师兄师姐替你踩过的坑，都写在这了';
  }

  function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
    var line = '';
    var lines = 0;
    for (var i = 0; i < text.length; i++) {
      var test = line + text.charAt(i);
      if (ctx.measureText(test).width > maxW && line) {
        if (maxLines && lines >= maxLines - 1) {
          ctx.fillText(line.slice(0, -1) + '…', x, y);
          return y + lineH;
        }
        ctx.fillText(line, x, y);
        y += lineH; lines++;
        line = text.charAt(i);
      } else {
        line = test;
      }
    }
    if (line) { ctx.fillText(line, x, y); y += lineH; }
    return y;
  }

  function buildPoster(cb) {
    var W = 750, H = 1180;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var SANS = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    var SERIF = '"Songti SC","Noto Serif SC",STSong,serif';
    var INK = '#25231F', INK2 = '#5F5B52', INK3 = '#948F82', RED = '#C54E36', LINE = '#D8D1C3';

    // 底 + 纸纹
    ctx.fillStyle = '#F6F1E7'; ctx.fillRect(0, 0, W, H);
    var g = ctx.createRadialGradient(W * 0.22, H * 0.06, 0, W * 0.22, H * 0.06, W * 0.8);
    g.addColorStop(0, 'rgba(150,120,70,.07)'); g.addColorStop(1, 'rgba(150,120,70,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // 外框 + 四角
    var P = 46;
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.strokeRect(P, P, W - P * 2, H - P * 2);
    ctx.lineWidth = 6; ctx.strokeStyle = RED;
    var c = 44;
    [[P, P, 1, 1], [W - P, P, -1, 1], [P, H - P, 1, -1], [W - P, H - P, -1, -1]].forEach(function (q) {
      ctx.beginPath();
      ctx.moveTo(q[0] + c * q[2], q[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.lineTo(q[0], q[1] + c * q[3]);
      ctx.stroke();
    });

    var x = 96, y = 168;

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = INK3; ctx.font = '24px ' + SANS;
    ctx.fillText('中南财经政法大学 · 民间非官方', x, y);

    y += 78;
    ctx.fillStyle = INK; ctx.font = '900 74px ' + SERIF;
    ctx.fillText('LinkYou · 新生手册', x, y);

    y += 34;
    ctx.strokeStyle = RED; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 96, y); ctx.stroke();

    // 本页主题
    y += 92;
    ctx.fillStyle = RED; ctx.font = '700 26px ' + SANS;
    ctx.fillText('本 页 内 容', x, y);
    y += 62;
    ctx.fillStyle = INK; ctx.font = '900 52px ' + SERIF;
    y = wrapText(ctx, currentPageTitle(), x, y, W - x * 2, 68, 2);
    y += 22;
    ctx.fillStyle = INK2; ctx.font = '28px ' + SANS;
    y = wrapText(ctx, currentPageDesc(), x, y, W - x * 2, 46, 3);

    // 分隔
    y = Math.max(y + 50, 720);
    ctx.strokeStyle = LINE; ctx.lineWidth = 2;
    ctx.setLineDash([9, 9]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(W - x, y); ctx.stroke();
    ctx.setLineDash([]);

    // 二维码区
    var qy = y + 56;
    var qs = 214;
    var group = (CFG.groups && CFG.groups[0]) || {};

    function finish() {
      var tx = x + qs + 44;
      ctx.fillStyle = INK; ctx.font = '900 40px ' + SANS;
      ctx.fillText('扫码加 2026 新生群', tx, qy + 66);
      ctx.fillStyle = INK2; ctx.font = '26px ' + SANS;
      ctx.fillText('师兄师姐在线答疑', tx, qy + 114);
      ctx.fillText('选课 / 宿舍 / 社团全搞定', tx, qy + 156);
      ctx.fillStyle = INK3; ctx.font = '24px ' + SANS;
      ctx.fillText((SITE.origin || '').replace(/^https?:\/\//, ''), tx, qy + 206);

      ctx.fillStyle = INK3; ctx.font = '22px ' + SANS;
      ctx.textAlign = 'center';
      ctx.fillText('LinkYou · 与师兄师姐一同修订 · 2026', W / 2, H - 92);
      ctx.textAlign = 'left';

      cb(cv.toDataURL('image/jpeg', 0.9));
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, qy, qs, qs);
    ctx.strokeStyle = LINE; ctx.lineWidth = 2;
    ctx.strokeRect(x, qy, qs, qs);

    if (group.qrCode) {
      var img = new Image();
      img.onload = function () {
        ctx.drawImage(img, x + 8, qy + 8, qs - 16, qs - 16);
        finish();
      };
      img.onerror = function () {
        ctx.fillStyle = INK3; ctx.font = '24px ' + SANS;
        ctx.textAlign = 'center';
        ctx.fillText('二维码见站内', x + qs / 2, qy + qs / 2);
        ctx.textAlign = 'left';
        finish();
      };
      img.src = group.qrCode;
    } else {
      finish();
    }
  }

  function showPoster() {
    analytics.trackShare('poster');
    showToast('海报生成中…');
    buildPoster(function (dataUrl) {
      var ov = document.createElement('div');
      ov.className = 'poster-overlay';
      ov.innerHTML = '<div class="poster-box">'
        + '<img class="poster-img" src="' + dataUrl + '" alt="LinkYou新生手册分享海报">'
        + '<div class="poster-tip">长按图片保存 / 转发到群里</div>'
        + '<button class="poster-close" type="button">关闭</button>'
        + '</div>';
      document.body.appendChild(ov);
      document.body.classList.add('no-scroll');
      requestAnimationFrame(function () { ov.classList.add('show'); });
      function close() {
        ov.classList.remove('show');
        document.body.classList.remove('no-scroll');
        setTimeout(function () { ov.remove(); }, 240);
      }
      ov.querySelector('.poster-close').addEventListener('click', close);
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    });
  }

  function handleShare() {
    analytics.trackShare('click');
    if (document.querySelector('.share-sheet')) return;

    var sheet = document.createElement('div');
    sheet.className = 'share-sheet';
    sheet.innerHTML = '<div class="ss-box">'
      + '<div class="ss-t">转给同学</div>'
      + '<button class="ss-item" type="button" data-act="poster"><span class="ss-ic">🖼</span>'
      + '<span class="ss-txt"><b>生成分享海报</b><i>带二维码，发群里同学能直接进群</i></span></button>'
      + '<button class="ss-item" type="button" data-act="link"><span class="ss-ic">🔗</span>'
      + '<span class="ss-txt"><b>复制链接</b><i>粘贴到聊天窗口</i></span></button>'
      + '<button class="ss-cancel" type="button">取消</button>'
      + '</div>';

    document.body.appendChild(sheet);
    requestAnimationFrame(function () { sheet.classList.add('show'); });

    function close() {
      sheet.classList.remove('show');
      setTimeout(function () { sheet.remove(); }, 240);
    }
    sheet.querySelectorAll('.ss-item').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.dataset.act;
        close();
        if (act === 'poster') showPoster(); else shareLink();
      });
    });
    sheet.querySelector('.ss-cancel').addEventListener('click', close);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
  }

  /* ==========================================================
     5. 页面基础交互：返回 / 手风琴 / 进群 / 分享按钮
     ========================================================== */
  function bindBasics() {
    // 返回
    var backBtn = document.getElementById('backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (history.length > 1 && document.referrer) history.back();
        else location.href = 'index.html';
      });
    }

    // 手风琴 FAQ
    document.querySelectorAll('.acc-item').forEach(function (item) {
      var q = item.querySelector('.acc-q');
      var a = item.querySelector('.acc-a');
      if (!q || !a) return;
      q.addEventListener('click', function () {
        var isOpen = item.classList.toggle('open');
        a.style.maxHeight = isOpen ? a.scrollHeight + 'px' : '0';
        q.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    });

    // 进群入口（首页 + 15 个子页共用，修复子页死按钮）
    document.querySelectorAll('#groupEntry, .js-group-entry').forEach(function (node) {
      node.addEventListener('click', function () { showSocialModal('manual'); });
    });

    // 分享按钮
    document.querySelectorAll('.js-share, #shareBtn').forEach(function (node) {
      node.addEventListener('click', function (e) {
        e.preventDefault();
        handleShare();
      });
    });

    // 搜索入口（首页按钮 + 底部常驻栏共用）
    document.querySelectorAll('.js-search, #searchTrigger').forEach(function (node) {
      node.addEventListener('click', function (e) {
        e.preventDefault();
        openSearch();
      });
    });
  }

  /* ==========================================================
     6. 滚动揭示微动效（尊重 prefers-reduced-motion）
     ========================================================== */
  function bindReveal() {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var targets = document.querySelectorAll('.block, .mrow, .tl-row, .linkrow, .ticket');
    if (reduce || !('IntersectionObserver' in window)) {
      targets.forEach(function (n) { n.classList.add('revealed'); });
      return;
    }
    targets.forEach(function (n) { n.classList.add('reveal'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var node = entry.target;
        setTimeout(function () { node.classList.add('revealed'); }, Math.min(i, 5) * 60);
        io.unobserve(node);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    targets.forEach(function (n) { io.observe(n); });
    /* 安全网：无论 IO 是否触发，1.5s 后强制显示全部内容，杜绝永久隐形 */
    setTimeout(function () {
      targets.forEach(function (n) { n.classList.add('revealed'); });
    }, 1500);
  }

  /* ==========================================================
     6.2 全站搜索（search.json 懒加载 + 客户端模糊匹配）
     ------------------------------------------------------------
     索引由 tools/build-search.js 生成，182 条，点开搜索才拉取，
     不拖慢首屏；命中后跳转到目标页的具体锚点。
     ========================================================== */
  var SEARCH_DATA = null;
  var SEARCH_LOADING = false;
  var HOT_WORDS = ['宿舍', '军训', '食堂', '体测', '转专业', '助学金', '快递', '报到'];

  function loadSearchData(cb) {
    if (SEARCH_DATA) { cb(SEARCH_DATA); return; }
    if (SEARCH_LOADING) return;
    SEARCH_LOADING = true;

    function ok(d) { SEARCH_DATA = d; SEARCH_LOADING = false; cb(d); }
    function fail() { SEARCH_LOADING = false; cb(null); }

    /* 老 WebView 无 fetch，退回 XHR，保证搜索在任何内核都能用 */
    function viaXHR() {
      try {
        var x = new XMLHttpRequest();
        x.open('GET', 'search.json', true);
        x.onreadystatechange = function () {
          if (x.readyState !== 4) return;
          if (x.status >= 200 && x.status < 300) {
            try { ok(JSON.parse(x.responseText)); } catch (e) { fail(); }
          } else { fail(); }
        };
        x.onerror = fail;
        x.send();
      } catch (e) { fail(); }
    }

    if (typeof fetch === 'function') {
      fetch('search.json')
        .then(function (r) { return r.json(); })
        .then(ok)
        .catch(viaXHR);
    } else {
      viaXHR();
    }
  }

  function scoreItem(item, q) {
    var t = item.t || '';
    var k = item.k || '';
    var s = 0;
    if (t.indexOf(q) > -1) {
      s += 120 - Math.min(t.indexOf(q), 40);
    } else if (k.indexOf(q) > -1) {
      s += 60;
    } else if (q.length > 1) {
      // 逐字全命中才算模糊匹配，避免单字噪音
      for (var i = 0; i < q.length; i++) {
        if (k.indexOf(q.charAt(i)) < 0) return 0;
      }
      s += 24;
    } else {
      return 0;
    }
    if ((item.n || '').indexOf(q) > -1) s += 45;  // 搜「宿舍」时，宿舍指南页整体上浮
    if (item.q) s += 10;                          // 问答条目优先，用户多半在问问题
    return s;
  }

  function runSearch(q) {
    if (!SEARCH_DATA || !q) return [];
    var out = [];
    for (var i = 0; i < SEARCH_DATA.length; i++) {
      var sc = scoreItem(SEARCH_DATA[i], q);
      if (sc > 0) out.push({ s: sc, it: SEARCH_DATA[i] });
    }
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, 24).map(function (x) { return x.it; });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function highlight(text, q) {
    var safe = escapeHtml(text);
    if (!q) return safe;
    var idx = safe.indexOf(q);
    if (idx < 0) return safe;
    return safe.slice(0, idx) + '<em>' + safe.slice(idx, idx + q.length) + '</em>' + safe.slice(idx + q.length);
  }

  function openSearch() {
    if (document.querySelector('.search-overlay')) return;
    analytics.track('search_open');

    var ov = document.createElement('div');
    ov.className = 'search-overlay';
    ov.innerHTML =
      '<div class="search-head">'
      + '<div class="search-field"><span class="sf-ic">🔍</span>'
      + '<input class="search-input" id="searchInput" type="search" placeholder="搜宿舍、军训、体测、助学金…" autocomplete="off" enterkeyhint="search"></div>'
      + '<button class="search-cancel" type="button">取消</button>'
      + '</div>'
      + '<div class="search-body" id="searchBody"></div>';

    document.body.appendChild(ov);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(function () { ov.classList.add('show'); });

    var input = ov.querySelector('#searchInput');
    var body = ov.querySelector('#searchBody');

    function close() {
      ov.classList.remove('show');
      document.body.classList.remove('no-scroll');
      setTimeout(function () { ov.remove(); }, 240);
    }

    function renderHot() {
      body.innerHTML = '<div class="search-hot"><div class="sh-t">大家都在搜</div><div class="sh-row">'
        + HOT_WORDS.map(function (w) { return '<button class="hot-word" type="button">' + w + '</button>'; }).join('')
        + '</div></div>'
        + '<div class="search-tip">搜不到想要的？<b class="js-group-entry">进群直接问师兄师姐</b></div>';
      body.querySelectorAll('.hot-word').forEach(function (b) {
        b.addEventListener('click', function () {
          input.value = b.textContent;
          doSearch();
          input.focus();
        });
      });
      body.querySelectorAll('.js-group-entry').forEach(function (b) {
        b.addEventListener('click', function () { close(); showSocialModal('manual'); });
      });
    }

    function renderResults(list, q) {
      if (!list.length) {
        body.innerHTML = '<div class="search-empty"><div class="se-title">没找到「' + escapeHtml(q) + '」相关内容</div><div class="se-tip">试试更短的关键词，比如只搜「宿舍」「贷款」；或者直接进群问师兄师姐。</div><b class="js-group-entry">进群问问 ›</b></div>';
        body.querySelectorAll('.js-group-entry').forEach(function (b) {
          b.addEventListener('click', function () { close(); showSocialModal('manual'); });
        });
        return;
      }
      body.innerHTML = '<div class="search-count">找到 ' + list.length + ' 条</div>'
        + list.map(function (it) {
          return '<a class="sr-item" href="' + it.p + '#' + it.a + '">'
            + '<span class="sr-ic">' + it.i + '</span>'
            + '<span class="sr-main"><span class="sr-t">' + highlight(it.t, q) + '</span>'
            + '<span class="sr-d">' + highlight(it.d || '', q) + '</span></span>'
            + '<span class="sr-tag">' + it.n + '</span></a>';
        }).join('');
      body.querySelectorAll('.sr-item').forEach(function (a) {
        a.addEventListener('click', function () { analytics.track('search_hit', q); });
      });
    }

    var timer = null;
    function doSearch() {
      var q = input.value.trim().toLowerCase();
      if (!q) { renderHot(); return; }
      loadSearchData(function (d) {
        if (!d) { body.innerHTML = '<div class="search-empty">索引加载失败，检查下网络<br>或直接从首页分章找</div>'; return; }
        renderResults(runSearch(q), q);
      });
      if (SEARCH_DATA) renderResults(runSearch(q), q);
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(doSearch, 120);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timer);
        doSearch();
        input.blur();
      }
    });
    ov.querySelector('.search-cancel').addEventListener('click', close);
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });

    renderHot();
    loadSearchData(function () { /* 预热 */ });
    setTimeout(function () { input.focus(); }, 120);
  }

  /* ==========================================================
     6.5 开学必读清单（首页 · 勾选状态存 localStorage）
     ========================================================== */
  var MUST_KEY = 'jc_must_done';

  function readMustDone() {
    try { return JSON.parse(localStorage.getItem(MUST_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function bindMustList() {
    var list = document.getElementById('mustList');
    if (!list) return;
    var items = list.querySelectorAll('.mitem');
    var fill = document.getElementById('mustFill');
    var note = document.getElementById('mustNote');
    var done = readMustDone();

    function paint() {
      var n = 0;
      items.forEach(function (it) { if (it.classList.contains('done')) n++; });
      var total = items.length;
      var complete = total && n >= total;
      if (fill) {
        fill.style.width = (total ? Math.round(n / total * 100) : 0) + '%';
        fill.classList.toggle('complete', complete);
      }
      if (note) {
        note.textContent = complete
          ? '八件事全做完了，安心来报到 · 勾选记在这台设备上'
          : '已完成 ' + n + ' / ' + total + ' · 勾选会记在这台设备上';
        note.classList.toggle('complete', complete);
      }
    }

    items.forEach(function (it) {
      var id = it.dataset.mid;
      if (done.indexOf(id) > -1) it.classList.add('done');
      it.addEventListener('click', function (e) {
        // 点右侧「去看」跳转，不切换勾选状态
        if (e.target.closest('.mgo')) return;
        e.preventDefault();
        var on = it.classList.toggle('done');
        var cur = readMustDone();
        var i = cur.indexOf(id);
        if (on && i < 0) cur.push(id);
        if (!on && i > -1) cur.splice(i, 1);
        try { localStorage.setItem(MUST_KEY, JSON.stringify(cur)); } catch (err) { /* 忽略 */ }
        analytics.track('must_check', id + ':' + (on ? 1 : 0));
        paint();
      });
    });

    paint();
  }

  /* ==========================================================
     6.55 底部常驻栏（15 页统一注入）
     ------------------------------------------------------------
     旧版子页读完就是死路 —— 没有回手册的入口，更没有进群入口。
     这里统一补一条常驻栏：回手册 / 搜一下 / 进群。
     ========================================================== */
  function renderTabBar() {
    if (document.querySelector('.tabbar')) return;
    var isHome = document.body.dataset.page === 'index';
    var bar = document.createElement('nav');
    bar.className = 'tabbar';
    bar.innerHTML =
      '<a class="tab' + (isHome ? ' on' : '') + '" href="index.html"><span class="tab-ic">📖</span>手册</a>'
      + '<button class="tab js-search" type="button"><span class="tab-ic">🔍</span>搜一下</button>'
      + '<button class="tab tab-main js-group-entry" type="button"><span class="tab-ic">💬</span>进群问</button>';
    document.body.appendChild(bar);
  }

  /* ==========================================================
     6.56 本页速览（子页封面下方 · 横滑锚点条）
     ------------------------------------------------------------
     子页首屏被封面占满，进来只看得到一个返回键，不知道这页有什么，
     只能盲滑 —— 最长的两页有 7.9 屏和 6.9 屏。
     这里自动抓本页所有 .block[id] 的标题生成锚点，新增区块自动出现，
     不需要任何手工维护。
     ========================================================== */
  var HEAD_OFFSET = 12;

  function scrollToBlock(el) {
    if (!el) return;
    var bar = document.querySelector('.page-nav');
    var stick = bar && getComputedStyle(bar).position === 'sticky' ? bar.offsetHeight : 0;
    var y = el.getBoundingClientRect().top + window.pageYOffset - stick - HEAD_OFFSET;
    try {
      window.scrollTo({ top: y, behavior: 'smooth' });
    } catch (e) {
      window.scrollTo(0, y);
    }
  }

  /* chip 放得下的字数上限；超了才需要压缩 */
  var CHIP_MAX = 12;
  /* 这些开头只是语气，不含信息，撞上就往后取更具体的一段 */
  var WEAK_HEAD = /^(先搞清楚|先说清楚|一句话先说清|一句话|先看这一条|为什么|顺带一提|注意|提醒|说明|总览|概览|其他)/;

  /** 按语义断点把标题切成候选段 */
  function titleParts(raw) {
    var t = (raw || '').trim();
    t = t.replace(/^[（(]?[一二三四五六七八九十\d]+[）)]?\s*[、.．]\s*/, ''); // 「一、」「1. 」「（一）」
    t = t.replace(/^块[一二三四五六七八九十\d]+\s*[·・]\s*/, '');              // 「块一 · 」
    var parts = [];
    var raws = t.split(/[·・：:，,（(]/);
    for (var i = 0; i < raws.length; i++) {
      var s = raws[i].trim().replace(/[）)]$/, '');
      if (s) parts.push(s);
    }
    return { full: t, parts: parts.length ? parts : [t] };
  }

  function fitOrCut(s) {
    return s.length <= CHIP_MAX ? s : s.slice(0, CHIP_MAX - 1) + '…';
  }

  /**
   * 把一组区块标题压成互不重复的短 chip 文案。
   * 默认取第一段（通常是主题词），只有在第一段是语气词、或同页多个区块第一段撞车时，
   * 才换成更具体的后半段 —— 直接硬截断会切出「报到材料 · 一样都」这种半截话。
   */
  function shortenTitles(raws) {
    var metas = [];
    var headCount = {};
    for (var i = 0; i < raws.length; i++) {
      var m = titleParts(raws[i]);
      var head = m.parts[0];
      var tail = m.parts.length > 1 ? m.parts[m.parts.length - 1] : '';
      metas.push({ full: m.full, head: head, tail: tail });
      headCount[head] = (headCount[head] || 0) + 1;
    }

    var out = [];
    var used = {};
    for (var j = 0; j < metas.length; j++) {
      var it = metas[j];
      var pick;
      if (it.full.length <= CHIP_MAX) {
        pick = it.full;                                   // 本来就短，原样用
      } else if (WEAK_HEAD.test(it.head) && it.tail) {
        pick = it.tail;                                   // 开头是语气词，用后半段
      } else if (headCount[it.head] > 1 && it.tail) {
        pick = it.tail;                                   // 同页多个块同一个头，用后半段区分
      } else if (it.head.length >= 2 && it.head.length <= CHIP_MAX) {
        pick = it.head;                                   // 用主题词
      } else {
        pick = it.tail && it.tail.length <= CHIP_MAX ? it.tail : it.full;
      }
      pick = fitOrCut(pick);
      if (used[pick]) pick = fitOrCut(it.full);           // 仍撞名就退回完整标题
      var n = 2;
      while (used[pick]) { pick = fitOrCut(it.full) + ' ' + n; n++; }
      used[pick] = 1;
      out.push(pick);
    }
    return out;
  }

  function renderPageNav() {
    if (document.body.dataset.page === 'index') return;
    if (document.querySelector('.page-nav')) return;

    var blocks = document.querySelectorAll('.block[id]');
    var raws = [];
    var ids = [];
    for (var i = 0; i < blocks.length; i++) {
      var h = blocks[i].querySelector('h3');
      if (!h) continue;
      var raw = (h.textContent || '').trim();
      if (!raw) continue;
      raws.push(raw);
      ids.push(blocks[i].id);
    }
    var shorts = shortenTitles(raws);
    var items = [];
    for (var k = 0; k < ids.length; k++) {
      items.push({ id: ids[k], text: shorts[k] });
    }
    if (items.length < 3) return; // 少于 3 块不值得加导航

    var hero = document.querySelector('.module-hero');
    if (!hero || !hero.parentNode) return;

    var nav = document.createElement('nav');
    nav.className = 'page-nav';
    var html = '<span class="pn-label">本页</span><div class="pn-scroll">';
    for (var j = 0; j < items.length; j++) {
      html += '<button class="pn-chip" type="button" data-target="' + items[j].id + '">' + items[j].text + '</button>';
    }
    nav.innerHTML = html + '</div>';
    hero.parentNode.insertBefore(nav, hero.nextSibling);

    nav.addEventListener('click', function (e) {
      var chip = e.target.closest ? e.target.closest('.pn-chip') : null;
      if (!chip) return;
      var el = document.getElementById(chip.dataset.target);
      scrollToBlock(el);
      analytics.track('pagenav', chip.dataset.target);
    });

    // 滚动时高亮当前区块，并把对应 chip 滑进视野
    var scroller = nav.querySelector('.pn-scroll');
    var chips = nav.querySelectorAll('.pn-chip');
    var ticking = false;
    function syncActive() {
      ticking = false;
      var top = window.pageYOffset + 120;
      var cur = -1;
      for (var k = 0; k < items.length; k++) {
        var el = document.getElementById(items[k].id);
        if (el && el.offsetTop <= top) cur = k;
      }
      for (var m = 0; m < chips.length; m++) {
        var on = m === cur;
        if (on !== chips[m].classList.contains('on')) {
          chips[m].classList.toggle('on', on);
          if (on && scroller.scrollWidth > scroller.clientWidth) {
            var c = chips[m];
            scroller.scrollLeft = c.offsetLeft - scroller.clientWidth / 2 + c.offsetWidth / 2;
          }
        }
      }
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame ? requestAnimationFrame(syncActive) : setTimeout(syncActive, 60);
    }, { passive: true });
    syncActive();
  }

  /* ==========================================================
     6.57 章末导航（上一章 / 下一章 / 回目录）
     ------------------------------------------------------------
     六个页面读到底完全没有出口，其中两页恰恰是全站最长的。
     顺序读 __CHAPTERS__，改目录只改 config.js 一处。
     ========================================================== */
  function renderChapterFoot() {
    var page = (location.pathname.split('/').pop() || 'index.html');
    if (page === 'index.html' || page === '') return;
    if (document.querySelector('.chap-foot')) return;

    var list = window.__CHAPTERS__ || [];
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].page === page) { idx = i; break; }
    }
    if (idx < 0) return;

    var prev = idx > 0 ? list[idx - 1] : null;
    var next = idx < list.length - 1 ? list[idx + 1] : null;

    var box = document.createElement('nav');
    box.className = 'chap-foot';
    var html = '<div class="cf-title">这一章看完了</div><div class="cf-rows">';
    if (next) {
      html += '<a class="cf-row cf-next" href="' + next.page + '">'
        + '<span class="cf-dir">下一章</span>'
        + '<span class="cf-name"><b>' + next.no + '</b> ' + next.title + '</span>'
        + '<span class="cf-ar">›</span></a>';
    }
    if (prev) {
      html += '<a class="cf-row cf-prev" href="' + prev.page + '">'
        + '<span class="cf-dir">上一章</span>'
        + '<span class="cf-name"><b>' + prev.no + '</b> ' + prev.title + '</span>'
        + '<span class="cf-ar">›</span></a>';
    }
    html += '<a class="cf-row cf-home" href="index.html">'
      + '<span class="cf-dir">目录</span>'
      + '<span class="cf-name">回手册看全部 13 章</span>'
      + '<span class="cf-ar">›</span></a>';
    box.innerHTML = html + '</div>';

    // 插在页尾进群入口之前，不抢进群位
    var ge = document.getElementById('groupEntry');
    var footer = document.querySelector('.footer');
    var anchor = ge || footer;
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(box, anchor);
    } else {
      var app = document.querySelector('.app');
      if (app) app.appendChild(box);
    }

    box.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('.cf-row') : null;
      if (a) analytics.track('chapfoot', a.getAttribute('href'));
    });
  }

  /* ==========================================================
     6.58 回顶（滚过 1.5 屏浮出，避开底部常驻栏）
     ========================================================== */
  function renderBackTop() {
    if (document.querySelector('.to-top')) return;
    var btn = document.createElement('button');
    btn.className = 'to-top';
    btn.type = 'button';
    btn.setAttribute('aria-label', '回到顶部');
    btn.innerHTML = '↑';
    document.body.appendChild(btn);

    btn.addEventListener('click', function () {
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) {
        window.scrollTo(0, 0);
      }
      analytics.track('backtop');
    });

    var ticking = false;
    function sync() {
      ticking = false;
      btn.classList.toggle('on', window.pageYOffset > window.innerHeight * 1.5);
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame ? requestAnimationFrame(sync) : setTimeout(sync, 80);
    }, { passive: true });
    sync();
  }

  /* ==========================================================
     6.6 封面版次 / 更新日期（由 config.js 驱动，改一处全站生效）
     ========================================================== */
  function renderCoverMeta() {
    var ed = document.getElementById('metaEdition');
    var up = document.getElementById('metaUpdated');
    if (ed && SITE.edition) ed.textContent = SITE.edition;
    if (up && SITE.updatedAt) up.textContent = SITE.updatedAt + ' 更新';
  }

  /* ==========================================================
     7. 更新提示条（config.js 的 __UPDATE_CONFIG__ 驱动，改一处全站生效）
     ========================================================== */
  function renderUpdateBar() {
    var u = window.__UPDATE_CONFIG__;
    if (!u || !u.text) return;
    try {
      if (localStorage.getItem('jc_update_dismissed') === u.id) return;
    } catch (e) { /* 忽略 */ }

    var bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = '<span class="ub-dot"></span><span class="ub-text">' + u.text + '</span>'
      + '<button class="ub-close" aria-label="关闭">✕</button>';
    var app = document.querySelector('.app');
    if (!app) return;
    app.insertBefore(bar, app.firstChild);
    bar.querySelector('.ub-close').addEventListener('click', function () {
      bar.remove();
      try { localStorage.setItem('jc_update_dismissed', u.id); } catch (e) { /* 忽略 */ }
    });
  }

  /* ==========================================================
     7.5 无障碍基础设施（一次性注入，避免逐页改 HTML）
     ========================================================== */
  function installA11y() {
    var app = document.querySelector('.app');
    if (!app) return;

    // 跳至正文链接
    if (!document.querySelector('.skip-link')) {
      var skip = document.createElement('a');
      skip.className = 'skip-link';
      skip.href = '#jc-main';
      skip.textContent = '跳至正文';
      document.body.insertBefore(skip, document.body.firstChild);
    }

    // main 地标
    if (!app.hasAttribute('role')) {
      app.id = 'jc-main';
      app.setAttribute('role', 'main');
    }

    // 修复标题层级：子页 h1 后是 h3，插入隐藏的 h2 作为语义桥
    if (document.body.dataset.page !== 'index') {
      var firstBlock = document.querySelector('.block');
      var prevHasHeading = firstBlock && firstBlock.previousElementSibling &&
        (' ' + (firstBlock.previousElementSibling.className || '') + ' ').indexOf(' sr-only ') !== -1;
      if (firstBlock && !prevHasHeading) {
        var h2 = document.createElement('h2');
        h2.className = 'sr-only';
        h2.textContent = '本章内容';
        firstBlock.parentNode.insertBefore(h2, firstBlock);
      }
    }

    // html lang 兜底
    if (!document.documentElement.getAttribute('lang')) {
      document.documentElement.setAttribute('lang', 'zh-CN');
    }
  }

  /* ==========================================================
     6.60 主题切换器（第 6 轮预览期 · 正式版可保留为「外观」设置）
     ------------------------------------------------------------
     <html data-theme="x"> 覆写见 css/baibaoxiang.css 末尾；这里只负责
     注入浮动切换器 + localStorage 持久化，选中即落本机，刷新不忘。
     ========================================================== */
  var THEME_KEY = 'jc_theme';
  var THEMES = [
    { key: '',   label: '当前' },
    { key: 'a',  label: '手账暖' },
    { key: 'b',  label: '杂志风' },
    { key: 'c',  label: '极简读' },
    { key: 'd',  label: '夜读' }
  ];
  function getSavedTheme() {
    try { return localStorage.getItem(THEME_KEY) || ''; } catch (e) { return ''; }
  }
  function applyTheme(key) {
    if (key) document.documentElement.setAttribute('data-theme', key);
    else document.documentElement.removeAttribute('data-theme');
  }
  function renderThemeSwitcher() {
    if (document.querySelector('.theme-sw')) return;
    var saved = getSavedTheme();
    var wrap = document.createElement('div');
    wrap.className = 'theme-sw';
    var html = '<button class="theme-sw-btn" type="button" aria-label="切换外观主题">🎨</button>'
      + '<div class="theme-sw-pop" hidden>'
      + '<div class="theme-sw-t">外观预览</div>';
    THEMES.forEach(function (t) {
      html += '<button class="theme-sw-opt' + (t.key === saved ? ' on' : '') + '" type="button" data-k="'
        + t.key + '">' + t.label + '</button>';
    });
    html += '</div>';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    var btn = wrap.querySelector('.theme-sw-btn');
    var pop = wrap.querySelector('.theme-sw-pop');
    btn.addEventListener('click', function () { pop.hidden = !pop.hidden; });
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('.theme-sw-opt');
      if (!b) return;
      var k = b.getAttribute('data-k');
      try { localStorage.setItem(THEME_KEY, k); } catch (e) {}
      applyTheme(k);
      pop.querySelectorAll('.theme-sw-opt').forEach(function (o) {
        o.classList.toggle('on', o.getAttribute('data-k') === k);
      });
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) pop.hidden = true;
    });
  }

  /* ==========================================================
     7b. 杂志目录抽屉（第 7 轮 · 招牌交互）
     ========================================================== */
  function renderTocDrawer() {
    var page = document.body.dataset.page;
    if (!page || page === 'index' || page === 'growth') return;
    var appbar = document.querySelector('.appbar');
    if (!appbar) return;

    if (!document.getElementById('tocBtn')) {
      var btn = document.createElement('button');
      btn.id = 'tocBtn';
      btn.type = 'button';
      btn.className = 'toc-btn';
      btn.setAttribute('aria-label', '打开目录');
      btn.innerHTML = '目录 <span aria-hidden="true">☰</span>';
      var shareBtn = document.getElementById('shareBtn');
      if (shareBtn) appbar.insertBefore(btn, shareBtn);
      else appbar.appendChild(btn);
      btn.addEventListener('click', openToc);
    }

    if (document.getElementById('tocDrawer')) return;
    var CH = window.__CHAPTERS__ || [];
    var cur = page + '.html';
    var items = CH.map(function (c, i) {
      var isCur = c.page === cur ? ' cur' : '';
      return '<a class="toc-item' + isCur + '" href="' + c.page + '">' +
        '<span class="tn">' + c.no + '</span>' +
        '<span class="tt">' + c.title + '</span>' +
        '<span class="td">第 ' + (i + 1) + ' 章</span></a>';
    }).join('');
    var drawer = document.createElement('div');
    drawer.id = 'tocDrawer';
    drawer.className = 'toc-drawer';
    drawer.innerHTML =
      '<div class="toc-panel" role="dialog" aria-label="目录">' +
        '<div class="toc-head"><div><div class="th-t">本期目录</div><div class="th-e">Contents</div></div>' +
        '<button class="toc-close" id="tocClose" aria-label="关闭">✕</button></div>' +
        '<div class="toc-list">' + items + '</div>' +
        '<div class="toc-foot">中南财经政法大学 · LinkYou · 2026<br>点击章节即可跳转阅读</div>' +
      '</div>';
    document.body.appendChild(drawer);
    drawer.addEventListener('click', function (e) { if (e.target === drawer) closeToc(); });
    var closeEl = document.getElementById('tocClose');
    if (closeEl) closeEl.addEventListener('click', closeToc);
    drawer.querySelectorAll('.toc-item').forEach(function (a) {
      a.addEventListener('click', function () { closeToc(); });
    });
  }
  function openToc() {
    var d = document.getElementById('tocDrawer');
    if (!d) return;
    d.classList.add('show');
    document.body.classList.add('no-scroll');
  }
  function closeToc() {
    var d = document.getElementById('tocDrawer');
    if (!d) return;
    d.classList.remove('show');
    document.body.classList.remove('no-scroll');
  }

  /* ==========================================================
     8. 启动
     ========================================================== */
  function init() {
    applyTheme(getSavedTheme()); // 先应用已存主题，避免闪烁
    installA11y();
    renderUpdateBar();
    renderCoverMeta();
    renderTabBar();   // 必须在 bindBasics 之前：栏内按钮要靠它统一绑事件
    renderThemeSwitcher();
    renderPageNav();
    renderTocDrawer();
    renderChapterFoot();  // 必须在 bindBasics 之前：章末进群按钮要统一绑事件
    renderBackTop();
    bindBasics();
    bindMustList();
    bindReveal();
    analytics.track('pv');

    // 带 hash 进来（搜索跳转 / 外链）时，手动修正落点避开吸顶导航
    if (location.hash && location.hash.length > 1) {
      var target = document.getElementById(location.hash.slice(1));
      if (target) setTimeout(function () { scrollToBlock(target); }, 80);
    }

    // 首页首次进入 2s 后自动弹群（间隔 ≥24h）
    if (document.body.dataset.page === 'index') {
      setTimeout(function () { showSocialModal('auto'); }, 2000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ==========================================================
     对外暴露（供页面内联脚本或后续模块调用）
     ========================================================== */
  window.Jiangcheng = {
    showToast: showToast,
    copyToClipboard: copyToClipboard,
    showSocialModal: showSocialModal,
    handleShare: handleShare,
    showPoster: showPoster,
    openSearch: openSearch,
    shareUrl: currentShareUrl,
    analytics: analytics
  };
})();
