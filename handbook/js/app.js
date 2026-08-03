/* ============================================================
   江城 · 新生手册 —— 全站统一交互层
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
    ctx.fillText('江城 · 新生手册', x, y);

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
      ctx.fillText('江城编辑部 · 与师兄师姐一同修订 · 2026', W / 2, H - 92);
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
        + '<img class="poster-img" src="' + dataUrl + '" alt="江城新生手册分享海报">'
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
    fetch('search.json')
      .then(function (r) { return r.json(); })
      .then(function (d) { SEARCH_DATA = d; SEARCH_LOADING = false; cb(d); })
      .catch(function () { SEARCH_LOADING = false; cb(null); });
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
        body.innerHTML = '<div class="search-empty">没找到「' + escapeHtml(q) + '」相关内容<br><b class="js-group-entry">进群问问师兄师姐 ›</b></div>';
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
      if (fill) fill.style.width = (total ? Math.round(n / total * 100) : 0) + '%';
      if (note) {
        note.textContent = n >= total && total
          ? '八件事全做完了，安心来报到 · 勾选记在这台设备上'
          : '已完成 ' + n + ' / ' + total + ' · 勾选会记在这台设备上';
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
     8. 启动
     ========================================================== */
  function init() {
    renderUpdateBar();
    renderCoverMeta();
    renderTabBar();   // 必须在 bindBasics 之前：栏内按钮要靠它统一绑事件
    bindBasics();
    bindMustList();
    bindReveal();
    analytics.track('pv');

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
