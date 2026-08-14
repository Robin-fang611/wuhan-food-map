// 首页（产品落地页）：品牌 + 居中「问蛮有味 Agent」入口 + 其余产品元素
// （签到/抽奖/任务/发现/榜单/券包）。开始对话即跳转到沉浸式推理页（reasoning 视图）。
// 严守架构：所有 Agent 回传在前端经 h() 安全渲染；导航走公开高德 URI（无 Key）。
import { h, toast, clear } from './dom.js';
import { store } from '../core/store.js';
import { CheckinPanel } from './checkinPanel.js';
import { LotteryPanel } from './lotteryPanel.js';
import { TaskPanel } from './taskPanel.js';
import { Wallet } from './wallet.js';
import { Discover, MerchantCard } from './list.js';
import { Ranking } from './ranking.js';

const HOME_QUICK = [
  { label: '心情不好', intent: '心情不好想吃点治愈系暖暖的' },
  { label: '想省钱', intent: '想省钱人均不过百的好吃的' },
  { label: '带人吃饭', intent: '带暗恋的人第一次吃饭别太寒酸' },
  { label: '不知道吃啥', intent: '完全不知道吃啥你帮我定' },
];

export async function Home(ctx) {
  const { userId, goWallet, goMap, goAccount, refresh, goDetail, goRedeem, goReasoning } = ctx;
  const root = h('div', { class: 'home-landing' });

  // —— 顶部品牌条 ——
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

  // —— 居中「问 Agent」英雄区 ——
  const askInput = h('input', {
    class: 'home-ask-input', type: 'text',
    placeholder: '今天想吃啥？说一句话，Agent 帮你定', 'aria-label': '问蛮有味 Agent',
  });
  const askBtn = h('button', { class: 'home-ask-btn', type: 'button', text: '问蛮有味 →' });
  function doAsk(text) {
    const t = (text || askInput.value || '').trim();
    if (goReasoning) goReasoning(t || null);
  }
  askBtn.addEventListener('click', () => doAsk());
  askInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAsk(); });

  root.appendChild(h('div', { class: 'home-hero' }, [
    h('div', { class: 'home-kicker', text: '武汉美食发现 Agent' }),
    h('div', { class: 'home-headline', text: '说一句话，今天吃啥它帮你定' }),
    h('div', { class: 'home-ask-row' }, [askInput, askBtn]),
    h('div', { class: 'home-quick' },
      HOME_QUICK.map((q) => h('button', {
        class: 'home-quick-chip', type: 'button', text: q.label,
        onclick: () => { if (goReasoning) goReasoning(q.intent); }
      }))
    ),
    h('div', { class: 'home-hero-note', text: '真人探过的，不恰饭 · 排序永不被出价影响' }),
  ]));

  // —— S6：确定性入口条（缓解冷启动空屏，老用户「回去看看」的抓手）——
  root.appendChild(h('div', { class: 'home-entry-bar' }, [
    h('button', { class: 'home-entry-chip', type: 'button', text: '常去', onclick: () => {
      const el = document.getElementById('home-discover');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } }),
    h('button', { class: 'home-entry-chip', type: 'button', text: '收藏', onclick: goAccount }),
    h('button', { class: 'home-entry-chip', type: 'button', text: '附近', onclick: goMap }),
  ]));

  // —— 其余产品元素（首页还有好多内容）——
  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('h2', {}, [document.createTextNode('每日签到'), h('span', { class: 'tag', text: '得券' })]),
    await CheckinPanel({ userId, onChanged: refresh })
  ]));
  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('h2', {}, [document.createTextNode('幸运抽奖'), h('span', { class: 'tag', text: '得券' })]),
    await LotteryPanel({ userId, onChanged: refresh })
  ]));
  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('h2', {}, [document.createTextNode('新人任务'), h('span', { class: 'tag', text: '得券' })]),
    await TaskPanel({ userId, onChanged: refresh })
  ]));

  const disc = Discover({ goDetail });
  disc.id = 'home-discover';
  root.appendChild(disc);
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
