# 蛮有味 ·「账号登录体系」前端设计规格

> 文档版本：v1.0（设计稿 · 仅供评审，不含生产代码）
> 作者：前端 UI/UX 设计子代理
> 适用：H5 移动端（容器最大宽 `--maxw: 480px`）
> 关联规格：`SPEC.md` §8「安全红线」、`SPEC.md`「账号与登录」
> 关联文档：`shop-upload-design.md`（结构风格参照，已预先对齐格式）

---

## 0. 一句话目标与用户故事

**一句话目标**：让用户在蛮有味里「小程序式」地完成手机验证码登录 / 注册，并可选微信授权登录，全程密钥只在服务端、前端零密钥、零 innerHTML（防 XSS）。

**用户故事（As a user）**：
> 我是一个在武汉上学、爱探店的学生。我想把发现的野店贡献给蛮有味，也想攒积分、留收藏。我不懂技术，但我希望登录过程像微信小程序一样顺：填手机号 → 看到一张带字母数字的图（我把图里的字输进去证明我不是机器人）→ 点「获取短信验证码」→ 收到 6 位短信 → 输完就登录。我也想省事，点一个「微信登录」直接授权就行。我更希望它**别乱发短信、别泄露我的信息、别假装成功**。

**安全红线（项目 §8，强制遵守）**：
- 所有密钥（JWT 密钥 / 微信 AppSecret / 短信密钥）**只进服务端 env**，绝不进前端包、绝不进仓库，前端不持有任何密钥。
- 不伪造网络分支：**未配置后端 provider（短信网关 / 微信 AppSecret / JWT 密钥）时，后端明确报错（5xx + 明确错误文案），前端如实以 error 态展示，不假装发送成功、不假装登录成功。**
- 所有动态文本经 `h()` 的 `text` / `textContent` 渲染，**禁止 innerHTML 拼接**（防 XSS §8）。

**非目标（本期不做，已注明假设）**：
- 不做密码登录 / 找回密码（本期只做「手机验证码」与「微信授权」两种无密码入口）；
- 不做第三方登录的账号绑定解绑 UI（微信 openid/unionid 后端自动合并，前端不暴露绑定关系）；
- 不做登录后的「个人中心 / 我的收藏 / 积分」页面（本期只交付登录主链路与成功态落地，后续视图另起设计稿）。

---

## 1. 用户流程图（ASCII）

```
┌──────────────────────────────────────────────────────┐
│ 任意需要登录的入口（首页「我的」/ 贡献店铺 / 收藏）     │
│   → 未登录 → 路由到登录视图 loginView                   │
└──────────────────────────┬───────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────┐
│ 登录视图 loginView（两种并行入口）                      │
│  ┌─────────────────────┐   ┌──────────────────────┐   │
│  │ ① 手机验证码登录      │   │ ② 微信登录（snsapi）   │   │
│  │  [手机号 input]      │   │  [微信登录 按钮]      │   │
│  │  [图形验证码 img+框] │   │  → 跳转微信授权页     │   │
│  │  [获取短信码 btn]    │   │  → /wechat/callback  │   │
│  │  [短信验证码 input]  │   │  → 换 token 落地      │   │
│  │  [登录/注册 btn]     │   │                       │   │
│  └─────────┬───────────┘   └───────────┬───────────┘   │
└────────────┼───────────────────────────┼───────────────┘
             │ 手机主链路                   │ 微信链路
             ▼                            ▼
   ┌───────────────────┐        ┌──────────────────────┐
   │ idle              │        │ GET /auth/wechat/url  │
   │  → captcha        │        │ 前端 window.location  │
   │  → smsSent        │        │ 跳转授权页             │
   │  → verified       │        └──────────┬───────────┘
   │  → loggedIn       │                   │ 用户授权返回
   │  → error(可回退)  │        ┌──────────▼───────────┐
   └───────────────────┘        │ GET /auth/wechat/    │
                                │   callback?code&state│
                                │ 后端 code→openid/    │
                                │   unionid→JWT        │
                                └──────────┬───────────┘
                                           ▼
                                   ┌───────────────────┐
                                   │ 前端带 token 落地   │
                                   │ → loggedIn         │
                                   └─────────┬─────────┘
                                             │
                              ┌──────────────┴──────────────┐
                              ▼                             ▼
                       登录成功态 success               失败/无 provider
                       （欢迎语 + 用户信息）            error 态（如实报错）
```

