(function () {
  'use strict';
  var target = 'https://www.abbeedo.com/app?tv=webos';
  var status = document.getElementById('status');
  var retry = document.getElementById('retry');
  var english = /^en/i.test(navigator.language || '');
  function openApp() {
    if (navigator.onLine === false) {
      status.textContent = english ? 'Connect the TV to the internet, then try again.' : 'اتصل بالإنترنت على التلفزيون ثم أعد المحاولة.';
      retry.focus();
      return;
    }
    status.textContent = english ? 'Opening abbeedo TV…' : 'جارٍ فتح ابوناصر TV…';
    location.replace(target);
  }
  retry.addEventListener('click', openApp);
  window.addEventListener('online', openApp);
  document.addEventListener('keydown', function (event) {
    if (event.keyCode === 13) openApp();
  });
  openApp();
}());
