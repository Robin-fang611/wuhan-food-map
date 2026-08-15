// 隐私说明页（W8 · 2026-08-15）：手机号/口味档案/埋点用途 + 注销方式（合规底线）。
import { h } from './dom.js';

export function PrivacyPage(ctx) {
  const { onBack } = ctx;
  const root = h('div', { class: 'privacy-page' });
  root.appendChild(h('div', { class: 'topbar' }, [
    h('button', { class: 'nav-btn', type: 'button', text: '← 返回', onclick: () => onBack && onBack() }),
    h('div', { class: 'brand' }, [
      h('div', { class: 'seal', text: '味' }),
      h('div', { class: 'wordmark', text: '蛮有味' }),
    ]),
  ]));
  root.appendChild(h('div', { class: 'section' }, [
    h('h1', { class: 'privacy-title', text: '用户协议与隐私政策' }),
    h('p', { class: 'muted', text: '版本：2026-08-15 · 更新即生效，登录时需重新同意' }),
    h('h3', { text: '1. 我们收集什么' }),
    h('p', { text: '① 手机号：仅用于注册登录与找回账号（短信验证码通道）；② 口味档案：你主动选择或由推荐行为推导的偏好（辣度/预算/忌口），用于个性化推荐；③ 埋点：页面访问与推荐行为统计（匿名，不含可识别身份信息）。' }),
    h('h3', { text: '2. 我们如何使用' }),
    h('p', { text: '仅用于提供「今天吃啥」推荐、账号管理与产品改进。不做广告定向投放，不向任何第三方出售数据。' }),
    h('h3', { text: '3. 你的权利' }),
    h('p', { text: '① 随时修改昵称与口味档案；② 退出登录即注销本设备会话；③ 注销账号：在「我的 → 注销账号」一键删除手机号、收藏、券与上传记录（不可恢复）。' }),
    h('h3', { text: '4. 信任内核承诺' }),
    h('p', { text: '推荐排序永不被商户付费或分润关系影响（可审计）；没有合适的推荐时会明说，绝不硬凑。' }),
    h('h3', { text: '5. 联系' }),
    h('p', { text: '问题与投诉可通过「我的 → 反馈」或产品主页联系方式提出，我们将在 7 个工作日内处理。' }),
  ]));
  return root;
}
