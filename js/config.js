/**
 * 武汉美食地图 - 全局配置
 * 
 * ⚠️ 高德地图 API Key 配置说明：
 * 请到 https://console.amap.com/dev/key/app 申请「Web端（JS API）」Key
 * 将下方 YOUR_AMAP_JS_API_KEY 替换为你的 Key 即可启用地图功能
 * 
 * 未配置 Key 时，应用仍可正常使用列表浏览、筛选、搜索功能，
 * 仅地图视图会显示占位提示。
 */
window.__AMAP_CONFIG__ = {
  key: '9da1d18cc3c8b536f3b328293c2af861',
  version: '2.0',
  plugins: ['AMap.Scale', 'AMap.MarkerClusterer'],
  securityJsCode: '',  // 如启用了安全密钥，填入此处
};

/** 社群配置 */
window.__SOCIAL_CONFIG__ = {
  campus: {
    title: '加入财大吃喝玩乐群',
    subtitle: '学长学姐带你吃遍财大周边',
    qrCode: 'images/qrcode.jpg',
    link: '',
  },
  city: {
    title: '加入武汉新生吃喝玩乐群',
    subtitle: '带你吃遍武汉三镇',
    qrCode: 'images/qrcode.jpg',
    link: '',
  },
};
