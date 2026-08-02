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

  function handleShare() {
    analytics.trackShare('click');
    var url = currentShareUrl();
    var text = SHARE_TEXT + ' ' + url;
    var isWeixin = /micromessenger/i.test(navigator.userAgent);

    if (!isWeixin && navigator.share) {
      navigator.share({ title: document.title, text: SHARE_TEXT, url: url })
        .catch(function () { copyToClipboard(text); showToast('已复制，发给同学吧'); });
    } else {
      copyToClipboard(text);
      showToast(isWeixin ? '已复制，粘贴到群里发给同学' : '已复制，发给同学吧');
    }
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
    bindBasics();
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
    shareUrl: currentShareUrl,
    analytics: analytics
  };
})();
