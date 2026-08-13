// 账号中心（M12）：登录/注册 + 我的收藏 + 我的优惠券（复用 Wallet）。
// DOM 一律 h() 构建（无 innerHTML，防 XSS §8）；视觉只用 tokens.css 变量。
// 真实微信登录与云端同步由 v1.5 BFF 提供（M13），本页仅做前端原型与界面骨架。

import { h, clear, toast } from './dom.js';
import { auth, maskContact } from '../core/auth.js';
import { allMerchants as merchants } from '../data/all-merchants.js';
import { Wallet } from './home.js';
import { LoginView } from './login.js';
import * as authApi from '../api/auth-client.js';
import { analytics, EVENTS } from '../core/analytics.js';

export async function AccountView({ onBack, goDetail, goRedeem, goGrowth }) {
  const root = h('div');

  async function mount() {
    clear(root);
    const session = await auth.getSession();
    root.appendChild(h('div', { class: 'detail-top' }, [
      h('button', { class: 'nav-btn', type: 'button', text: '返回', onclick: onBack }),
      h('span', { class: 'detail-top-title', text: '我的' })
    ]));

    if (!session) root.appendChild(renderLogin());
    else root.appendChild(renderProfile(session));

    root.appendChild(await renderFavorites(session, goDetail));
    // 我的优惠券：复用 Wallet 组件（登录后归属真实用户，store 按 userId 隔离）。
    root.appendChild(await Wallet({ userId: auth.currentUserId() || 'demo-user' }));

    root.appendChild(h('div', { class: 'footnote', text: '原型说明：账号与收藏存于本地（localStorage）。微信登录与云端同步需 v1.5 后端（M13 BFF）。' }));

    // 商家核销台入口（内部工具，v1.5）
    if (goRedeem) {
      root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
        h('button', { class: 'btn btn-ghost btn-block', text: '商家核销台（内部·v1.5）', style: 'margin-top:6px', onclick: () => goRedeem() })
      ]));
    }

    // 增长看板入口（内部工具，v3.4）：只读本地埋点，不向外部上报。
    if (goGrowth) {
      root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
        h('button', { class: 'btn btn-ghost btn-block', text: '增长看板（内部·v3.4）', style: 'margin-top:6px', onclick: () => goGrowth() })
      ]));
    }
  }

  // —— 登录/注册（小程序式：图形验证码 + 短信验证码 + 微信，走后端 :8799）——
  function renderLogin() {
    return h('div', { class: 'section', style: 'padding-top:0' }, [
      h('h2', { text: '登录 / 注册' }),
      h('div', { class: 'card' }, [ LoginView({ onLoggedIn: mount }) ]),
    ]);
  }

  // —— 已登录：账号信息 + 退出 ——
  function renderProfile(session) {
    const wrap = h('div', { class: 'section', style: 'padding-top:0' }, [
      h('h2', { text: '账号' })
    ]);
    const contact = session.phoneMasked || maskContact(session.phone || session.email || '') || '未绑定联系方式';
    const card = h('div', { class: 'card' }, [
      h('div', { class: 'ac-name', text: session.nickname || '蛮友' }),
      h('div', { class: 'muted', text: contact }),
      h('button', { class: 'btn btn-ghost btn-block', text: '退出登录', style: 'margin-top:12px', onclick: async () => {
        await auth.logout();
        authApi.setStoredToken('');
        toast('已退出');
        mount();
      } })
    ]);
    wrap.appendChild(card);
    return wrap;
  }

  // —— 我的收藏（云端收藏原型：按 userId 隔离 + 未登录 anon 合并）——
  async function renderFavorites(session, goDetail) {
    const wrap = h('div', { class: 'section', style: 'padding-top:0' }, [h('h2', { text: '我的收藏' })]);
    const ids = await auth.getFavorites();
    if (!ids.length) {
      wrap.appendChild(h('div', { class: 'card' }, [
        h('div', { class: 'muted', text: session ? '还没有收藏，去商户详情点「收藏」吧~' : '未登录也可临时收藏，登录后自动合并~' })
      ]));
      return wrap;
    }
    const grid = h('div', { class: 'section', style: 'padding-top:0' });
    for (const id of ids) {
      const m = merchants.find((x) => x.id === id);
      if (!m) continue;
      const rm = h('button', { class: 'fav-remove', type: 'button', text: '取消', onclick: async () => {
        await auth.removeFavorite(id);
        analytics.track(EVENTS.FAVORITE, { id, action: 'remove' });
        mount();
      } });
      const card = h('div', { class: 'm-card', role: 'button', dataset: { id }, onclick: () => goDetail && goDetail(id) }, [
        h('div', { class: 'm-head' }, [
          h('div', { class: 'm-name', text: m.name || '未命名商户' }),
          rm
        ]),
        h('div', { class: 'm-meta' }, [
          h('span', { class: 'm-tag', text: m.category || '其他' }),
          m.avgPrice != null && m.avgPrice !== '' ? h('span', { class: 'm-price', text: `¥${m.avgPrice}` }) : null
        ])
      ]);
      grid.appendChild(card);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  await mount();
  return root;
}
