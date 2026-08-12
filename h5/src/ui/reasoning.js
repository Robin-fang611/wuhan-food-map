// 推理页（沉浸式）：用户开始调用 Agent 后从首页跳转而来的独立页面。
// 设计目标：干净留白 + 沉浸式武汉地标背景 + 居中对话 + **永远可见的推理时间线**。
// 严守架构：所有 Agent 回传经 h() 安全渲染（无 innerHTML）；导航走公开高德 URI（无 Key）。
import { h, toast, clear } from './dom.js';
import { store } from '../core/store.js';
import { buildAmapUrl } from './detail.js';
import {
  discover as agentDiscover, agentChat,
  getBackend, getMemory, clearMemory,
} from '../../../hypha/integration/agent-client.js';

// 稳定会话 id（本地生成，非 PII；后端据此隔离口味档案）。
function getSessionId() {
  try {
    let sid = localStorage.getItem('myw:sessionId');
    if (!sid) { sid = 's_' + Math.random().toString(36).slice(2, 12); localStorage.setItem('myw:sessionId', sid); }
    return sid;
  } catch { return 'anon'; }
}

const RANKED_BY_LABEL = {
  mustEat: '必吃榜', value: '性价比', lateNight: '夜宵榜', newest: '新收录',
  rating: '评分', price: '人均', distance: '距离', llm: 'AI 推荐',
};
const QUICK_INTENTS = [
  { label: '心情不好', intent: '心情不好想吃点治愈系暖暖的' },
  { label: '想省钱', intent: '想省钱人均不过百的好吃的' },
  { label: '带人吃饭', intent: '带暗恋的人第一次吃饭别太寒酸' },
  { label: '不知道吃啥', intent: '完全不知道吃啥你帮我定' },
];

// 武汉地标沉浸式背景：黄昏江景 + 黄鹤楼 / 长江大桥 / 龟山电视塔剪影（纯 SVG，无外部资源）。
function WuhanBackdrop() {
  return h('div', { class: 'reason-bg', 'aria-hidden': 'true' }, [
    h('svg', {
      class: 'reason-bg-svg', viewBox: '0 0 680 360', preserveAspectRatio: 'xMidYMax slice',
      xmlns: 'http://www.w3.org/2000/svg',
    }, [
      h('defs', {}, [
        h('linearGradient', { id: 'wm-sky', x1: '0', y1: '0', x2: '0', y2: '1' }, [
          h('stop', { offset: '0%', 'stop-color': '#2a2350' }),
          h('stop', { offset: '45%', 'stop-color': '#7a4b6b' }),
          h('stop', { offset: '75%', 'stop-color': '#e8915b' }),
          h('stop', { offset: '100%', 'stop-color': '#f6c177' }),
        ]),
        h('linearGradient', { id: 'wm-river', x1: '0', y1: '0', x2: '0', y2: '1' }, [
          h('stop', { offset: '0%', 'stop-color': '#caa06a' }),
          h('stop', { offset: '100%', 'stop-color': '#3a2f55' }),
        ]),
      ]),
      h('rect', { x: '0', y: '0', width: '680', height: '360', fill: 'url(#wm-sky)' }),
      // 远山
      h('path', { d: 'M0 250 Q120 210 240 240 T480 235 T680 250 L680 360 L0 360 Z', fill: '#5a4170', opacity: '0.55' }),
      // 江面
      h('rect', { x: '0', y: '262', width: '680', height: '98', fill: 'url(#wm-river)', opacity: '0.92' }),
      // 长江大桥（桁架拱）
      h('g', { fill: '#2c2440', opacity: '0.92' }, [
        h('rect', { x: '40', y: '250', width: '600', height: '10' }),
        h('path', { d: 'M40 250 Q170 205 300 250 Q430 205 560 250 Q620 230 640 250', fill: 'none', stroke: '#2c2440', 'stroke-width': '6' }),
        h('rect', { x: '120', y: '200', width: '8', height: '52' }),
        h('rect', { x: '300', y: '198', width: '8', height: '54' }),
        h('rect', { x: '480', y: '200', width: '8', height: '52' }),
      ]),
      // 黄鹤楼（多层塔）
      h('g', { fill: '#241d38', opacity: '0.95' }, [
        h('rect', { x: '150', y: '150', width: '60', height: '14' }),
        h('rect', { x: '156', y: '130', width: '48', height: '20' }),
        h('path', { d: 'M150 130 L180 112 L210 130 Z' }),
        h('rect', { x: '162', y: '110', width: '36', height: '20' }),
        h('path', { d: 'M156 110 L180 96 L204 110 Z' }),
        h('rect', { x: '168', y: '92', width: '24', height: '18' }),
        h('path', { d: 'M162 92 L180 80 L198 92 Z' }),
        h('rect', { x: '176', y: '70', width: '8', height: '22' }),
      ]),
      // 龟山电视塔
      h('g', { fill: '#241d38', opacity: '0.95' }, [
        h('rect', { x: '556', y: '120', width: '6', height: '142' }),
        h('circle', { cx: '559', cy: '120', r: '13' }),
        h('rect', { x: '550', y: '100', width: '18', height: '8' }),
      ]),
      // 江汉关式建筑
      h('g', { fill: '#241d38', opacity: '0.9' }, [
        h('rect', { x: '430', y: '210', width: '44', height: '52' }),
        h('rect', { x: '448', y: '186', width: '8', height: '26' }),
      ]),
      // 水面倒影高光
      h('g', { fill: '#f6c177', opacity: '0.18' }, [
        h('rect', { x: '150', y: '262', width: '60', height: '40' }),
        h('rect', { x: '556', y: '262', width: '10', height: '60' }),
      ]),
    ]),
    h('div', { class: 'reason-bg-veil' }),
  ]);
}

