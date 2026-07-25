/**
 * core/ui.js — 通用 UI 组件
 *
 * 从 common.js 提取：启动屏、Toast、社群弹窗、分享功能。
 */

import { el, Icons } from './dom.js';

/** Toast 轻提示 */
export function showToast(text) {
  const existing = document.querySelector('.toast-msg');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast-msg';
  t.textContent = text;
  Object.assign(t.style, {
    position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(26,26,35,0.9)', color: '#fff', padding: '10px 20px',
    borderRadius: '20px', fontSize: '14px', zIndex: '300',
    opacity: '0', transition: 'opacity 0.3s ease',
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; });
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 2000);
}

/** 创建启动屏 */
export function createSplash(title, subtitle) {
  const splash = el('div', { className: 'splash-screen', id: 'splash' }, [
    el('div', { className: 'splash-logo' }, '味'),
    el('div', { className: 'splash-title' }, title || ''),
    el('div', { className: 'splash-subtitle' }, subtitle || ''),
    el('div', { className: 'loading-dots', style: { marginTop: '8px' } }, [
      el('span'), el('span'), el('span'),
    ]),
  ]);
  document.body.appendChild(splash);

  setTimeout(() => {
    const s = document.getElementById('splash');
    if (s) s.classList.add('hide');
    setTimeout(() => s && s.remove(), 500);
  }, 800);
}

/** 社群弹窗（全屏覆盖，旧的加群方式） */
export function showSocialModal() {
  const cfg = window.__SOCIAL_CONFIG__;
  const groups = (cfg && cfg.groups) ? cfg.groups : [];
  const overlay = el('div', { className: 'social-overlay' });

  const topbar = el('div', { className: 'social-topbar' });
  topbar.appendChild(el('div', { className: 'social-title' }, '加入社群'));
  const closeBtn = el('div', { className: 'social-close' });
  closeBtn.innerHTML = Icons.close;
  closeBtn.addEventListener('click', () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 200);
  });
  topbar.appendChild(closeBtn);
  overlay.appendChild(topbar);

  const page = el('div', { className: 'social-page' });
  const head = el('div', { className: 'page-head' });
  head.appendChild(el('h2', {}, '扫码加入我们'));
  head.appendChild(el('p', {}, '挑一个你最感兴趣的群，长按或扫一扫'));
  page.appendChild(head);

  groups.forEach((g) => {
    const card = el('div', { className: 'qr-card' });
    card.appendChild(el('div', { className: 'qr-name' }, g.title));
    card.appendChild(el('div', { className: 'qr-desc' }, g.subtitle || ''));
    if (g.qrCode) {
      card.appendChild(el('img', { src: g.qrCode, alt: g.title, loading: 'eager' }));
      card.appendChild(el('div', { className: 'qr-tip' }, '微信扫码加入'));
    } else {
      card.appendChild(el('div', { style: { width: '200px', height: '200px', margin: '0 auto', background: 'linear-gradient(135deg, #F9F4DF, #FFF7ED)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' } }, '💬'));
      card.appendChild(el('div', { className: 'qr-tip', style: { color: '#aaa' } }, '二维码待上传'));
    }
    page.appendChild(card);
  });

  overlay.appendChild(page);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeBtn.click();
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('show'));
  });
}

/** 预加载二维码图片 */
export function preloadQRCode() {
  const cfg = window.__SOCIAL_CONFIG__;
  if (!cfg || !cfg.groups) return;
  cfg.groups.forEach((g) => {
    if (g.qrCode) {
      const i = new Image(); i.src = g.qrCode;
    }
  });
}

/** 复制到剪贴板 */
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

export function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

/** 分享功能 */
export function handleShare() {
  if (window.__analytics) window.__analytics.trackShare('click');
  const url = window.location.href;
  const title = document.title;
  if (navigator.share) {
    navigator.share({ title, url }).catch(() => {});
  } else {
    copyToClipboard(url);
    showToast('链接已复制，快去分享给同学吧');
  }
}

/**
 * 社群广告弹窗（Bottom Sheet）
 *
 * @param {string} pageName - 页面标识，用于 localStorage 去重
 * @param {object} [opts]
 * @param {boolean} [opts.countdown=true] - 是否有 3 秒倒计时，false 时直接显示关闭按钮
 */
export function showAdPopup(pageName, opts = {}) {
  const useCountdown = opts.countdown !== false;

  // 仅对自动弹窗做去重
  if (useCountdown) {
    const storageKey = 'food_map_ad_' + pageName;
    try {
      if (localStorage.getItem(storageKey) === new Date().toISOString().slice(0, 10)) return;
    } catch (e) { /* ignore */ }
  }

  const cfg = window.__SOCIAL_CONFIG__;
  const groups = (cfg && cfg.groups) ? cfg.groups : [];
  if (groups.length === 0) return;

  const overlay = document.createElement('div');
  overlay.className = 'ad-overlay';

  const qrHtml = groups.map((g, i) => {
    const bgStyle = i === 0
      ? 'background:#1a1a1f;padding:8px;border-radius:12px;'
      : 'border:1px solid #e8e8e8;border-radius:12px;';
    return '<div class="ad-qr-item"><div style="' + bgStyle + '"><img class="ad-qr-img" src="' + (g.qrCode || '') + '" alt="' + g.title + '" loading="eager" style="display:block;width:100%;border-radius:8px;"></div><div class="ad-qr-name">' + g.title + '</div><div class="ad-qr-desc">' + (g.subtitle || '') + '</div></div>';
  }).join('');

  overlay.innerHTML = '<div class="ad-sheet"><div class="ad-close-area"><div class="ad-close-btn ' + (useCountdown ? 'countdown' : 'skip') + '" id="ad-close-btn">' + (useCountdown ? '3' : '✕') + '</div></div><div class="ad-body"><div class="ad-title">✨ 加入武汉新生群</div><div class="ad-subtitle">师兄师姐在线答疑 · 校园资讯抢先看</div><div class="ad-qr-row">' + qrHtml + '</div><p class="ad-hint">👇 长按识别二维码加入/关注</p></div></div>';

  const closeBtn = overlay.querySelector('#ad-close-btn');

  function dismiss() {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 350);
    if (useCountdown) {
      try {
        const storageKey = 'food_map_ad_' + pageName;
        localStorage.setItem(storageKey, new Date().toISOString().slice(0, 10));
      } catch (e) { /* ignore */ }
    }
  }

  if (useCountdown) {
    let countdown = 3;
    const timer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        closeBtn.textContent = countdown;
      } else {
        clearInterval(timer);
        closeBtn.className = 'ad-close-btn skip';
        closeBtn.textContent = '✕ 关闭';
        closeBtn.addEventListener('click', dismiss);
      }
    }, 1000);
  } else {
    closeBtn.addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });
  }

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 50);
}
