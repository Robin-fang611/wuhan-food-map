// 账号中心（M12）：登录/注册 + 我的收藏 + 我的优惠券（复用 Wallet）。
// DOM 一律 h() 构建（无 innerHTML，防 XSS §8）；视觉只用 tokens.css 变量。
// 真实微信登录与云端同步由 v1.5 BFF 提供（M13），本页仅做前端原型与界面骨架。

import { h, clear, toast } from './dom.js';
import { auth, maskContact } from '../core/auth.js';
import { merchants } from '../data/merchants.js';
import { Wallet } from './home.js';
import { analytics, EVENTS } from '../core/analytics.js';

export async function AccountView({ onBack, goDetail, goRedeem }) {
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
  }

  // —— 登录/注册（前端原型：手机/邮箱建立本地身份，无密码）——
  function renderLogin() {
    const wrap = h('div', { class: 'section', style: 'padding-top:0' }, [
      h('h2', { text: '登录 / 注册' })
    ]);
    const card = h('div', { class: 'card' });

    const nick = h('input', { class: 'ac-input', type: 'text', placeholder: '昵称（必填）', maxlength: '20', 'aria-label': '昵称' });
    const phone = h('input', { class: 'ac-input', type: 'tel', placeholder: '手机号', maxlength: '11', 'aria-label': '手机号' });
    const email = h('input', { class: 'ac-input', type: 'email', placeholder: '邮箱（手机/邮箱二选一）', 'aria-label': '邮箱' });

    const regBtn = h('button', { class: 'btn btn-primary btn-block', text: '注册并登录', style: 'margin-top:10px', onclick: async () => {
      const r = await auth.register({ nickname: nick.value, phone: phone.value.trim(), email: email.value.trim() });
      if (!r.ok) { toast(r.reason); return; }
      toast(`欢迎，${r.user.nickname}！`);
      mount();
    } });
    const loginBtn = h('button', { class: 'btn btn-ghost btn-block', text: '用手机/邮箱登录', style: 'margin-top:8px', onclick: async () => {
      const r = await auth.loginWithPhoneEmail({ phone: phone.value.trim(), email: email.value.trim() });
      if (!r.ok) { toast(r.reason); return; }
      toast('登录成功');
      mount();
    } });
    const wxBtn = h('button', { class: 'btn btn-ghost btn-block', text: '微信一键登录（即将上线）', style: 'margin-top:8px', onclick: async () => {
      try { await auth.loginWithWechat(); }
      catch (e) { toast('微信登录需 v1.5 后端授权'); }
    } });

    card.appendChild(h('div', { class: 'ac-form' }, [
      nick, phone, email, regBtn, loginBtn, wxBtn,
      h('div', { class: 'muted center', style: 'font-size:12px;margin-top:10px', text: '原型期无密码：仅建立本地身份，真鉴权将在 v1.5 上线' })
    ]));
    wrap.appendChild(card);
    return wrap;
  }

  // —— 已登录：账号信息 + 退出 ——
  function renderProfile(session) {
    const wrap = h('div', { class: 'section', style: 'padding-top:0' }, [
      h('h2', { text: '账号' })
    ]);
    const card = h('div', { class: 'card' }, [
      h('div', { class: 'ac-name', text: session.nickname || '蛮友' }),
      h('div', { class: 'muted', text: maskContact(session.phone || session.email || '') || '未绑定联系方式' }),
      h('button', { class: 'btn btn-ghost btn-block', text: '退出登录', style: 'margin-top:12px', onclick: async () => {
        await auth.logout();
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
