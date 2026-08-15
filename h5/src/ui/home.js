// 首页（W2 重构 · 2026-08-15）：完全围绕「美食智能体」设计——
// 对话入口 + 情境 chips + 上次回顾 + 本地生活速览 + 发现/榜单（内容层）。
// 商业化模块（签到/抽奖/任务/券包/核销）已迁入「福利」Tab（见 welfare.js）。
// 严守架构：所有 Agent 回传经 h() 安全渲染；导航走公开高德 URI（无 Key）。
import { h } from './dom.js';
import { Discover } from './list.js';
import { Ranking } from './ranking.js';
import { allMerchants } from '../data/all-merchants.js';
import { CAMPUS_COORDS, distKm } from '../core/query.js';

const HOME_QUICK = [
  { label: '心情不好', intent: '心情不好想吃点治愈系暖暖的' },
  { label: '想省钱', intent: '想省钱人均不过百的好吃的' },
  { label: '带人吃饭', intent: '带暗恋的人第一次吃饭别太寒酸' },
  { label: '健身轻食', intent: '清淡的健身餐，低脂高蛋白' },
  { label: '不知道吃啥', intent: '完全不知道吃啥你帮我定' },
];

// 上次推荐回顾（reasoning.js 在成功推荐时写入 localStorage，供回访抓手）
function lastRecommendation() {
  try {
    const raw = localStorage.getItem('myw:lastRec');
    if (!raw) return null;
    const r = JSON.parse(raw);
    return (r && r.name && r.ts) ? r : null;
  } catch { return null; }
}

// 本地生活速览：财大南湖周边有坐标的店按评分取 3 家（就近参考）
function nearbyPreview() {
  const campus = CAMPUS_COORDS['财大南湖周边'];
  return allMerchants
    .filter((m) => m.zone === '财大南湖周边' && typeof m.lng === 'number' && typeof m.lat === 'number')
    .map((m) => ({ ...m, _km: distKm(campus, m) }))
    .sort((a, b) => (a._km || 99) - (b._km || 99))
    .slice(0, 3);
}

export async function Home(ctx) {
  const { goMap, goAccount, goWelfare, goDetail, goReasoning } = ctx;
  const root = h('div', { class: 'home-landing' });

  // —— 顶部品牌条（极简：品牌 + 我的）——
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
    ])
  ]));

  // —— 对话英雄区（主角）——
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

  // —— 上次推荐回顾（回访抓手）——
  const last = lastRecommendation();
  if (last) {
    const mins = Math.max(1, Math.round((Date.now() - last.ts) / 60000));
    root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
      h('h2', {}, [document.createTextNode('继续上次')]),
      h('button', {
        class: 'card home-lastrec', type: 'button',
        onclick: () => { if (goReasoning) goReasoning(last.intent || null); },
      }, [
        h('div', { class: 'muted', text: mins < 60 ? `${mins} 分钟前聊到` : `${Math.round(mins / 60)} 小时前聊到` }),
        h('div', { class: 'home-lastrec-name', text: '★ ' + last.name }),
        h('div', { class: 'muted', text: '再聊聊 →' }),
      ]),
    ]));
  }

  // —— 本地生活速览（小吃街/附近：差异化资产入口）——
  const nearby = nearbyPreview();
  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('h2', {}, [document.createTextNode('今天附近'), h('span', { class: 'tag', text: '本地生活' })]),
    h('div', { class: 'card' }, [
      h('div', { class: 'muted', text: '财大南湖 · 185 家（含高德没有的流动摊 62 家）' }),
      h('button', { class: 'btn btn-ghost btn-block', text: '去地图看看', style: 'margin-top:8px', onclick: goMap }),
    ]),
    nearby.length ? h('div', { class: 'nearby-row' }, nearby.map((m) => h('button', {
      class: 'nearby-item', type: 'button',
      onclick: () => goDetail && goDetail(m.id),
    }, [
      h('span', { class: 'nearby-name', text: m.name }),
      h('span', { class: 'nearby-dist', text: m._km != null ? `${m._km.toFixed(1)}km` : '' }),
    ]))) : null,
  ]));

  // —— 内容层：发现 / 榜单（非商业化，留作「没想好时逛逛」）——
  const disc = Discover({ goDetail });
  disc.id = 'home-discover';
  root.appendChild(disc);
  root.appendChild(Ranking({ goDetail }));

  // —— 福利入口提示（商业化集中在福利 Tab）——
  root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
    h('button', { class: 'btn btn-ghost btn-block', text: '🎁 签到 / 抽奖 / 我的券包（福利中心）', onclick: goWelfare }),
  ]));

  root.appendChild(h('div', { class: 'footnote', text: '蛮有味 Agent 推演可回放审计；排序永不被出价影响。' }));

  return root;
}
