'use strict';

const requested = new URLSearchParams(location.search).get('lang') || globalThis.abunasserDesktop?.language || navigator.language;
const language = /^ar(?:-|$)/i.test(requested || '') ? 'ar' : 'en';
const strings = language === 'ar' ? {
  name: 'ابوناصر TV', title: 'تعذر الاتصال بالتطبيق',
  description: 'تأكد من اتصال الإنترنت، ثم أعد المحاولة لفتح قنواتك وأفلامك ومسلسلاتك.',
  retry: 'إعادة المحاولة', icon: 'شعار ابوناصر TV',
} : {
  name: 'abbeedo TV', title: 'Unable to connect',
  description: 'Check your internet connection, then try again to open your channels, movies and series.',
  retry: 'Try again', icon: 'abbeedo TV logo',
};
document.documentElement.lang = language;
document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
document.title = strings.name;
document.getElementById('error-title').textContent = strings.title;
document.getElementById('error-description').textContent = strings.description;
document.getElementById('retry').textContent = strings.retry;
document.getElementById('brand-icon').alt = strings.icon;
document.getElementById('connection-error').hidden = false;
