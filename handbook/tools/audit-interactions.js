/* 交互审计：用 jsdom 真正加载每个章节页并运行 config.js + app.js，
   捕获 init() 期间抛出的错误，并模拟点回退/目录/分享/进群/搜索，
   确认交互真的生效（不靠肉眼，不靠猜）。
   运行：NODE_PATH=<node_modules> node tools/audit-interactions.js */
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');

const DIR = path.join(__dirname, '..');
const PAGES = ['index','xinsheng','jiaotong','sushe','junxun','xiaoqu','rushi','xueye','shenghuo','jiangzhu','shetuan','zuzhi','jingsai','tice','growth'];

function click(w, el) {
  if (!el) return false;
  try { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); return true; }
  catch (e) { return false; }
}

(async () => {
  let failures = 0;
  for (const page of PAGES) {
    const file = path.join(DIR, page + '.html');
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail && e.detail.message ? e.detail.message : (e.detail || e.message))));

    let dom;
    try {
      dom = await JSDOM.fromFile(file, {
        runScripts: 'dangerously',
        resources: 'usable',
        pretendToBeVisual: true,
        virtualConsole: vc
        // 不设 url：默认用本地 file://，确保加载的是本地（已修复的）脚本，而非线上旧版
      });
    } catch (e) {
      console.log(`[FAIL] ${page} 加载失败: ${e.message}`);
      failures++;
      continue;
    }

    dom.window.addEventListener('error', e => errors.push('winError: ' + (e.message || 'unknown')));

    // 陷阱：捕获具体哪个 DOM 调用抛了 NotFoundError（定位用）
    ['insertBefore', 'removeChild', 'appendChild'].forEach(name => {
      const orig = dom.window.Node.prototype[name];
      dom.window.Node.prototype[name] = function () {
        try { return orig.apply(this, arguments); }
        catch (e) { errors.push('DOM_' + name + ' THREW: ' + e.message + '\n' + new Error().stack); throw e; }
      };
    });

    await new Promise(res => {
      if (dom.window.document.readyState === 'complete') return res();
      dom.window.addEventListener('load', res);
      setTimeout(res, 1500);
    });
    await new Promise(r => setTimeout(r, 600));

    const w = dom.window, d = w.document;
    const r = { page };
    r.initError = errors.length ? errors.join(' | ') : '';
    r.pv = !!(w.localStorage && w.localStorage.getItem('jc_stat_pv'));

    // 1) 回退：验证处理器真的绑定（覆盖 jsdom 的导航限制：stub history.back + 拦截 location.href 赋值）
    const back = d.getElementById('backBtn');
    r.back = !!back;
    if (back) {
      let backCalled = false, hrefSet = false;
      w.history.back = () => { backCalled = true; };
      try { Object.defineProperty(w.location, 'href', { configurable: true, set() { hrefSet = true; } }); } catch (e) {}
      click(w, back);
      r.backWorks = backCalled || hrefSet;
    }

    // 2) 目录抽屉：按钮存在 + 点击展开/关闭
    const tocBtn = d.getElementById('tocBtn');
    r.tocBtn = !!tocBtn;
    const drawer = d.getElementById('tocDrawer');
    r.tocDrawer = !!drawer;
    if (tocBtn) {
      click(w, tocBtn);
      r.tocOpens = !!(drawer && drawer.classList.contains('show'));
      const closeBtn = d.getElementById('tocClose');
      click(w, closeBtn);
      r.tocCloses = !!(drawer && !drawer.classList.contains('show'));
    }

    // 3) 分享：点 #shareBtn → 出现 .share-sheet（hero 或 appbar 里的都算）
    const shareBtn = d.getElementById('shareBtn');
    r.shareBtn = !!shareBtn;
    if (shareBtn) {
      click(w, shareBtn);
      r.shareOpens = !!d.querySelector('.share-sheet');
    }

    // 4) 进群：点 .js-group-entry / #groupEntry → 不报错（有群则出现 .ad-overlay）
    const ge = d.querySelector('.js-group-entry, #groupEntry');
    r.groupEntry = !!ge;
    if (ge) {
      try { ge.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); r.groupOk = true; }
      catch (e) { r.groupOk = false; r.groupErr = e.message; }
      r.adOverlay = !!d.querySelector('.ad-overlay');
    }

    // 5) 搜索：点 .js-search / #searchTrigger → 出现 .search-overlay
    const searchTrigger = d.querySelector('.js-search, #searchTrigger');
    r.searchTrigger = !!searchTrigger;
    if (searchTrigger) {
      click(w, searchTrigger);
      r.searchOpens = !!d.querySelector('.search-overlay');
    }

    // 6) 结构组件是否注入
    r.chapFoot = !!d.querySelector('.chap-foot');
    r.tabbar = !!d.querySelector('.tabbar');
    r.pageNav = !!d.querySelector('.page-nav');

    // 7) 首页必做清单：点一下能切换勾选态（localStorage 在 jsdom file:// 可能不可用，但 class 切换必须生效）
    const mitems = d.querySelectorAll('.mitem');
    if (mitems.length) {
      const m0 = mitems[0];
      const before = m0.classList.contains('done');
      click(w, m0);
      r.mustToggle = m0.classList.contains('done') !== before;
    }

    // index 无回退/TOC（设计如此）；growth 是独立页（未挂 app.js）；其余 13 章需全交互就位
    const isChapter = page !== 'index' && page !== 'growth';
    const ok = !r.initError && (isChapter
      ? (r.back && r.tocBtn && r.tocOpens && r.tocCloses && r.shareOpens && r.searchOpens)
      : (r.searchOpens && (page !== 'index' || r.mustToggle)));
    if (!ok) failures++;
    console.log(`[${(ok ? 'OK ' : 'FAIL')}] ${page}`);
    console.log('   ' + JSON.stringify({
      initErr: r.initError || null, pv: r.pv, back: r.back, backWorks: r.backWorks,
      tocBtn: r.tocBtn, tocOpens: r.tocOpens, tocCloses: r.tocCloses,
      shareBtn: r.shareBtn, shareOpens: r.shareOpens,
      groupEntry: r.groupEntry, adOverlay: r.adOverlay,
      searchTrigger: r.searchTrigger, searchOpens: r.searchOpens, mustToggle: r.mustToggle,
      chapFoot: r.chapFoot, tabbar: r.tabbar, pageNav: r.pageNav
    }));

    dom.window.close();
  }
  console.log(`\n=== 失败 ${failures} / ${PAGES.length} ===`);
  process.exit(failures ? 1 : 0);
})();
