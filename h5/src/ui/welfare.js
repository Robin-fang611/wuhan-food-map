// 福利页（W2 · 2026-08-15）：商业化/游戏化模块集中地。
// 承接：每日签到 / 幸运抽奖 / 新人任务 / 我的券包 / 到店核销（演示）。
// 定位：与「今天吃啥」决策隔离——首页聚焦智能体，福利常驻底部 Tab 不流失。
// 架构：复用既有面板组件（CheckinPanel/LotteryPanel/TaskPanel/Wallet），全 h() 构建无 innerHTML。
import { h } from './dom.js';
import { CheckinPanel } from './checkinPanel.js';
import { LotteryPanel } from './lotteryPanel.js';
import { TaskPanel } from './taskPanel.js';
import { Wallet } from './wallet.js';

export async function WelfareView(ctx) {
  const { userId, goWallet, goRedeem, goGrowth, onChanged } = ctx;
  const root = h('div', { class: 'welfare-page' });

  root.appendChild(h('div', { class: 'topbar' }, [
    h('div', { class: 'brand' }, [
      h('div', { class: 'seal', text: '味' }),
      h('div', {}, [
        h('div', { class: 'wordmark', text: '蛮有味' }),
        h('div', { class: 'sub', text: '福利中心 · 签到抽奖券包' })
      ])
    ]),
    h('div', { class: 'top-actions' }, [
      h('button', { class: 'nav-btn', text: '增长看板', onclick: goGrowth }),
    ])
  ]));

  // 签到
  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('h2', {}, [document.createTextNode('每日签到'), h('span', { class: 'tag', text: '得券' })]),
    await CheckinPanel({ userId, onChanged })
  ]));

  // 抽奖
  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('h2', {}, [document.createTextNode('幸运抽奖'), h('span', { class: 'tag', text: '得券' })]),
    await LotteryPanel({ userId, onChanged })
  ]));

  // 任务
  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('h2', {}, [document.createTextNode('新人任务'), h('span', { class: 'tag', text: '得券' })]),
    await TaskPanel({ userId, onChanged })
  ]));

  // 券包 + 演示核销
  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('h2', {}, [document.createTextNode('我的券包'), h('span', { class: 'tag', text: '到店可用' })]),
    await Wallet({ userId, onChanged }),
    h('div', { class: 'card', style: 'margin-top:10px' }, [
      h('div', { class: 'muted', text: 'Demo 模式：暂无签约商户，核销为演示流程（领券 → 到店出示码 → 商家核销）' }),
      h('button', { class: 'btn btn-ghost btn-block', text: '演示核销台 →', style: 'margin-top:10px', onclick: goRedeem }),
    ]),
  ]));

  root.appendChild(h('div', { class: 'footnote', text: '福利中心承载玩法与商业化模块；推荐决策在「今天吃啥」Tab，排序永不被商业化影响。' }));

  return root;
}
