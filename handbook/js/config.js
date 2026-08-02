/**
 * 江城 · 新生手册 —— 全站配置
 *
 * 这是唯一需要运营同学手动维护的文件：
 *   - 换群二维码：改 __SOCIAL_CONFIG__.groups[].qrCode
 *   - 发更新提示：改 __UPDATE_CONFIG__（id 换新值才会重新弹给已关过的人）
 *   - 改分享话术：改 __SITE_CONFIG__.shareText
 */

/** 站点级配置 */
window.__SITE_CONFIG__ = {
  /** 线上域名（分享链接以此为准，避免复制到 localhost） */
  origin: 'https://zuel-freshman.netlify.app',

  /** 分享话术（后面会自动拼接链接） */
  shareText: '财大 2026 新生手册，报到/军训/选课/宿舍攻略都在这，学长学姐实地整理👉',

  /** 埋点上报地址；留空则只在本地计数，不发任何请求 */
  analyticsEndpoint: '',

  /** 本期修订版本，显示在首页封面 */
  edition: '总第叁期',
  updatedAt: '08-03'
};

/**
 * 社群配置（弹窗内并列展示）
 * ⚠️ 微信个人码 7 天过期，换码 SOP：先传新图 → 改这里 → 旧码保留 48h 防加错
 */
window.__SOCIAL_CONFIG__ = {
  groups: [
    {
      title: '2026 新生群',
      subtitle: '师兄师姐在线答疑，选课/宿舍/社团全搞定',
      qrCode: 'images/qrcode.jpg'
    },
    {
      title: '财大 LinkYou',
      subtitle: '添加领取：入学测试答案 / 选课宝典 / 培养方案',
      qrCode: 'images/qrcode.jpg'
    }
  ]
};

/**
 * 全站更新提示条（不需要时把 text 置空即可隐藏）
 * id 变更后，之前关闭过提示条的用户会重新看到。
 */
window.__UPDATE_CONFIG__ = {
  id: '2026-08-03',
  text: '本期已按 2026 级信息全面校订，报到日期以录取通知书为准'
};
