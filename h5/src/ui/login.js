// 登录视图（小程序式）：手机验证码主链路（图形验证码→短信验证码→登录/注册）+ 微信并行入口。
// 全部用 h() 构建（禁止 innerHTML，防 XSS §8）；动态文本走 textContent；视觉只用 tokens.css 变量。
// 设计依据：docs/design/account-auth-design.md。后端密钥仅在服务端，前端只持登录态 token。

import { h, toast } from './dom.js';
import * as authApi from '../api/auth-client.js';
import { auth } from '../core/auth.js';

const PHONE_RE = /^1\d{10}$/;

export function LoginView({ onLoggedIn } = {}) {
  const root = h('div', { class: 'login-view' });

  let captchaToken = '';
  let countdownTimer = null;

  // —— 控件 ——
  const captchaImg = h('img', { class: 'login-captcha-img', alt: '图形验证码，请抄写图中的字母数字', width: '110', height: '40' });
  const captchaInput = h('input', { class: 'ac-input login-input', type: 'text', maxlength: '6', placeholder: '输入图中字符', 'aria-label': '图形验证码', autocomplete: 'off' });
  const phoneInput = h('input', { class: 'ac-input login-input', type: 'tel', inputmode: 'numeric', maxlength: '11', placeholder: '请输入手机号', 'aria-label': '手机号', autocomplete: 'tel' });
  const smsInput = h('input', { class: 'ac-input login-input', type: 'text', inputmode: 'numeric', maxlength: '6', placeholder: '6 位短信验证码', 'aria-label': '短信验证码', autocomplete: 'one-time-code' });
  const smsBtn = h('button', { class: 'btn btn-ghost login-sms-btn', type: 'button', text: '获取短信验证码' });
  const refreshBtn = h('button', { class: 'btn btn-ghost login-captcha-refresh', type: 'button', text: '换一张' });
  const submitBtn = h('button', { class: 'btn btn-primary btn-block login-submit', type: 'submit', text: '登录 / 注册' });

  // —— 图形验证码刷新 ——
  async function refreshCaptcha() {
    try {
      const data = await authApi.requestCaptcha();
      if (!data || !data.token) { toast('验证码加载失败，请重试'); return; }
      captchaToken = data.token;
      captchaImg.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(data.svg); // data URI，非 HTML 注入
    } catch {
      toast('网络开小差，验证码加载失败');
    }
  }
  refreshBtn.addEventListener('click', refreshCaptcha);

  // —— 60s 倒计时（纯 UX；真实频控在服务端）——
  function startCountdown(sec) {
    let left = sec;
    smsBtn.disabled = true;
    smsBtn.textContent = `${left}s 后重发`;
    countdownTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) { clearInterval(countdownTimer); smsBtn.disabled = false; smsBtn.textContent = '获取短信验证码'; }
      else smsBtn.textContent = `${left}s 后重发`;
    }, 1000);
  }

  // —— 获取短信验证码 ——
  smsBtn.addEventListener('click', async () => {
    const phone = phoneInput.value.trim();
    if (!PHONE_RE.test(phone)) { toast('请输入正确的 11 位手机号'); phoneInput.focus(); return; }
    if (!captchaToken) { toast('请先完成图形验证'); refreshCaptcha(); return; }
    const cap = captchaInput.value.trim();
    if (!cap) { toast('请先输入图形验证码'); captchaInput.focus(); return; }

    smsBtn.disabled = true;
    try {
      const r = await authApi.sendSmsCode({ phone, captchaToken, captchaInput: cap, scene: 'login' });
      if (!r || !r.ok) { toast(r && r.error || '短信发送失败'); refreshCaptcha(); return; } // 失败强制刷新图形验证码
      if (r.devCode) toast('开发验证码：' + r.devCode); // 仅开发环境返回，生产绝不返回
      startCountdown(60);
      toast('验证码已发送，请查收短信');
    } catch {
      toast('网络开小差，请稍后重试');
    } finally {
      if (smsBtn.textContent.indexOf('s 后重发') === -1) smsBtn.disabled = false; // 倒计时中不解锁
    }
  });

  // —— 提交：手机登录 / 注册 ——
  const form = h('form', { class: 'ac-form login-form', novalidate: 'novalidate' }, [
    h('label', { class: 'login-field' }, [h('span', { class: 'login-label', text: '手机号' }), phoneInput]),
    h('label', { class: 'login-field' }, [
      h('span', { class: 'login-label', text: '图形验证（人机验证）' }),
      h('div', { class: 'login-captcha-row' }, [captchaImg, captchaInput, refreshBtn]),
    ]),
    h('label', { class: 'login-field' }, [
      h('span', { class: 'login-label', text: '短信验证码' }),
      h('div', { class: 'login-sms-row' }, [smsInput, smsBtn]),
    ]),
    submitBtn,
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = phoneInput.value.trim();
    const code = smsInput.value.trim();
    if (!PHONE_RE.test(phone)) { toast('请输入正确的 11 位手机号'); return; }
    if (!/^\d{6}$/.test(code)) { toast('请输入 6 位短信验证码'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = '登录中…';
    try {
      const r = await authApi.loginWithPhone({ phone, smsCode: code, scene: 'login' });
      if (!r || !r.ok) { toast(r && r.error || '登录失败'); submitBtn.disabled = false; submitBtn.textContent = '登录 / 注册'; return; }
      auth.applyRemoteSession({ id: r.user.id, nickname: r.user.nickname, phoneMasked: r.user.phoneMasked, token: r.token });
      authApi.setStoredToken(r.token);
      toast(`欢迎，${r.user.nickname}！`);
      if (onLoggedIn) onLoggedIn();
    } catch {
      toast('网络开小差，登录失败');
      submitBtn.disabled = false; submitBtn.textContent = '登录 / 注册';
    }
  });

  // —— 微信登录（并行入口）——
  const wechatBtn = h('button', { class: 'btn login-wechat-btn btn-block', type: 'button', text: '微信登录' });
  wechatBtn.addEventListener('click', async () => {
    const state = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
    sessionStorage.setItem('wechatState', state);
    try {
      const r = await authApi.requestWechatUrl(state);
      if (!r || !r.ok) { toast(r && r.error || '微信登录暂不可用'); return; } // 未配置：如实报错，不假装能登录
      window.location.href = r.url; // 跳转微信授权页；授权后由 /auth/wechat/callback 重定向回前端落地页
    } catch {
      toast('网络开小差，微信登录失败');
    }
  });

  // —— 组装 ——
  root.appendChild(h('div', { class: 'login-head' }, [
    h('div', { class: 'login-seal', text: '味' }),
    h('div', { class: 'login-title', text: '欢迎来到蛮有味' }),
    h('div', { class: 'login-sub', text: '武汉好吃的，真人探过的' }),
  ]));
  root.appendChild(form);
  root.appendChild(h('div', { class: 'login-divider', text: '或' }));
  root.appendChild(wechatBtn);
  root.appendChild(h('div', { class: 'login-agreement muted', text: '登录即代表同意《用户协议》《隐私政策》' }));

  refreshCaptcha(); // 初始加载图形验证码
  return root;
}