**微信链路说明**：前端只负责「向 `GET /auth/wechat/url` 要授权页 URL → 跳转 → 在 `callback` 落地页用后端返回的 token 落地」。AppSecret 仅服务端持有，前端全程看不到。`state` 用于防 CSRF（前端生成随机串存入 sessionStorage，落地页校验一致）。

---

## 2. 信息架构（两种并行入口 → 成功态）

```
loginView（独立视图，容器最大宽 --maxw，可经 ctx.goLogin 进入；顶部有返回）
 ├─ 品牌条 / 标题区（蛮有味 · 登录/注册）
 ├─ 手机登录区 phoneLogin（主链路，默认展开）
 │   ├─ phoneField（手机号 input，type=tel，maxlength=11）
 │   ├─ captchaField（图形验证码：img 预览 + 输入框 + 刷新按钮）
 │   │     └─ img 来自 POST /auth/captcha 的 svg（服务端自绘，无外部依赖）
 │   ├─ smsField（短信验证码 input + 「获取短信验证码」按钮）
 │   │     └─ 按钮含 60s 倒计时；点击前须先通过图形验证码
 │   └─ submitBtn（登录/注册，type=submit）
 ├─ 分隔符「或」
 ├─ wechatLogin（微信登录按钮，snsapi_userinfo）
 ├─ 协议声明（登录即代表同意《用户协议》《隐私政策》）
 └─ 状态覆盖 / 行内提示
      ├─ loading（印章红波纹）
      ├─ error（toast + 行内重试/重发）
      └─ success（欢迎语 + 用户信息 + 进入首页）
```

**入口放置决策（明确）**：登录视图是一个独立顶层视图（不是首页内嵌卡片），由路由层在「需要登录却未登录」时弹出/跳转。首页「我的」入口点击后若未登录即 `ctx.goLogin()`。理由：登录是全局前置能力，不应污染首页内容区；与贡献店铺「可选登录」不同，登录视图需独占注意力。

---

## 3. 组件树（h() 伪代码，禁止 innerHTML）

> 约定：`h(tag, attrs, children)` 来自 `h5/src/ui/dom.js`。所有**动态文本**走 `text` 属性或 `document.createTextNode`，绝不拼接 innerHTML（防 XSS §8）。`ctx` 为视图上下文，含 `goBack`、`goHome`、`onPhoneLogin(payload)`、`onWechatLogin()`、`onCaptchaRefresh()`、`requestWechatUrl()`。图形验证码图片用 `img` 标签的 `src = data:image/svg+xml;utf8,...`（来自 `/auth/captcha` 的 `svg` 字符串），图片本身非 innerHTML 注入，安全。

### 3.1 登录视图（手机 + 微信 双入口）

