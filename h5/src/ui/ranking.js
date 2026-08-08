// 榜单 —— UI 层（安全渲染 h()，无 innerHTML）。
// 复用 core/ranking.js 的 buildRankings；M8 详情页上线后，卡片点击跳转详情页。
import { h } from './dom.js';
import { merchants } from '../data/merchants.js';
import { buildRankings } from '../core/ranking.js';

const BOARDS = [
  { key: 'mustEat', title: '必吃榜', tag: '探过', hint: '真探过的必吃' },
  { key: 'value', title: '性价比榜', tag: '划算', hint: '好吃又不贵' },
  { key: 'lateNight', title: '夜宵榜', tag: '深夜', hint: '宵夜好去处' },
  { key: 'newest', title: '新收录', tag: '上新', hint: '最近新探的店' }
];

function RankCard(m, idx, goDetail) {
  const price = parsePriceSafe(m.avgPrice);
  const props = { class: 'r-card', type: 'button' };
  if (goDetail) props.onclick = () => goDetail(m.id);
  return h('button', props, [
    h('div', { class: 'r-rank', text: String(idx + 1) }),
    h('div', { class: 'r-main' }, [
      h('div', { class: 'r-name', text: m.name || '未命名商户' }),
      h('div', { class: 'r-sub' }, [
        h('span', { text: m.category || '其他' }),
        price != null
          ? h('span', { class: 'r-price', text: `人均 ¥${price}` })
          : h('span', { class: 'r-price', text: '人均 待补' })
      ])
    ]),
    m.rating === '必吃'
      ? h('span', { class: 'r-best', text: '必吃' })
      : m.rating === '推荐'
        ? h('span', { class: 'r-good', text: '推荐' })
        : null
  ]);
}

function parsePriceSafe(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function Board(def, items, goDetail) {
  const row = h('div', { class: 'rank-row' });
  if (!items.length) {
    row.appendChild(h('div', { class: 'empty', text: '暂无数据' }));
  } else {
    items.forEach((m, i) => row.appendChild(RankCard(m, i, goDetail)));
  }
  return h('div', { class: 'rank-board' }, [
    h('div', { class: 'rank-head' }, [
      h('div', { class: 'rank-title' }, [
        document.createTextNode(def.title),
        h('span', { class: 'tag', text: def.tag })
      ]),
      h('div', { class: 'rank-hint muted', text: def.hint })
    ]),
    row
  ]);
}

export function Ranking({ goDetail } = {}) {
  const boards = buildRankings(merchants, { limit: 10 });
  const root = h('div', { class: 'section', style: 'padding-top:0' });
  root.appendChild(h('h2', {}, [
    document.createTextNode('蛮有味榜单'),
    h('span', { class: 'tag', text: '每周更新' })
  ]));
  for (const b of BOARDS) root.appendChild(Board(b, boards[b.key], goDetail));
  return root;
}