export function ReasoningPage(ctx) {
  const { userId, onBack, goDetail, goRedeem, goAccount, goMap, initialText } = ctx;
  const root = h('div', { class: 'reasoning-page' });
  root.appendChild(WuhanBackdrop());

  const shell = h('div', { class: 'reasoning-shell' });
  root.appendChild(shell);

  // —— 顶部极简栏：返回 + 品牌 + 口味 ——
  const tastePanelRoot = h('div', { class: 'taste-panel', style: 'display:none' });
  function toggleTaste() {
    if (tastePanelRoot.style.display !== 'none') tastePanelRoot.style.display = 'none';
    else { tastePanelRoot.style.display = ''; loadTastePanel(); }
  }
  shell.appendChild(h('div', { class: 'reason-topbar' }, [
    h('button', { class: 'reason-back', type: 'button', text: '← 返回', onclick: () => onBack && onBack() }),
    h('div', { class: 'reason-brand' }, [
      h('div', { class: 'seal', text: '味' }),
      h('div', { class: 'reason-wordmark', text: '蛮有味' }),
    ]),
    h('button', { class: 'nav-btn', text: '口味', onclick: toggleTaste }),
  ]));
  shell.appendChild(tastePanelRoot);

  // —— 居中对话列 ——
  const convo = h('div', { class: 'reason-convo' });
  shell.appendChild(convo);

  // —— 底部输入条（贴底，对话居中）——
  const input = h('input', {
    class: 'reason-input', type: 'text',
    placeholder: '今天想吃啥？说一句话，Agent 帮你定', 'aria-label': '美食意图',
  });
  const sendBtn = h('button', { class: 'reason-send', type: 'button', text: '↑' });
  shell.appendChild(h('div', { class: 'reason-input-bar' }, [input, sendBtn]));

  // 会话状态
  let session = { zone: '武汉全城', mealTime: [], category: null, maxPrice: null, sort: null, board: null };
  let seenIds = [];
  let history = [];
  let turnCount = 0;
  const sessionId = getSessionId();

  function scrollToBottom() {
    requestAnimationFrame(() => { convo.scrollTop = convo.scrollHeight; });
  }
  function addUserBubble(text) {
    convo.appendChild(h('div', { class: 'chat-you-label', text: '你' }));
    convo.appendChild(h('div', { class: 'chat-user-bubble', text }));
    scrollToBottom();
  }
  function addNoteBubble(text) {
    convo.appendChild(h('div', { class: 'chat-agent-row' }, [
      h('div', { class: 'chat-agent-avatar', text: '味' }),
      h('div', { class: 'chat-agent-name', text: '蛮有味' }),
    ]));
    convo.appendChild(h('div', { class: 'chat-note', text }));
    scrollToBottom();
  }
  function coldBtn(label, onclick) {
    return h('button', { class: 'cold-btn', type: 'button', text: label, onclick });
  }
  function showFrequent() {
    getMemory(sessionId).then((p) => {
      const vals = [];
      if (p && p.zone) vals.push(p.zone);
      if (p && Array.isArray(p.mealTime) && p.mealTime.length) vals.push(...p.mealTime);
      addNoteBubble(vals.length ? `你常去：${vals.join(' / ')}` : '还没有常去记录，多聊几次我就记住了~');
    }).catch(() => addNoteBubble('口味档案在后端：:8799 未连接，连上后我就能记住你常去哪。'));
  }
  function showFavorites() {
    Promise.resolve(store.getFavorites ? store.getFavorites(userId) : [])
      .then((list) => {
        const names = (list || []).map((f) => f.name || f.merchantName || f.id).filter(Boolean);
        addNoteBubble(names.length ? `你收藏了：${names.join('、')}` : '还没有收藏，看到喜欢的店点一下就能收藏。');
      })
      .catch(() => addNoteBubble('本地收藏暂不可用。'));
  }
  async function loadTastePanel() {
    while (tastePanelRoot.firstChild) tastePanelRoot.removeChild(tastePanelRoot.firstChild);
    let profile = {};
    try { profile = await getMemory(sessionId); } catch { /* 后端未连 */ }
    const fields = [
      ['zone', '常去片区'], ['mealTime', '常去场景'], ['category', '偏好分类'],
      ['maxPrice', '预算上限'], ['spice', '辣度'], ['dislikes', '忌口'], ['notes', '补充'],
    ];
    const rows = [];
    for (const [k, label] of fields) {
      let v = profile ? profile[k] : null;
      if (Array.isArray(v)) v = v.join('/');
      if (v == null || v === '') v = '—';
      else if (k === 'maxPrice') v = `¥${v}`;
      rows.push(h('div', { class: 'taste-row' }, [
        h('span', { class: 'taste-k', text: label }),
        h('span', { class: 'taste-v', text: String(v) }),
      ]));
    }
    tastePanelRoot.appendChild(h('div', { class: 'taste-title', text: '你的口味档案' }));
    tastePanelRoot.appendChild(h('div', { class: 'taste-rows' }, rows));
    tastePanelRoot.appendChild(h('button', {
      class: 'btn btn-ghost btn-sm taste-clear', type: 'button', text: '一键清空',
      onclick: async () => {
        try { await clearMemory(sessionId); } catch { /* ignore */ }
        loadTastePanel();
        addNoteBubble('口味档案已清空（按会话隔离，不采集任何 PII）。');
      },
    }));
    const empty = !profile || Object.values(profile).every((x) => x == null || x === '' || (Array.isArray(x) && !x.length));
    if (empty) tastePanelRoot.appendChild(h('div', { class: 'taste-empty', text: '后端未连接或暂无记录；连上 :8799 后多聊几次我就越懂你。' }));
  }

  // —— 解析 chips ——
  function buildChips(params) {
    const chips = [];
    const p = params || {};
    if (p.zone && p.zone !== '武汉全城') chips.push('片区·' + p.zone);
    if (p.category) chips.push('分类·' + p.category);
    if (Array.isArray(p.mealTime) && p.mealTime.length) chips.push('时段·' + p.mealTime.join('/'));
    if (typeof p.maxPrice === 'number') chips.push('人均≤' + p.maxPrice);
    const ranked = p.board || p.sort;
    if (ranked && RANKED_BY_LABEL[ranked]) chips.push('按' + RANKED_BY_LABEL[ranked]);
    return chips.map((c) => h('span', { class: 'chat-chip', text: c }));
  }

  // —— 推理时间线（永远渲染；无 steps 时给确定性的兜底说明）——
  function renderTimeline(trace) {
    const steps = (trace && Array.isArray(trace.steps)) ? trace.steps : null;
    const wrap = h('div', { class: 'reason-timeline' }, [
      h('div', { class: 'reason-timeline-head', text: 'Agent 推理过程 ✎' }),
    ]);
    if (!steps || !steps.length) {
      wrap.appendChild(h('div', { class: 'reason-step' }, [
        h('div', { class: 'reason-step-dot' }),
        h('div', { class: 'reason-step-body' }, [
          h('div', { class: 'reason-step-title', text: '已按你的条件智能筛选' }),
          h('div', { class: 'reason-step-detail', text: '（规则引擎模式，暂无分步推理；接入 DeepSeek 后将展示逐字思考）' }),
        ]),
      ]));
      return wrap;
    }
    for (const st of steps) {
      const body = [
        h('div', { class: 'reason-step-title', text: st.title || '' }),
        st.detail ? h('div', { class: 'reason-step-detail', text: st.detail }) : null,
      ];
      // 「为什么推荐这家」：把逐店因子逐条列出，做到推荐理由完整透明。
      if (Array.isArray(st.factors) && st.factors.length) {
        body.push(h('div', { class: 'reason-why-list' }, st.factors.map((f) =>
          h('div', { class: 'reason-why-item' }, [
            h('span', { class: 'reason-why-label', text: f.label }),
            h('span', { class: 'reason-why-detail', text: f.detail }),
          ])
        )));
      }
      wrap.appendChild(h('div', { class: 'reason-step' }, [
        h('div', { class: 'reason-step-dot' }),
        h('div', { class: 'reason-step-body' }, body),
      ]));
    }
    return wrap;
  }

  // —— 主推 / 备选卡（含逐店推荐理由 + 因子标签）——
  function mainCard(m, { primary = false } = {}) {
    const url = buildAmapUrl(m);
    const sub = [
      m.cpsTag ? '可核销 · ' : '',
      (m.avgPrice != null ? `人均 ¥${m.avgPrice}` : '人均 待补')
    ].join('').trim();
    const factors = Array.isArray(m.factors) ? m.factors : null;
    const body = h('div', { style: 'flex:1;min-width:0' }, [
      h('div', { class: 'chat-main-name', text: m.name || '未命名商户' }),
      sub ? h('div', { class: 'chat-main-sub', text: sub }) : null,
      m.reason ? h('div', { class: 'chat-main-reason', text: m.reason }) : null,
      factors && factors.length
        ? h('div', { class: 'chat-main-factors' }, factors.slice(0, 5).map((f) =>
            h('span', { class: `chat-factor chat-factor-${f.type}`, text: f.label })))
        : null,
    ]);
    const card = h('div', { class: 'chat-main-card', role: 'button', tabindex: '0' }, [
      h('div', { class: 'chat-main-bar' }),
      h('div', { class: 'chat-main-star', text: primary ? '★ 主推' : '备选' }),
      body,
      h('div', { class: 'chat-main-actions' }, [
        url ? h('a', { class: 'btn btn-ghost btn-sm', href: url, target: '_blank', rel: 'noopener noreferrer', text: '一键导航' }) : null,
        m.cpsTag ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '去核销', onclick: () => goRedeem && goRedeem() }) : null,
      ]),
    ]);
    if (goDetail) {
      card.addEventListener('click', () => goDetail(m.id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goDetail(m.id); }
      });
    }
    return card;
  }

  // —— Agent 回复渲染 ——
  function addAgentReply(data) {
    const isFirst = turnCount === 0;
    turnCount++;
    convo.appendChild(h('div', { class: 'chat-agent-row' }, [
      h('div', { class: 'chat-agent-avatar', text: '味' }),
      h('div', { class: 'chat-agent-name', text: '蛮有味' })
    ]));

    if (data.needsClarification) {
      convo.appendChild(h('div', { class: 'chat-reason-box' }, [
        h('div', { class: 'chat-reason-header', text: 'Agent 想先确认一下' }),
        h('div', { class: 'chat-reason-line', text: data.question || '' })
      ]));
      scrollToBottom();
      return;
    }

    const output = data.output || { merchants: [], summary: {} };
    const trace = data.trace || null;
    const s = output.summary || {};
    const params = trace && trace.memoryUsed;

    const chips = buildChips(params || s);
    if (chips.length) {
      convo.appendChild(h('div', { class: 'chat-parse-label', text: isFirst ? 'Agent 理解为 ↓' : '重新盘了一下 ⇢' }));
      convo.appendChild(h('div', { class: 'chat-chips' }, chips));
    }

    // 推理时间线（永远显示）
    convo.appendChild(renderTimeline(trace));

    const merchants = output.merchants || [];
    const byId = new Map(merchants.map((m) => [m.id, m]));
    const decision = s.decision;
    if (decision && decision.primaryId && byId.has(decision.primaryId)) {
      const primary = byId.get(decision.primaryId);
      convo.appendChild(mainCard(primary, { primary: true }));
      const alts = (decision.alternatives || []).map((id) => byId.get(id)).filter(Boolean);
      for (const a of alts) convo.appendChild(mainCard(a, { primary: false }));
    } else if (merchants.length) {
      for (const m of merchants.slice(0, 3)) convo.appendChild(mainCard(m, { primary: false }));
    } else {
      convo.appendChild(h('div', { class: 'empty', text: '没有匹配的美食，换个说法试试~' }));
    }

    if (s.provenance) {
      const hash = String(s.provenance.processHash || '').replace(/^sha256:/, '').slice(0, 10);
      const driver = s.provenance.driver === 'hypha-react' ? 'LLM ReAct' : '确定性';
      convo.appendChild(h('div', { class: 'agent-provenance', text: `由蛮有味 Agent 驱动 · ${driver} · 可回放审计 #${hash}` }));
    }

    scrollToBottom();
  }

  // 冷启动快捷意图（居中）
  function renderQuickStart() {
    const hint = h('div', { class: 'reason-hint', text: '说一句话，或点下面的心情，Agent 马上帮你定～' });
    convo.appendChild(hint);
    const wrap = h('div', { class: 'chat-chips', style: 'padding-top:8px' });
    for (const q of QUICK_INTENTS) {
      wrap.appendChild(h('button', {
        class: 'chat-chip', type: 'button', text: q.label,
        onclick: () => { input.value = q.intent; ask(q.intent); }
      }));
    }
    convo.appendChild(wrap);
    const cold = h('div', { class: 'reason-cold' }, [
      coldBtn('常去', showFrequent),
      coldBtn('收藏', showFavorites),
      coldBtn('附近', () => ask('附近好吃的')),
    ]);
    convo.appendChild(cold);
  }
  renderQuickStart();

  // —— 统一入口 ——
  async function ask(text, resetSeen) {
    text = (text || '').trim();
    if (!text) return;
    addUserBubble(text);
    try {
      let data;
      if (getBackend() === 'server') {
        data = await agentChat({ message: text, sessionId, history });
        if (data && !data.fallback) {
          if (data.needsClarification) {
            history = history.concat([{ role: 'user', content: text }, { role: 'assistant', content: data.question || '' }]);
          } else if (data.output && data.output.summary) {
            history = history.concat([{ role: 'user', content: text }, { role: 'assistant', content: data.output.summary.guidance || '' }]);
          }
        }
      } else {
        data = await agentDiscover({ intent: text });
      }
      if (resetSeen) seenIds = [];
      if (data && data.success) {
        addAgentReply(data);
        input.placeholder = '还想怎么调？';
        const shown = (data.output.merchants || []).map((m) => m.id).filter(Boolean);
        seenIds.push(...shown);
      } else {
        convo.appendChild(h('div', { class: 'agent-error' }, [
          h('div', { class: 'agent-error-title', text: '抱歉，这次没匹配到' }),
          h('div', { class: 'agent-error-hint', text: (data && data.error) || '换个说法试试~' })
        ]));
        scrollToBottom();
      }
    } catch (e) {
      convo.appendChild(h('div', { class: 'agent-error' }, [
        h('div', { class: 'agent-error-title', text: '暂时连不上 Agent 后端' }),
        h('div', { class: 'agent-error-hint', text: '如果你刚启动后端，请等 2 秒后重试；或运行：MYWO_PORT=8799 DEEPSEEK_API_KEY=... node src/httpServer.js' }),
      ]));
      scrollToBottom();
    }
  }

  sendBtn.addEventListener('click', () => ask(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ask(input.value); });

  // 从首页带进来的初始问句：自动发起一次对话
  if (initialText && initialText.trim()) {
    setTimeout(() => ask(initialText.trim()), 60);
  }

  return root;
}
