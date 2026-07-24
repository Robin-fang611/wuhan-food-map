/* 江城 v2 — 模块页交互 */
// 手风琴 FAQ
document.querySelectorAll('.acc-item').forEach(function (item) {
  var q = item.querySelector('.acc-q');
  var a = item.querySelector('.acc-a');
  q.addEventListener('click', function () {
    var isOpen = item.classList.toggle('open');
    a.style.maxHeight = isOpen ? a.scrollHeight + 'px' : '0';
  });
});

// 返回
var backBtn = document.getElementById('backBtn');
if (backBtn) {
  backBtn.addEventListener('click', function () {
    if (history.length > 1) history.back();
    else location.href = 'index.html';
  });
}

// 群入口（复用 common.js 的 showSocialModal）
document.querySelectorAll('.group-entry').forEach(function (el) {
  el.addEventListener('click', function () {
    if (window.__SOCIAL_CONFIG__ && window.__SOCIAL_CONFIG__.campus) {
      showSocialModal(window.__SOCIAL_CONFIG__.campus);
    }
  });
});
