/**
 * 江城 · 味觉地图 - 全局配置
 * 
 * ⚠️ 高德地图 API Key 安全（M11 / §8）：明文 Key 已从源码移除，绝不再入库。
 * Key 由运行时注入：构建/部署阶段写入 globalThis.__MANYOUWEI_CONFIG__.amapJsKey
 * （本地见 h5/.env 的 VITE_AMAP_JS_API_KEY，已被 .gitignore 忽略），本文件仅读取它。
 * 未注入时 key 为 ''，地图视图显示占位提示。高德控制台务必配置「域名白名单」+「安全密钥」。
 * v1.5 真实安全方案见 docs/高德Key安全接入.md（后端代理，Key 永不下发浏览器）。
 */
window.__AMAP_CONFIG__ = {
  key: (globalThis.__MANYOUWEI_CONFIG__ && globalThis.__MANYOUWEI_CONFIG__.amapJsKey) || '',
  version: '2.0',
  plugins: ['AMap.Scale', 'AMap.MarkerClusterer'],
  securityJsCode: ''  // 安全密钥同样不入库；v1.5 走后端代理（docs/高德Key安全接入.md）
};

/** 社群配置（多个群，弹窗内并列展示） */
window.__SOCIAL_CONFIG__ = {
  groups: [
    {
      title: '武汉吃喝玩乐群',
      subtitle: '一起探索武汉好味道 · 美食探店交流',
      qrCode: 'images/qrcode.png',
    },
    {
      title: '财大 LinkYou',
      subtitle: '添加领取：美食地图 · 周边游玩攻略',
      qrCode: 'images/qrcode.jpg',
    },
  ],
};