```js
export function LoginView(ctx) {
  const { goBack, onPhoneLogin, onWechatLogin, onCaptchaRefresh } = ctx;
  const root = h('div', { class: 'login-view' });

  // 顶部返回
  root.appendChild(h('div', { class: 'detail-top' }, [
    h('button', { class: 'nav-btn', type: 'button', text: '返回', onclick: goBack }),
    h('span', { class: 'detail-top-title', text: '登录 / 注册' })
  ]));

  // 品牌标题区
  root.appendChild(h('div', { class: 'login-head' }, [
    h('div', { class: 'login-seal', text: '味' }),
    h('div', { class: 'login-title', text: '欢迎来到蛮有味' }),
    h('div', { class: 'login-sub', text: '武汉好吃的，真人探过的' })
  ]));

  // ===== 手机登录区（主链路） =====
  const form = h('form', { class: 'ac-form login-form', novalidate: 'novalidate' });

  // 字段 1：手机号
  const phoneEl = h('input', {
    class: 'ac-input login-input', type: 'tel', name: 'phone', inputmode: 'numeric',
    autocomplete: 'tel', maxlength: '11', placeholder: '请输入手机号', 'aria-label': '手机号'
  });
  form.appendChild(h('label', { class: 'login-field' }, [
    h('span', { class: 'login-label', text: '手机号' }), phoneEl
  ]));

  // 字段 2：图形验证码（人机验证）
  const captchaImg = h('img', {
    class: 'login-captcha-img', alt: '图形验证码，请抄写图中的字母数字',
    width: '96', height: '38', 'aria-hidden': 'true'
  });
  const captchaInput = h('input', {
    class: 'ac-input login-input', type: 'text', name: 'captchaInput',
    inputmode: 'text', autocomplete: 'off', maxlength: '6',
    placeholder: '输入图中字符', 'aria-label': '图形验证码'
  });
  const refreshBtn = h('button', {
    class: 'btn btn-ghost login-captcha-refresh', type: 'button', text: '换一张',
    onclick: () => onCaptchaRefresh(captchaImg)   // 见 §3.2
  });
  form.appendChild(h('label', { class: 'login-field' }, [
    h('span', { class: 'login-label', text: '图形验证（人机验证）' }),
    h('div', { class: 'login-captcha-row' }, [ captchaImg, captchaInput, refreshBtn ])
  ]));

  // 字段 3：短信验证码 + 倒计时按钮
  const smsInput = h('input', {
    class: 'ac-input login-input', type: 'text', name: 'smsCode',
    inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6',
    placeholder: '6 位短信验证码', 'aria-label': '短信验证码'
  });
  const smsBtn = h('button', {
    class: 'btn btn-ghost login-sms-btn', type: 'button', text: '获取短信验证码',
    onclick: () => onSmsSend({ phoneEl, captchaInput, smsBtn })  // 见 §3.3
  });
  form.appendChild(h('label', { class: 'login-field' }, [
    h('span', { class: 'login-label', text: '短信验证码' }),
    h('div', { class: 'login-sms-row' }, [ smsInput, smsBtn ])
  ]));

  // 提交
  const submitBtn = h('button', {
    class: 'btn btn-primary btn-block login-submit', type: 'submit', text: '登录 / 注册'
  });
  form.appendChild(submitBtn);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // 前端校验（见 §4）→ 组装 payload → ctx.onPhoneLogin(payload)
  });
  root.appendChild(form);

  // ===== 分隔符「或」 =====
  root.appendChild(h('div', { class: 'login-divider', text: '或' }));

  // ===== 微信登录入口 =====
  const wechatBtn = h('button', {
    class: 'btn login-wechat-btn btn-block', type: 'button', text: '微信登录',
    onclick: () => onWechatLogin()   // 见 §3.4
  });
  root.appendChild(wechatBtn);

  // 协议
  root.appendChild(h('div', { class: 'login-agreement muted', text: '登录即代表同意《用户协议》《隐私政策》' }));
  return root;
}
```

### 3.2 图形验证码刷新 `onCaptchaRefresh`

```js
// 图形验证码：前端不绘制、不持有任何密钥；服务端自绘 svg 返回。
// 前端只需把 svg 字符串塞进 img.src（data URI），并保存 token 供后续校验。
async function onCaptchaRefresh(imgEl) {
  const res = await fetch('http://127.0.0.1:8799/auth/captcha', { method: 'POST' });
  if (!res.ok) { toast('验证码加载失败，请重试'); return; }
  const data = await res.json();          // { token, svg }
  imgEl.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(data.svg);
  imgEl.setAttribute('alt', '图形验证码，请抄写图中的字母数字');
  sessionStorage.setItem('captchaToken', data.token);  // 仅 token，不含答案
}
```

### 3.3 获取短信验证码 `onSmsSend`（含倒计时）

