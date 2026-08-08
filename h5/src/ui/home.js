// 首页：品牌头 + Hero + 签到模块 + 券包预览。
import { h } from './dom.js';
import { store } from '../core/store.js';
import { CheckinPanel } from './checkinPanel.js';
import { LotteryPanel } from './lotteryPanel.js';
import { TaskPanel } from './taskPanel.js';
import { Wallet } from './wallet.js';
import { Discover } from './list.js';
import { Ranking } from './ranking.js';

export async function Home(ctx) {
  const { userId, goWallet, goMap, goAccount, refresh, goDetail } = ctx;
  const root = h('div');

  root.appendChild(h('div', { class: 'topbar' }, [
    h('div', { class: 'brand' }, [
      h('div', { class: 'seal', text: '味' }),
      h('div', {}, [
        h('div', { class: 'wordmark', text: '蛮有味' }),
        h('div', { class: 'sub', text: '武汉好吃的，真人探过的' })
      ])
    ]),
    h('div', { class: 'top-actions' }, [
      h('button', { class: 'nav-btn', text: '我的', onclick: goAccount }),
      h('button', { class: 'nav-btn', text: '地图', onclick: goMap }),
      h('button', { class: 'nav-btn', text: '我的券包', onclick: goWallet })
    ])
  ]));

  root.appendChild(h('div', { class: 'section' }, [
    h('div', { class: 'hero' }, [
      h('div', { class: 'kicker', text: '武汉美食发现社区' }),
      h('div', { class: 'headline', text: '蛮有味' }),
      h('div', { class: 'desc', text: '每日签到领通用券，找到对味的好吃。真实探店，不恰饭。' })
    ])
  ]));

  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('h2', {}, [document.createTextNode('每日签到'), h('span', { class: 'tag', text: '得券' })]),
    await CheckinPanel({ userId, onChanged: refresh })
  ]));

  // 抽奖玩法（M15 新玩法插件，经奖励引擎调度）
  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('h2', {}, [document.createTextNode('幸运抽奖'), h('span', { class: 'tag', text: '得券' })]),
    await LotteryPanel({ userId, onChanged: refresh })
  ]));

  // 任务玩法（M15 新玩法插件，经奖励引擎调度）
  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('h2', {}, [document.createTextNode('新人任务'), h('span', { class: 'tag', text: '得券' })]),
    await TaskPanel({ userId, onChanged: refresh })
  ]));

  // 发现 / 列表 / 搜索 / 筛选（M6）
  root.appendChild(Discover({ goDetail }));

  // 榜单（M7）
  root.appendChild(Ranking({ goDetail }));

  const coupons = await store.getCoupons(userId);
  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('h2', {}, [
      document.createTextNode('我的券包'),
      coupons.length ? h('span', { class: 'badge-count', text: String(coupons.length) }) : null
    ]),
    h('div', { class: 'card' }, [
      h('div', { class: 'muted', text: coupons.length ? `已有 ${coupons.length} 张券，点击查看与核销` : '还没有券，签到就能领~' }),
      h('button', { class: 'btn btn-ghost btn-block', text: '进入券包', style: 'margin-top:10px', onclick: goWallet })
    ])
  ]));

  root.appendChild(h('div', { class: 'footnote', text: '原型说明：数据存储于本地（localStorage），v1.5 接入账号与后端后自动迁移；核销二维码为占位，正式版由后端签发。' }));
  return root;
}

export { Wallet };
