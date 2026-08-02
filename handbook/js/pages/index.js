/**
 * pages/index.js — 新生手册首页逻辑
 *
 * 1. 打开后 2s 自动弹出广告弹窗（3 秒倒计时）
 * 2. 底部"加入新生群"按钮点击弹出广告弹窗（无倒计时，直接关闭）
 */

import { showAdPopup } from '../core/ui.js';

// 1. 自动弹出（3 秒倒计时）
setTimeout(() => showAdPopup('index', { countdown: true }), 2000);

// 2. 底部群入口按钮（无倒计时，直接可关闭）
const groupEntry = document.getElementById('groupEntry');
if (groupEntry) {
  groupEntry.addEventListener('click', () => {
    showAdPopup('index', { countdown: false });
  });
}