```js
async function onSmsSend({ phoneEl, captchaInput, smsBtn }) {
  const phone = phoneEl.value.trim();
  const captchaToken = sessionStorage.getItem('captchaToken');
  const captchaInputVal = captchaInput.value.trim();

  if (!/^1\d{10}$/.test(phone)) { toast('请输入正确的 11 位手机号'); phoneEl.focus(); return; }
  if (!captchaToken || !captchaInputVal) { toast('请先完成图形验证'); captchaInput.focus(); return; }

  smsBtn.disabled = true;
  try {
    const res = await fetch('http://127.0.0.1:8799/auth/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        captchaToken,
        captchaInput: captchaInputVal,
        scene: 'login'   // 见 §7 字段表
      })
    });
    const data = await res.json();   // { ok, devCode? } 或 { ok:false, error }
    if (!res.ok || !data.ok) {
      // 不假装成功：明确报错（图形错 / 频控 / provider 未配置）
      toast(data.error || '短信发送失败，请稍后重试');
      onCaptchaRefresh(/* 刷新 img */);   // 失败后图形验证码作废，强制刷新
      return;
    }
    // 开发环境可能返回 devCode（仅 dev 显示，生产绝不返回）
    if (data.devCode) toast('开发验证码：' + data.devCode);
    startCountdown(smsBtn, 60);   // 进入 smsSent 态：60s 倒计时
  } catch (e) {
    toast('网络开小差了，请重试');
  } finally {
    if (!isCountingDown(smsBtn)) smsBtn.disabled = false;
  }
}

function startCountdown(btn, sec) {
  let left = sec;
  btn.disabled = true;
  btn.textContent = `${left}s 后重发`;
  const timer = setInterval(() => {
    left -= 1;
    if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = '获取短信验证码'; }
    else btn.textContent = `${left}s 后重发`;
  }, 1000);
}
```

### 3.4 微信登录 `onWechatLogin`

```js
async function onWechatLogin() {
  // 1) 生成并保存 state（防 CSRF），仅存前端 sessionStorage，不涉密
  const state = crypto.randomUUID();
  sessionStorage.setItem('wechatState', state);

  // 2) 向后端要授权页 URL（AppSecret 仅服务端，前端拿不到）
  const res = await fetch('http://127.0.0.1:8799/auth/wechat/url?state=' + encodeURIComponent(state));
  if (!res.ok) {
    // 未配置微信 provider → 后端明确报错，前端如实展示，不假装能登录
    const data = await res.json().catch(() => ({}));
    toast(data.error || '微信登录暂不可用');
    return;
  }
  const { url } = await res.json();
  // 3) 跳转微信授权页（OAuth 网页授权 snsapi_userinfo）
  window.location.href = url;
  // 用户授权后，由 /auth/wechat/callback 落地（见 §7.5），后端换 token 后前端带 token 落地进入 loggedIn
}
```

> `callback` 落地页（独立极简视图）：读取 URL 中后端回传的 `token` 与 `state`，校验 `state` 与本地一致后存入 `localStorage`（token 仅前端持有「登录态」，不含任何密钥），跳转首页以 `loggedIn` 态渲染。若 `state` 不一致或无 `token` → error 态。

---

## 4. 表单字段表

| 字段名 | UI 控件 | 类型 | 必填 | 校验规则 | 占位文案 |
|---|---|---|---|---|---|
| `phone` 手机号 | `input[type=tel]` | 字符串(11) | 是 | 正则 `^1\d{10}$`（1 开头 + 11 位） | 请输入手机号 |
| `captchaToken` | 隐藏（sessionStorage） | 字符串 | 是（系统级） | 由 `POST /auth/captcha` 下发，随短信请求回传 | — |
| `captchaInput` 图形验证码 | `input[type=text]` | 字符串(≤6) | 是 | 非空；与 `captchaToken` 一并交给后端常量时间比对 | 输入图中字符 |
| `smsCode` 短信验证码 | `input[type=text]` | 字符串(6) | 是 | 6 位数字；一次性、5–10 分钟过期（后端判定） | 6 位短信验证码 |
| `scene` 场景 | 隐藏常量 `'login'` | 枚举 | 是 | 取值 ∈ {login, bind}（本期仅 login） | — |

