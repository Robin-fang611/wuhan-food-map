// 管理员审核面板（Demo 内部工具 · 2026-08-15）
// 职责：待核验上传列表（/upload/pending）+ 审核动作（promote 收录 / reject 驳回，/upload/govern）
//       + 审计轨迹（/upload/audit）。管理员令牌由管理员本人输入，仅存 sessionStorage（关页即清），
//       绝不写入前端包 / localStorage（守密钥红线）。
// DOM 一律 h() 构建（无 innerHTML，防 XSS §8）。
import { h, clear, toast } from './dom.js';

const ADMIN_TOKEN_KEY = 'myw:admin:token';
const API = (globalThis.__MANYOUWEI_CONFIG__ && globalThis.__MANYOUWEI_CONFIG__.apiBase) || 'http://127.0.0.1:8799';

function getToken() {
  try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; }
}
function setToken(t) {
  try { sessionStorage.setItem(ADMIN_TOKEN_KEY, t); } catch { /* ignore */ }
}
function adminHeaders() {
  return { 'Content-Type': 'application/json', 'X-Admin-Token': getToken() };
}

async function api(path, init = {}) {
  const res = await fetch(API + path, { ...init, headers: { ...adminHeaders(), ...(init.headers || {}) } });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return iso; }
}

export async function AdminPanel({ onBack } = {}) {
  const root = h('div');
  let token = getToken();

  function render() {
    clear(root);
    root.appendChild(h('div', { class: 'detail-top' }, [
      h('button', { class: 'nav-btn', type: 'button', text: '返回', onclick: onBack }),
      h('span', { class: 'detail-top-title', text: '管理员审核' })
    ]));

    if (!token) {
      root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
        h('h2', { text: '管理员令牌' }),
        h('div', { class: 'card' }, [
          h('div', { class: 'muted', text: '输入 ADMIN_TOKEN（.env 中配置），仅本次浏览会话有效，不会写入存储。' }),
          h('div', { class: 'ac-nick-row', style: 'margin-top:10px' }, [
            h('input', {
              class: 'ac-nick-input', type: 'password', placeholder: 'ADMIN_TOKEN', 'aria-label': '管理员令牌',
              onkeydown: (e) => { if (e.key === 'Enter') submit(); },
            }),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '进入', onclick: submit }),
          ]),
          h('div', { class: 'upload-err' }),
        ]),
      ]));
      return;
    }

    root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
      h('div', { class: 'admin-stat muted', text: '加载中…' }),
    ]));
    const listWrap = h('div', { class: 'section', style: 'padding-top:0' });
    root.appendChild(listWrap);
    root.appendChild(h('div', { class: 'section', style: 'padding-top:0' }, [
      h('div', { class: 'admin-audit-head' }, [
        h('span', { text: '审核轨迹（最近 20 条）' }),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '退出管理', onclick: () => { setToken(''); token = ''; render(); } }),
      ]),
      h('div', { class: 'admin-audit muted', text: '加载中…' }),
    ]));

    loadList(listWrap);
    loadAudit();
  }

  function submit() {
    const input = root.querySelector('.ac-nick-input');
    const err = root.querySelector('.upload-err');
    const v = (input && input.value || '').trim();
    if (!v) { if (err) err.textContent = '请输入管理员令牌'; return; }
    setToken(v);
    token = v;
    render();
  }

  async function loadList(wrap) {
    const stat = root.querySelector('.admin-stat');
    try {
      const r = await api('/upload/pending?limit=50');
      clear(wrap);
      stat.textContent = `待核验 ${r.total} 条（展示 ${r.count} 条）· 收录即进正式库，驳回保留轨迹不删除`;
      if (!r.items.length) {
        wrap.appendChild(h('div', { class: 'card' }, [h('div', { class: 'muted', text: '没有待核验记录，清清爽爽~' })]));
        return;
      }
      for (const it of r.items) {
        wrap.appendChild(pendingCard(it, wrap, stat));
      }
    } catch (e) {
      stat.textContent = '';
      clear(wrap);
      wrap.appendChild(h('div', { class: 'card' }, [
        h('div', { class: 'agent-error-title', text: e.message === 'UNAUTHORIZED' ? '令牌无效或已失效' : '加载失败' }),
        h('div', { class: 'agent-error-hint', text: e.message === 'UNAUTHORIZED' ? '请退出后重新输入正确的 ADMIN_TOKEN。' : (e.message || '网络开小差，请重试。') }),
        h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: e.message === 'UNAUTHORIZED' ? '重新输入令牌' : '重试', style: 'margin-top:10px', onclick: () => { if (e.message === 'UNAUTHORIZED') { setToken(''); token = ''; } render(); } }),
      ]));
    }
  }

  function pendingCard(it, wrap, stat) {
    const noteInput = h('input', { class: 'ac-nick-input', type: 'text', placeholder: '备注（可选，记入审计）', 'aria-label': '审核备注' });
    const btnWrap = h('div', { class: 'admin-gov-actions' });
    const card = h('div', { class: 'card admin-pending-card' }, [
      h('div', { class: 'm-head' }, [
        h('div', { class: 'm-name', text: it.name || '（无名）' }),
        h('span', { class: 'm-tag', text: it.isStall ? '流动摊' : (it.category || '未分类') }),
      ]),
      it.address ? h('div', { class: 'muted', text: it.address }) : null,
      it.description ? h('div', { class: 'admin-desc', text: it.description }) : null,
      h('div', { class: 'muted', text: `${fmtTime(it.receivedAt)} · ${it.reason || ''}` }),
      h('div', { class: 'ac-nick-row', style: 'margin-top:10px' }, [noteInput, btnWrap]),
    ]);
    function doGov(action) {
      const note = (noteInput.value || '').trim();
      btnWrap.replaceChildren(h('span', { class: 'muted', text: '处理中…' }));
      api('/upload/govern', {
        method: 'POST',
        body: JSON.stringify({ uploadId: it.uploadId, action, by: 'admin-web', note }),
      }).then((r) => {
        if (r.ok) {
          toast(action === 'promote' ? `已收录 ${it.name}` : `已驳回 ${it.name}`);
          loadList(wrap, stat);
        } else {
          toast((r && r.error) || '操作失败');
          render();
        }
      }).catch((e) => {
        toast(e.message === 'UNAUTHORIZED' ? '令牌无效，请重新输入' : '操作失败，请重试');
        render();
      });
    }
    btnWrap.appendChild(h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '✓ 收录', onclick: () => doGov('promote') }));
    btnWrap.appendChild(h('button', { class: 'btn btn-danger-ghost btn-sm', type: 'button', text: '✗ 驳回', onclick: () => doGov('reject') }));
    return card;
  }

  async function loadAudit() {
    const el = root.querySelector('.admin-audit');
    try {
      const r = await api('/upload/audit?limit=20');
      clear(el);
      if (!r.items.length) { el.textContent = '暂无审核记录'; return; }
      for (const a of r.items) {
        el.appendChild(h('div', { class: 'admin-audit-row' }, [
          h('span', { class: 'admin-audit-act ' + (a.action === 'promote' ? 'act-promote' : 'act-reject'), text: a.action === 'promote' ? '收录' : '驳回' }),
          h('span', { class: 'admin-audit-id', text: a.uploadId || '' }),
          h('span', { class: 'admin-audit-note', text: a.note || '' }),
          h('span', { class: 'admin-audit-by', text: (a.by || '') + ' · ' + fmtTime(a.at) }),
        ]));
      }
    } catch (e) {
      clear(el);
      el.textContent = e.message === 'UNAUTHORIZED' ? '令牌无效，无法查看审计' : '审计加载失败';
    }
  }

  render();
  return root;
}
