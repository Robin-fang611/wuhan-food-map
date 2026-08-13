// 应用入口：注册玩法 + 极简视图切换（首页 / 券包 / 商户详情）。
import './config.js'; // M11 安全接入：先注入运行时配置（高德 Key / 百度统计 ID 等），早于任何使用方
import { h, clear } from './ui/dom.js';
import { store, DEMO_USER } from './core/store.js';
import { auth, activeUserId } from './core/auth.js';
import { analytics, EVENTS } from './core/analytics.js';
import { initTongji, trackPage } from './core/tongji.js';
import { Home, Wallet } from './ui/home.js';
import { MerchantDetail } from './ui/detail.js';
import { MapView } from './ui/map.js';
import { AccountView } from './ui/account.js';
import { RedeemConsole } from './ui/redeem.js';
import { ReasoningPage } from './ui/reasoning.js';
import { GrowthDashboard } from './ui/growth-dashboard.js';
import { UploadShop } from './ui/uploadShop.js';
import './plays/index.js'; // 注册所有玩法插件（新增玩法只需在 plays/ 加文件并 register）

const app = document.getElementById('app');
let view = 'home';
let detailId = null;
let reasoningInitial = null;

// 启动钩子：① 接入百度统计（env 注入 ID 才生效）；② 记录 APP_OPEN 作为 DAU 计数基础。
const cfg = globalThis.__MANYOUWEI_CONFIG__ || {};
if (cfg.tongjiId) initTongji(cfg.tongjiId);
analytics.track(EVENTS.APP_OPEN); // 本地 dau() + APP_OPEN 事件；与百度 UV 互补

function goDetail(id) { detailId = id; view = 'detail'; render(); }
function goMap() { view = 'map'; render(); }
function goAccount() { view = 'account'; render(); }
function goRedeem() { view = 'redeem'; render(); }
function goGrowth() { view = 'growth'; render(); }
// 从首页带初始问句跳转推理页（首页元素多，开始对话即切到沉浸式推理页）。
function goReasoning(text) { reasoningInitial = text || null; view = 'reasoning'; render(); }
function goUpload() { view = 'upload'; render(); }

let firstRender = true; // 首屏由 hm.js 自动记，后续 SPA 切换才手动上报，避免重复计数
async function render() {
  if (!firstRender) trackPage(location.pathname + location.hash); // SPA 路由浏览上报（百度统计）
  firstRender = false;
  clear(app);
  const userId = activeUserId(); // 登录后用真实用户 id，未登录回退 DEMO_USER
  if (view === 'wallet') {
    app.appendChild(await Wallet({ userId, onBack: () => { view = 'home'; render(); } }));
  } else if (view === 'detail') {
    app.appendChild(await MerchantDetail({
      id: detailId,
      userId,
      onBack: () => { view = 'home'; render(); }
    }));
  } else if (view === 'map') {
    app.appendChild(await MapView({
      goDetail,
      onBack: () => { view = 'home'; render(); },
      goUpload: () => goUpload()
    }));
  } else if (view === 'account') {
    app.appendChild(await AccountView({
      onBack: () => { view = 'home'; render(); },
      goDetail,
      goRedeem,
      goGrowth
    }));
  } else if (view === 'redeem') {
    app.appendChild(await RedeemConsole({ onBack: () => { view = 'home'; render(); } }));
  } else if (view === 'growth') {
    app.appendChild(await GrowthDashboard({ onBack: () => { view = 'home'; render(); } }));
  } else if (view === 'reasoning') {
    app.appendChild(await ReasoningPage({
      userId,
      onBack: () => { view = 'home'; render(); },
      goDetail,
      goRedeem: () => { view = 'redeem'; render(); },
      goAccount,
      goMap,
      initialText: reasoningInitial,
    }));
  } else if (view === 'upload') {
    app.appendChild(await UploadShop({
      userId,
      goBack: () => { view = 'home'; render(); },
      goHome: () => { view = 'home'; render(); },
      goUpload: () => goUpload(),
    }));
  } else {
    app.appendChild(await Home({
      userId,
      goWallet: () => { view = 'wallet'; render(); },
      goMap,
      goAccount,
      goDetail,
      goRedeem: () => { view = 'redeem'; render(); },
      goReasoning,
      goUpload: () => goUpload(),
      refresh: render
    }));
  }
}

render();