**提交 payload 组装**（前端校验通过后 `onPhoneLogin` 发出）：
```js
const payload = {
  phone: phoneEl.value.trim(),
  smsCode: smsInput.value.trim(),
  scene: 'login'
  // 注意：captchaToken / captchaInput 仅用于 /auth/sms/send，不进 /auth/login
};
```
> 登录态 `token`（JWT）由后端在 `/auth/login` 返回，前端存入 `localStorage` 作为会话凭证；**JWT 密钥仅服务端持有，前端不解析、不信任其载荷之外的内容**。

---

## 5. 状态机（手机主链路）

`idle → captcha → smsSent → verified → loggedIn`，任一环节可落入 `error`（可回退到上一稳定态）。

| 状态 | 触发 | 画面 |
|---|---|---|
| `idle` | 进入登录视图 | 表单可编辑；图形验证码默认已加载；短信按钮可用（但点击会先要求图形验证） |
| `captcha` | 图形验证码加载完成 / 刷新 | 展示 svg 图 + 输入框；图形验证未过，短信按钮点击被拦截提示 |
| `smsSent` | `/auth/sms/send` 返回 `ok` | 短信按钮进入 60s 倒计时（`startCountdown`）；用户填写 `smsCode` |
| `verified` | 用户填完 6 位 `smsCode` 且提交 | 提交 `/auth/login`，表单禁用、按钮 loading（印章红波纹） |
| `loggedIn` | `/auth/login` 返回 `{ok, token, user}` | 切成功态：欢迎语 + 用户信息（`user.nickname`/`user.phoneMasked`）+ 进入首页 |
| `error` | 图形错 / 频控 / 网络错 / provider 未配置 | toast 明确错误 + 图形验证码强制刷新（作废旧 token）；可重试，不假装成功 |

> 微信链路不经过上述状态机：由 `idle →（跳转授权）→ callback 落地 → loggedIn`，失败则 `error`。两条链路在 `loggedIn` 汇合。

---

## 6. 视觉规范（全部引用 tokens.css 变量）

> 严禁写死颜色；以下每处均标注所用令牌，与 `shop-upload-mockup.html` 同源。

### 6.1 标题区 `login-head`
- 印章 `login-seal`：复用 `.seal` 视觉（`width/height 38px`；`border-radius: 9px`；`background: var(--seal-red)`；`border: 2px solid var(--gold)`；楷体白字）。
- 标题 `login-title`：`font-family: var(--font-display)`；`color: var(--ink)`；`font-size: 22px`。
- 副文案 `login-sub`：`color: var(--ink-2)`；`font-size: 12px`。

### 6.2 表单与输入框
- 沿用 `.ac-form` / `.ac-input`（`border: 1px solid var(--line)`；`border-radius: var(--r-sm)`；`background: var(--paper-2)`；`color: var(--ink)`；聚焦 `border-color: var(--seal-red)` + `box-shadow: 0 0 0 3px rgba(192,57,43,.12)`）。
- 标签 `login-label`：`font-size: 13px`；`color: var(--ink-2)`；`font-family: var(--font-body)`。

### 6.3 图形验证码 `login-captcha-row`
- 图片 `login-captcha-img`：`width: 96px; height: 38px`；`border: 1px solid var(--line)`；`border-radius: var(--r-sm)`；`background: var(--paper-2)`。
- 刷新按钮 `login-captcha-refresh`：复用 `.btn .btn-ghost`，紧凑内边距（如 `padding: 8px 12px`），不抢主按钮视觉权重。
- 视障替代：`img.alt` = 「图形验证码，请抄写图中的字母数字」（见 §9）。

### 6.4 短信按钮 `login-sms-btn`（含倒计时）
- 默认态：复用 `.btn .btn-ghost`（印章红描边，提示「可点」）。
- 倒计时态（`smsSent`）：`disabled`；文案 `${n}s 后重发`；颜色降权（如 `color: var(--ink-2)`，`background: var(--paper-2)`，去掉描边以显禁用），倒计时结束恢复。
- 文案变化走 `textContent`，**禁止 innerHTML**（防 XSS）。

### 6.5 提交 / 微信按钮
- 提交 `login-submit`：复用 `.btn .btn-primary .btn-block`（印章红实底白字）。
- 分隔符 `login-divider`：`text-align:center`；两侧细线（`border-top: 1px solid var(--line)` 配合伪元素），文字 `color: var(--ink-2)`；`font-size: 12px`。
- 微信按钮 `login-wechat-btn`：独立样式（绿色系，复用 `--ticket-green` 表达「微信绿」语义；白字；`btn-block`）。图标用微信字标「微」或 SVG 路径，**不依赖外部图标库**。
- 协议 `login-agreement`：复用 `.muted`（`color: var(--ink-2)`；`font-size: 11px`）。

### 6.6 成功态 `login-success`
- 复用结果徽标视觉（参照 `upload-result-badge.ok`）：`background: rgba(192,57,43,.06)`；印章块 `background: var(--seal-red)`；标题 `color: var(--seal-red)`。
- 欢迎语 `login-welcome`：`font-family: var(--font-display)`；`color: var(--seal-red)`；`font-size: 20px`。
- 用户信息卡：复用 `.card`（`.paper-2` 底 + `var(--line)` 边），展示昵称（`var(--ink)`）与脱敏手机号（`var(--ink-2)`）。

### 6.7 loading（印章红波纹）
- 复用 `.upload-loading` / `.seal-ripple` 视觉（`.seal-red` 主圆 + `var(--gold)` 外环，`--dur-slow` 脉冲）。文案 `color: var(--ink-2)`。

---

## 7. 集成契约（后端接口字段表，供实现，前端严格据此）

> 所有接口基址 `http://127.0.0.1:8799`（自有 Node 后端 :8799）。前端只发请求、收响应，不持有任何密钥。未配置 provider 时后端返回明确错误，**前端如实报错**。

### 7.1 POST /auth/captcha → 图形验证码
请求：无 body。
响应（成功 200）：
```jsonc
{ "token": "cap_abc123",          // 校验凭证，前端回传用，不含答案
  "svg": "<svg ...>...</svg>" }   // 服务端自绘（字母+数字），无外部依赖
```
响应（失败）：`4xx/5xx` + `{ "ok": false, "error": "验证码服务异常" }`。

### 7.2 POST /auth/sms/send → 发送短信验证码
请求 body：
```jsonc
{ "phone": "13800001111",         // 11 位
  "captchaToken": "cap_abc123",   // 来自 7.1
  "captchaInput": "Ab3k",         // 用户输入的图内字符
  "scene": "login" }              // 场景枚举
```
响应（成功 200）：
```jsonc
{ "ok": true,
  "devCode": "123456" }           // 仅开发环境返回，生产绝不返回（前端 dev 才提示）
```
响应（失败，明确原因，不假装成功）：
```jsonc
{ "ok": false, "error": "图形验证码错误" }      // 人机验证未过
{ "ok": false, "error": "发送太频繁，请 1 分钟后再试" } // 频控
{ "ok": false, "error": "短信服务未配置（provider 缺失）" } // 安全红线：如实报错
```

### 7.3 POST /auth/login → 登录 / 注册
请求 body：
```jsonc
{ "phone": "13800001111",
  "smsCode": "123456",            // 6 位
  "scene": "login" }
```
响应（成功 200）：
```jsonc
{ "ok": true,
  "token": "eyJhbGciOi...",       // JWT；密钥仅服务端，前端只存储
  "user": { "id": "u_xxx", "nickname": "武汉吃货", "phoneMasked": "138****1111" } }
```
响应（失败）：`{ "ok": false, "error": "验证码错误或已失效" }` / `"用户不存在"` 等。

### 7.4 GET /auth/wechat/url?state= → 授权页 URL
响应（成功 200）：`{ "url": "https://open.weixin.qq.com/connect/oauth2/authorize?..." }`（后端用 AppSecret 拼授权参数；前端不持有 AppSecret）。
响应（失败）：`{ "ok": false, "error": "微信登录未配置（AppSecret 缺失）" }`（安全红线：如实报错）。

### 7.5 GET /auth/wechat/callback?code&state= → 换 token 后前端落地
后端行为：`code` → 调微信换 `openid/unionid`（用 AppSecret，仅服务端）→ 建/查用户 → 签发 JWT → **重定向到前端落地页并带上 `token` 与回显 `state`**（如 `/login/callback.html?token=...&state=...`）。
前端落地页：校验 `state` 与本地 `sessionStorage.wechatState` 一致 → 存 `token` 到 `localStorage` → 渲染 `loggedIn`。不一致/无 token → `error` 态。

---

## 8. 数据安全与防刷设计（安全红线落地）

| 维度 | 设计 |
|---|---|
| **密钥隔离** | JWT 密钥 / 微信 AppSecret / 短信密钥**仅在服务端 env**；前端包与仓库均无。前端仅持有「登录态 token（JWT）」，不持有任何 secret。 |
| **不伪造网络分支** | 后端在 provider 未配置（无短信网关 / 无微信 AppSecret / 无 JWT 密钥）时，返回明确 `error` 文案（`4xx/5xx`）。前端**如实以 error 态展示，不假装发送成功、不假装登录成功**，也不回退到「成功态」假装。 |
| **图形验证码前置防刷** | `/auth/sms/send` 必须先通过 `/auth/captcha` 的 token + 用户输入比对（服务端常量时间比较）。图形验证码一次性：校验后即作废，失败强制前端刷新新图。 |
| **短信频控** | 同手机号：**1 分钟 1 次、1 小时 ≤ 5 次、24 小时 ≤ 10 次**（后端计数，前端仅展示倒计时，不可绕过）。同 IP 额外限流（后端，防批量刷）。 |
| **短信验证码强度** | 6 位随机数字；**5–10 分钟过期**；**一次性失效**（使用即作废）；后端**常量时间比较**（防时序侧信道）。 |
| **微信防 CSRF** | `state` 前端生成随机串存 `sessionStorage`，`callback` 校验一致才接受 `token`；不一致直接 error。 |
| **传输与存储** | 全程 HTTPS（H5 部署要求）；`token` 存 `localStorage`（前端会话凭证），不写入任何含密钥的信息；`captchaToken` 仅会话级（sessionStorage），不含答案。 |
| **前端零 XSS** | 所有动态文本走 `h()` 的 `text`/`textContent`，**禁止 innerHTML**；图形验证码以 `img.src = data:image/svg+xml;utf8,<svg>` 渲染（已是受控 data URI，非 HTML 注入）。 |
| **脱敏展示** | 成功态只展示 `phoneMasked`（如 `138****1111`），不展示完整手机号、不展示 openid/unionid。 |

---

## 9. 无障碍（视障替代）

- **图形验证码**：`img` 自带 `alt="图形验证码，请抄写图中的字母数字"`；并提供「换一张」刷新；同时后端应在失败响应附带 `audio`/文字降级选项（如 `error` 文案提示「若看不清可点换一张」）。**强烈建议**后端额外提供语音验证码端点（假设 §H），前端预留「听验证码」按钮（本期按钮占位，接后端音频）。
- **手机号/验证码输入**：`type=tel`/`inputmode=numeric`，配合 `autocomplete`（tel / one-time-code）提升读屏与自动填充体验。
- **按钮语义**：所有 `button` 有可读 `text`；图标按钮（刷新/微信）均带文字标签，不依赖纯图标。
- **状态播报**：状态切换（如「短信已发送，请查收」「验证码错误」）通过 `toast`（含 `role="status"` / `aria-live="polite"` 容器）通知读屏用户。
- **对比度**：所有文字使用令牌色（`--ink`/`--ink-2` on `--paper-2`），满足 WCAG AA 对比度；印章红按钮白字对比达标。
- **键盘可达**：返回/提交/微信按钮均可 Tab 聚焦、Enter 触发；`login-view` 内表单顺序即 Tab 顺序。

---

## 10. 验收清单

- [ ] 登录视图为独立顶层视图，未登录访问受保护入口时由路由层跳转进入。
- [ ] 手机链路四步可走通：手机号 → 图形验证码（svg 图 + 输入框 + 换一张）→ 获取短信码（先过图形验证）→ 输短信码 → 登录/注册。
- [ ] 图形验证码来自 `POST /auth/captcha` 的 `svg`（data URI 渲染），刷新「换一张」可换图，校验失败强制刷新。
- [ ] 短信按钮 60s 倒计时；图形验证未过 / 手机号非法时被拦截并 toast。
- [ ] 短信频控（1 分钟 1 次 / 1 小时 ≤5 / 24 小时 ≤10）由后端生效，前端仅展示倒计时，无法绕过。
- [ ] 微信登录按钮可跳转 `GET /auth/wechat/url` 返回的授权页；`callback` 校验 `state` 后落地 `loggedIn`。
- [ ] **安全红线**：provider 未配置时，后端明确报错，前端如实 error 态，**不假装成功**；前端包/仓库无密钥。
- [ ] 成功态展示欢迎语、`nickname` 与脱敏手机号（`138****1111`），JWT `token` 存入 `localStorage`。
- [ ] 所有颜色/圆角/间距/字体引用 tokens.css，无写死色值。
- [ ] 所有 DOM 经 `h()` 构建，动态文本走 `text`/`textContent`，无 innerHTML（防 XSS §8）。
- [ ] 无障碍：图形验证码 `alt`、键盘可达、状态 `aria-live` 播报、对比度达标。
- [ ] 移动端优先，`max-width: var(--maxw)` 居中，无横向溢出。

---

## 11. 合理假设（已自行决定，未询问）

1. **路由机制**：新增 `ctx.goLogin` / `goBack` / `goHome` 回调由 `app.js` 路由层负责切换视图；本设计仅约定接口，不实现路由。
2. **登录视图为顶层视图**：不内嵌首页，由「需要登录却未登录」触发（与贡献店铺「可选登录」区分）。
3. **默认主入口为手机验证码**：微信登录作为并行次要入口放在下方（符合 Robin「小程序式手机登录」为主、微信并行）。
4. **图形验证码自绘**：后端用无外部依赖库生成「字母+数字」svg（如 svg-captcha 类方案），前端只展示不绘制。
5. **token 存储位置**：登录态 JWT 存 `localStorage`（前端会话凭证）；`captchaToken` 存 `sessionStorage`（会话级、不含答案）。
6. **devCode 仅开发环境**：`/auth/sms/send` 返回的 `devCode` 仅 dev 环境存在，生产环境绝不返回；前端只在 `import.meta.env.DEV` 等开发标志下提示。
7. **scene 本期仅 login**：`bind` 场景（绑定已有账号）预留字段，本期不实现绑定 UI。
8. **微信 unionid 合并**：后端用 unionid 自动合并同用户多端账号，前端不暴露绑定关系、不做解绑 UI。
9. **短信频控计数在服务端**：前端倒计时只是 UX，不替代服务端计数；任何绕过倒计时的请求仍受服务端频控告阻。
10. **常量时间比较在服务端**：短信码、图形码比对均后端常量时间，前端不参与。
11. **图形验证码可访问性**：后端预留语音验证码端点（`/auth/captcha/audio`，假设），前端「听验证码」按钮本期占位、接后端音频后启用。
12. **字体回退**：楷体优先 `'LXGW WenKai','Ma Shan Zheng',STKaiti,KaiTi`，无网络字体回退系统楷体/serif，不影响布局。
13. **动效令牌化**：波纹/入场/倒计时过渡均引用 `--dur-*` 与 `--ease-*`，不新增魔法数值（除几何量如 captcha 图 96×38）。
14. **登录后去向**：成功态提供「进入首页」按钮（微信与手机链路汇合同一落地），不展开个人中心（另起设计稿）。
15. **callback 落地页独立**：`/auth/wechat/callback` 重定向到前端极简落地页（`login/callback.html` 或路由内 `?cb=wechat`），仅做 token 落地与 state 校验，不承载主视觉。
