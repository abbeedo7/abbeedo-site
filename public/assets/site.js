import {SHARED_ACCENT_KEY,getSharedAccent,setSharedAccent} from './shared-accent.js';
import {applyAccentColors} from './accent-colors.js';
import {startBackground, triggerGlitch} from './background.js?site=2.1';

const PREFERENCES_KEY = 'abbeedo:website:preferences:v2';
const SCROLL_KEY = 'abbeedo:site:reload-scroll:v1';
const NOTICE_KEY = 'abbeedo:website:notices:v1';
const DEFAULTS = Object.freeze({language:'ar',accent:'#ff242d',contrast:false,motion:'standard',reduced:false,textScale:1,theme:'dark',notifications:false});
const RELEASE_KEYS = ['android','windows','portable'];
const VERSION = /^\d{1,5}(?:\.\d{1,5}){1,3}$/;
let preferences = {...DEFAULTS}, memoryPreferences = null;

export function cleanPreferences(input={}) {
  const value = input && typeof input==='object' && !Array.isArray(input) ? input : {};
  return {language:['ar','en'].includes(value.language)?value.language:DEFAULTS.language,
    accent:/^#[a-f\d]{6}$/i.test(value.accent||'')?value.accent.toLowerCase():DEFAULTS.accent,
    contrast:value.contrast===true,motion:['standard','fast','off'].includes(value.motion)?value.motion:DEFAULTS.motion,
    reduced:value.reduced===true,textScale:Number.isFinite(Number(value.textScale))&&Number(value.textScale)>=1&&Number(value.textScale)<=1.3?Number(value.textScale):1,
    theme:['dark','light','sport','cinema'].includes(value.theme)?value.theme:DEFAULTS.theme,
    notifications:value.notifications===true};
}

function readLocalPreferences() {
  if(memoryPreferences)return {...memoryPreferences};
  try {
    const stored=localStorage.getItem(PREFERENCES_KEY);
    if(stored)return cleanPreferences(JSON.parse(stored));
    const old=JSON.parse(localStorage.getItem('f7rv.site.preferences.v1')||'null');
    if(old&&typeof old==='object')return cleanPreferences({language:old.language,accent:old.accent,contrast:old.contrast,reduced:old.reducedMotion,motion:old.speed==='still'?'off':old.speed==='fast'?'fast':'standard'});
  } catch {}
  return {...DEFAULTS};
}
function readPreferences(){const local=readLocalPreferences();return {...local,accent:getSharedAccent(local.accent)};}
function refreshSharedAccent(){const accent=getSharedAccent(preferences.accent);if(accent&&accent!==preferences.accent){preferences={...preferences,accent};memoryPreferences={...preferences};applyPreferences();}}
function bindSharedAccent(){window.addEventListener('storage',event=>{if(event.key===SHARED_ACCENT_KEY||event.key===null)refreshSharedAccent();});window.addEventListener('pageshow',refreshSharedAccent);window.addEventListener('focus',refreshSharedAccent);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSharedAccent();});}
function savePreferences() {
  memoryPreferences={...preferences};
  try {localStorage.setItem(PREFERENCES_KEY,JSON.stringify(preferences));return true;} catch {return false;}
}
const words=(ar,en)=>preferences.language==='en'?en:ar;
const brand=()=>words('ابوناصر TV','abbeedo TV');
const siteBrand=()=>words('ابوناصر','abbeedo');
const byID=id=>document.getElementById(id);
let toastTimer=0,storageExplained=false,lastInteraction=Date.now(),releaseResult=null,releaseFailure=false,releaseCheckedAt=null;
let currentRevision='',pendingRevision='',reloadTimer=0,pollTimer=0,inFlight=null,pollController=null,generation=0,stopped=false,reloading=false;
let notificationAdapter=null,notificationReady=false,announcementMonitor=null,permissionBusy=false;
let noticeState=readNoticeState();

function readNoticeState() {
  try {const raw=localStorage.getItem(NOTICE_KEY);if(raw&&raw.length<=12000){const value=JSON.parse(raw);if(value?.version===1)return nextReleaseNoticeState(value,{}).state;}}catch{}
  return {version:1,initialized:false,versions:{},ids:[]};
}
function saveNoticeState() {try{localStorage.setItem(NOTICE_KEY,JSON.stringify(noticeState));}catch{}}
function versionOrder(a,b) {const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const difference=(x[i]||0)-(y[i]||0);if(difference)return Math.sign(difference);}return 0;}
/** Bounded, non-sensitive history. The first valid release feed seeds silently. */
export function nextReleaseNoticeState(previous={},rows={}) {
  const initialized=previous?.initialized===true;
  const versions=Object.fromEntries(Object.entries(previous?.versions||{}).filter(([key,value])=>['android','windows'].includes(key)&&VERSION.test(value||'')));
  const ids=Array.isArray(previous?.ids)?previous.ids.filter(value=>typeof value==='string'&&/^(?:release-(?:android|windows)-[\d.]+|site-web-[a-f\d]{8,64})$/i.test(value)).slice(-64):[];
  const selected={android:rows.android,windows:rows.windows?.available?rows.windows:rows.portable};
  const notices=[];
  for(const [key,row]of Object.entries(selected)){
    if(!row?.available||!VERSION.test(row.version||''))continue;
    const id='release-'+key+'-'+row.version,old=versions[key];
    if(initialized&&!ids.includes(id)&&(!old||versionOrder(row.version,old)>0))notices.push({id,key,version:row.version});
    if(!old||versionOrder(row.version,old)>0)versions[key]=row.version;
    if(!ids.includes(id))ids.push(id);
  }
  return {state:{version:1,initialized:initialized||Object.keys(versions).length>0,versions,ids:ids.slice(-64)},notices};
}
async function systemNotice(value,kind='site') {
  if(!preferences.notifications||!notificationAdapter||document.hidden||stopped)return;
  const bridge=globalThis.abunasserDesktop;
  if(kind==='release'&&bridge?.nativeUpdates===true)return;
  try{await notificationAdapter.deliverNotification({...value,title:siteBrand()});}catch{}
}
function observeReleaseUpdates(rows) {
  const result=nextReleaseNoticeState(noticeState,rows);noticeState=result.state;saveNoticeState();
  for(const notice of result.notices){
    const label=notice.key==='android'?'Android':'Windows';
    void systemNotice({id:notice.id,body:words('يتوفر تحديث جديد لـ '+label+' · '+notice.version,'A new '+label+' update is available · '+notice.version),url:new URL('/apps',location.origin).href},'release');
  }
}
function observeSiteUpdate(revision) {
  const id='site-'+revision;
  if(noticeState.ids.includes(id))return;
  noticeState.ids=[...noticeState.ids,id].slice(-64);saveNoticeState();
  void systemNotice({id,body:words('تحديث جديد للموقع جاهز. سيُطبق عند التوقف عن التفاعل.','A website update is ready and will apply when you are idle.'),url:new URL(location.pathname,location.origin).href});
}

export function validateReleaseFeed(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid release feed');
  const rows={android:input.android,windows:input.windows?.setup,portable:input.windows?.portable};
  const expected={android:'/downloads/android.apk',windows:'/downloads/windows.exe',portable:'/downloads/windows-portable.exe'};
  for(const key of RELEASE_KEYS) {
    const row=rows[key];
    if(!row||typeof row!=='object'||typeof row.available!=='boolean')throw new Error('Invalid release status');
    if(row.available&&(!(row.version===null||VERSION.test(row.version||''))||row.url!==expected[key]))throw new Error('Invalid release information');
  }
  return rows;
}

function toast(message) {
  const element=byID('toast');if(!element)return;
  element.textContent=message;element.hidden=false;clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{element.hidden=true;},4400);
}
function localize() {
  document.documentElement.lang=preferences.language;
  document.documentElement.dir=preferences.language==='ar'?'rtl':'ltr';
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content',preferences.language==='ar'?'ابوناصر':'abbeedo');
  for(const element of document.querySelectorAll('[data-ar][data-en]'))element.textContent=element.dataset[preferences.language];
  for(const element of document.querySelectorAll('[data-brand-name]'))element.textContent=brand();
  for(const element of document.querySelectorAll('[data-site-brand]'))element.textContent=siteBrand();
  for(const element of document.querySelectorAll('[data-ar-label][data-en-label]'))element.setAttribute('aria-label',element.dataset[preferences.language==='ar'?'arLabel':'enLabel']);
  for(const element of document.querySelectorAll('[data-ar-alt][data-en-alt]'))element.alt=element.dataset[preferences.language==='ar'?'arAlt':'enAlt'];
  const applications=location.pathname.replace(/\/+$/,'')==='/apps';
  document.title=applications?words('التطبيقات والتحميل | ابوناصر','Apps and downloads | abbeedo'):siteBrand();
  document.querySelector('meta[name="description"]')?.setAttribute('content',words('ابوناصر — ابوناصر TV واشتراكاتك الرقمية في مكان واحد.','abbeedo — abbeedo TV and your digital subscriptions in one place.'));
  renderReleaseStatus();
}
function syncPreferenceControls() {
  const values={'language-select':preferences.language,'accent-input':preferences.accent,'motion-select':preferences.motion,'font-select':String(preferences.textScale),'theme-select':preferences.theme};
  for(const [id,value]of Object.entries(values)){const control=byID(id);if(control)control.value=value;}
  const languageName=preferences.language==='en'?'English':'العربية',languageSummary=byID('site-language-summary');
  if(languageSummary){languageSummary.textContent=languageName;languageSummary.setAttribute('aria-label',words('اللغة: ','Language: ')+languageName);}
  for(const button of document.querySelectorAll('[data-site-language]'))button.setAttribute('aria-pressed',String(button.dataset.siteLanguage===preferences.language));
  if(byID('contrast-toggle'))byID('contrast-toggle').checked=preferences.contrast;
  if(byID('reduced-toggle'))byID('reduced-toggle').checked=preferences.reduced;
  const alerts=byID('website-notifications-toggle');if(alerts){alerts.checked=preferences.notifications;alerts.disabled=!notificationReady||permissionBusy;}
}
function applyPreferences() {
  document.documentElement.style.setProperty('--accent',preferences.accent);
  document.documentElement.style.setProperty('--scale',String(preferences.textScale));
  document.body.dataset.background=preferences.motion;
  document.body.dataset.reducedMotion=String(preferences.reduced);
  document.body.dataset.highContrast=String(preferences.contrast);
  document.body.dataset.theme=preferences.theme;
  applyAccentColors(document,preferences.accent,{theme:preferences.theme,highContrast:preferences.contrast});
  localize();syncPreferenceControls();
  document.documentElement.dataset.preferencesReady='true';
  window.dispatchEvent(new CustomEvent('abbeedo:website-preferences',{detail:{...preferences}}));
}
function updatePreference(patch) {
  preferences=cleanPreferences({...preferences,...patch});if(Object.hasOwn(patch,'accent'))setSharedAccent(preferences.accent);else preferences.accent=getSharedAccent(preferences.accent);const saved=savePreferences();applyPreferences();
  const notice=byID('settings-storage-status');if(notice)notice.textContent=saved?words('تُحفظ اختياراتك تلقائيًا على هذا الجهاز.','Preferences are saved automatically on this device.'):words('تعمل اختياراتك خلال هذه الزيارة. التخزين غير متاح في هذا المتصفح.','Preferences work for this visit. Storage is unavailable in this browser.');
  if(!saved&&!storageExplained){storageExplained=true;toast(words('تعمل الإعدادات لهذه الزيارة؛ لم يسمح المتصفح بحفظها.','Preferences work for this visit; this browser did not allow saving.'));}
}
function notificationStatus(message) {
  const status=byID('website-notifications-status');if(status)status.textContent=message;
}
async function notificationChoice(control) {
  if(!notificationAdapter||!notificationReady||permissionBusy){control.checked=preferences.notifications;return;}
  const enable=control.checked;permissionBusy=true;control.disabled=true;
  try {
    const bridge=globalThis.abunasserDesktop;
    if(!enable){
      if(typeof bridge?.setNotificationsEnabled==='function'){
        const result=await bridge.setNotificationsEnabled(false);
        if(result?.ok!==true||result.enabled!==false)throw Error('Native notification choice unavailable');
      }
      updatePreference({notifications:false});
      notificationStatus(words('أُوقفت إشعارات النظام للموقع. تبقى التنبيهات متاحة أثناء فتحه.','Website system notifications are off. In-page announcements remain available.'));
      return;
    }
    // The adapter has loaded already: request permission directly in this change gesture.
    const result=await notificationAdapter.requestNotificationPermission();
    if(result.granted!==true){
      updatePreference({notifications:false});
      const explanation=result.reason==='install-required'?words('إشعارات الآيفون تحتاج تشغيل النسخة المثبتة على الشاشة الرئيسية.','iPhone notifications require the Home Screen app.'):words('لم يُسمح بإشعارات النظام. تبقى التنبيهات متاحة داخل الصفحة.','System notification permission was not granted. In-page announcements remain available.');
      notificationStatus(explanation);toast(explanation);return;
    }
    if(typeof bridge?.setNotificationsEnabled==='function'){
      const enabled=await bridge.setNotificationsEnabled(true);
      if(enabled?.ok!==true||enabled.enabled!==true)throw Error('Native notification choice unavailable');
    }
    updatePreference({notifications:true});
    notificationStatus(words('سُمح بإشعارات التحديثات والتنبيهات الجديدة أثناء تشغيل الموقع.','New update and announcement notifications are enabled while the website is running.'));
    toast(words('تم السماح بالإشعارات.','Notifications allowed.'));
  } catch {
    control.checked=preferences.notifications;
    const message=words('تعذر تغيير إذن الإشعارات الآن. حاول مجددًا.','Could not change notification permission now. Please try again.');
    notificationStatus(message);toast(message);
  } finally {permissionBusy=false;syncPreferenceControls();}
}
async function setupWebsiteNotifications() {
  const control=byID('website-notifications-toggle');
  if(control){control.disabled=true;control.addEventListener('change',()=>void notificationChoice(control));}
  try {
    notificationAdapter=await import('/app/notifications.js?site=2.1');
    if(stopped)return;
    const bridge=globalThis.abunasserDesktop;
    if(typeof bridge?.getNotificationsEnabled==='function'){
      const status=await bridge.getNotificationsEnabled();
      const enabled=status?.ok===true&&status.enabled===true;
      if(enabled!==preferences.notifications){preferences.notifications=enabled;savePreferences();}
    }else if(preferences.notifications&&globalThis.Notification?.permission!=='granted'){
      preferences.notifications=false;savePreferences();
    }
    notificationReady=true;syncPreferenceControls();
    notificationStatus(words('التنبيهات داخل الصفحة متاحة. إشعارات النظام اختيارية بإذنك.','In-page announcements are available. System notifications are optional with your permission.'));
    announcementMonitor=notificationAdapter.createAnnouncementMonitor({
      endpoint:new URL('/api/announcements',location.origin).href,isEnabled:()=>true,
      shouldDeliver:()=>preferences.notifications&&globalThis.abunasserDesktop?.nativeAnnouncements!==true,
      onMessage:message=>toast([message.title,message.body].filter(Boolean).join(' · '))
    });
    if(!stopped)void announcementMonitor.start();
  } catch {
    notificationReady=false;syncPreferenceControls();
    notificationStatus(words('تعذر تحميل خدمة الإشعارات. أعد فتح الصفحة للمحاولة.','Could not load the notification service. Reopen this page to try again.'));
  }
}
function bindPreferences() {
  const dialog=byID('settings-dialog'),languagePicker=byID('site-language-picker');let opener=null;
  const closeLanguagePicker=()=>{if(languagePicker)languagePicker.open=false;};
  languagePicker?.addEventListener('keydown',event=>{if(event.key==='Escape'&&languagePicker.open){event.preventDefault();event.stopPropagation();closeLanguagePicker();byID('site-language-summary')?.focus({preventScroll:true});}});
  for(const button of document.querySelectorAll('[data-site-language]'))button.addEventListener('click',()=>{const control=byID('language-select');if(!control)return;control.value=button.dataset.siteLanguage;closeLanguagePicker();control.dispatchEvent(new Event('change',{bubbles:true}));byID('settings-close')?.focus({preventScroll:true});});
  for(const button of document.querySelectorAll('[data-settings-open]'))button.addEventListener('click',()=>{if(!dialog)return;opener=button;syncPreferenceControls();closeLanguagePicker();if(!dialog.open){dialog.showModal();byID('settings-close')?.focus({preventScroll:true});}});
  byID('settings-close')?.addEventListener('click',()=>dialog?.close());
  dialog?.addEventListener('close',()=>{closeLanguagePicker();opener?.focus({preventScroll:true});tryAutomaticReload();});
  const controls=[['language-select','language'],['accent-input','accent'],['motion-select','motion'],['font-select','textScale'],['theme-select','theme'],['contrast-toggle','contrast'],['reduced-toggle','reduced']];
  for(const [id,key]of controls){const control=byID(id);control?.addEventListener(id==='accent-input'?'input':'change',()=>updatePreference({[key]:control.type==='checkbox'?control.checked:key==='textScale'?Number(control.value):control.value}));}
  document.querySelector('[data-reset-preferences]')?.addEventListener('click',()=>updatePreference({...DEFAULTS,language:preferences.language}));
}
function closeMenu() {
  const menu=byID('main-nav'),toggle=byID('menu-toggle');if(!menu||!toggle)return;
  menu.dataset.open='false';menu.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');
}
function bindMenu() {
  const menu=byID('main-nav'),toggle=byID('menu-toggle');if(!menu||!toggle)return;
  toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';menu.dataset.open=String(open);menu.classList.toggle('is-open',open);toggle.setAttribute('aria-expanded',String(open));});
  menu.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&toggle.getAttribute('aria-expanded')==='true'){closeMenu();toggle.focus();}});
  document.addEventListener('click',event=>{if(!menu.contains(event.target)&&!toggle.contains(event.target))closeMenu();});
}
async function copy(value) {
  const text=String(value||'');if(!text)return false;
  try {if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}} catch {}
  const input=document.createElement('textarea');input.value=text;input.setAttribute('readonly','');input.style.cssText='position:fixed;inset:0;opacity:0;pointer-events:none';document.body.append(input);
  const previous=document.activeElement;input.select();input.setSelectionRange(0,text.length);
  let success=false;try{success=document.execCommand('copy');}catch{}input.remove();previous?.focus?.({preventScroll:true});return success;
}
function bindCopies() {
  for(const button of document.querySelectorAll('[data-copy]'))button.addEventListener('click',async()=>{const success=await copy(button.dataset.copy);toast(success?words('تم النسخ.','Copied.'):words('تعذر النسخ. حدد النص وانسخه يدويًا.','Could not copy. Select the text and copy it manually.'));});
  for(const button of document.querySelectorAll('[data-share]'))button.addEventListener('click',async()=>{
    let url;try{url=new URL(button.dataset.share||location.href,location.origin);if(!['https:','http:'].includes(url.protocol))throw Error();}catch{return;}
    if(navigator.share){try{await navigator.share({title:brand(),url:url.href});return;}catch(error){if(error?.name==='AbortError')return;}}
    toast(await copy(url.href)?words('تم نسخ الرابط للمشاركة.','Link copied for sharing.'):words('تعذر نسخ رابط المشاركة.','Could not copy the sharing link.'));
  });
}
function bindTabs() {
  const buttons=[...document.querySelectorAll('[data-tab]')],panels=[...document.querySelectorAll('[data-panel]')];if(!buttons.length)return;
  function select(value,{focus=false,history=true}={}) {
    if(!buttons.some(button=>button.dataset.tab===value))value=buttons[0].dataset.tab;
    for(const button of buttons){const chosen=button.dataset.tab===value;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(chosen));button.tabIndex=chosen?0:-1;button.id||='tab-'+button.dataset.tab;if(chosen&&focus)button.focus({preventScroll:true});}
    for(const panel of panels){panel.hidden=panel.dataset.panel!==value;panel.setAttribute('role','tabpanel');panel.id||='panel-'+panel.dataset.panel;panel.setAttribute('aria-labelledby','tab-'+panel.dataset.panel);const button=buttons.find(item=>item.dataset.tab===panel.dataset.panel);button?.setAttribute('aria-controls',panel.id);}
    if(history)window.history.replaceState(null,'',location.pathname+location.search+'#'+value);
  }
  for(const button of buttons){button.addEventListener('click',()=>select(button.dataset.tab));button.addEventListener('keydown',event=>{
    let next=buttons.indexOf(button),delta=0;
    if(event.key==='ArrowRight')delta=preferences.language==='ar'?-1:1;
    else if(event.key==='ArrowLeft')delta=preferences.language==='ar'?1:-1;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=buttons.length-1;
    else return;
    event.preventDefault();next=(next+delta+buttons.length)%buttons.length;select(buttons[next].dataset.tab,{focus:true});
  });}
  for(const shortcut of document.querySelectorAll('[data-tab-shortcut]'))shortcut.addEventListener('click',()=>select(shortcut.dataset.tabShortcut,{focus:true}));
  window.addEventListener('hashchange',()=>select(location.hash.slice(1),{history:false}));
  select(location.hash.slice(1),{history:false});
}
function renderReleaseStatus() {
  for(const key of RELEASE_KEYS) {
    const row=releaseResult?.[key];
    const message=releaseFailure?words('تعذر التحقق الآن. جرّب رابط التحميل أو أعد المحاولة.','Could not check now. Try the download link or check again.'):
      !releaseResult?words('جارٍ التحقق من أحدث إصدار…','Checking the latest release…'):
      row?.available?(row.version?words('الإصدار '+row.version+' جاهز للتحميل','Version '+row.version+' is ready to download'):words('النسخة متاحة للتحميل','Available to download')):words('التحميل غير متاح مؤقتًا. أعد المحاولة لاحقًا.','Temporarily unavailable. Try again later.');
    for(const element of document.querySelectorAll('[data-release-status="'+key+'"]')){element.textContent=message;element.dataset.state=releaseFailure?'error':!releaseResult?'loading':row?.available?'ready':'unavailable';}
    for(const element of document.querySelectorAll('[data-release-version="'+key+'"]'))element.textContent=row?.available&&row.version?words('الإصدار ','Version ')+row.version:'—';
  }
  const checked=byID('release-checked');if(checked)checked.textContent=releaseCheckedAt?words('آخر تحقق: ','Last checked: ')+new Date(releaseCheckedAt).toLocaleTimeString(preferences.language==='ar'?'ar-SA':'en-GB',{hour:'2-digit',minute:'2-digit'}):words('تُفحص روابط التحميل تلقائيًا أثناء فتح الصفحة.','Download links are checked automatically while this page is open.');
}
function rememberScroll() {
  try{sessionStorage.setItem(SCROLL_KEY,JSON.stringify({y:scrollY,path:location.pathname+location.search+location.hash,at:Date.now()}));}catch{}
}
function restoreScroll() {
  try{const raw=sessionStorage.getItem(SCROLL_KEY);sessionStorage.removeItem(SCROLL_KEY);if(!raw)return;const value=JSON.parse(raw);if(!Number.isFinite(value.y)||value.y<0||Date.now()-value.at>300000||value.path!==location.pathname+location.search+location.hash)return;requestAnimationFrame(()=>requestAnimationFrame(()=>scrollTo({top:value.y,behavior:'auto'})));}catch{}
}
function applySiteReload() {
  if(!pendingRevision||reloading)return;
  reloading=true;stopped=true;cancelPoll();rememberScroll();location.reload();
}
function safeToReload() {
  return !document.hidden&&Date.now()-lastInteraction>=15000&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches?.('input,select,textarea,[contenteditable="true"]')&&![...document.querySelectorAll('video')].some(video=>!video.paused&&!video.ended);
}
function tryAutomaticReload() {
  clearTimeout(reloadTimer);if(!pendingRevision||document.hidden)return;
  if(safeToReload()){applySiteReload();return;}
  reloadTimer=setTimeout(tryAutomaticReload,Math.max(1000,15000-(Date.now()-lastInteraction)));
}
function showSiteUpdate(revision) {
  if(reloading||pendingRevision===revision)return;
  pendingRevision=revision;const banner=byID('site-update-banner');if(banner)banner.hidden=false;observeSiteUpdate(revision);tryAutomaticReload();
}
async function fetchJSON(address,signal) {
  const response=await fetch(address,{cache:'no-store',credentials:'same-origin',signal});if(!response.ok)throw Error('Request unavailable');
  const declared=Number(response.headers.get('content-length'));if(declared>131072)throw Error('Response too large');
  const raw=await response.text();if(raw.length>131072)throw Error('Response too large');return JSON.parse(raw);
}
async function poll() {
  if(stopped||document.hidden||navigator.onLine===false||inFlight)return;
  const token=generation;const controller=new AbortController();pollController=controller;const timer=setTimeout(()=>controller.abort(),10000);
  inFlight=Promise.allSettled([fetchJSON('/api/releases',controller.signal),fetchJSON('/site-version.json',controller.signal)]);
  try {
    const [release,revision]=await inFlight;if(token!==generation||stopped)return;
    if(release.status==='fulfilled'){
      try{releaseResult=validateReleaseFeed(release.value);releaseFailure=false;releaseCheckedAt=Date.now();observeReleaseUpdates(releaseResult);}catch{releaseFailure=true;}
    }else if(!controller.signal.aborted||!document.hidden)releaseFailure=true;
    renderReleaseStatus();
    if(revision.status==='fulfilled'&&typeof revision.value?.revision==='string'&&/^web-[a-f\d]{8,64}$/i.test(revision.value.revision)){
      const next=revision.value.revision;if(!currentRevision)currentRevision=next;else if(next!==currentRevision)showSiteUpdate(next);
    }
  } finally {clearTimeout(timer);if(pollController===controller)pollController=null;inFlight=null;if(token!==generation&&!stopped&&!document.hidden&&navigator.onLine!==false)queueMicrotask(()=>void poll());}
}
function cancelPoll() {generation++;pollController?.abort();pollController=null;clearInterval(pollTimer);pollTimer=0;clearTimeout(reloadTimer);}
function resumePolling() {
  if(stopped||document.hidden||navigator.onLine===false)return;
  if(!pollTimer)pollTimer=setInterval(()=>void poll(),60000);void poll();tryAutomaticReload();
}
function bindPolling() {
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelPoll();else resumePolling();});
  window.addEventListener('online',resumePolling);window.addEventListener('offline',cancelPoll);
  window.addEventListener('pagehide',()=>{stopped=true;cancelPoll();announcementMonitor?.stop();});window.addEventListener('pageshow',event=>{if(event.persisted){stopped=false;resumePolling();if(announcementMonitor)void announcementMonitor.start();}});
  for(const button of document.querySelectorAll('[data-refresh-releases]'))button.addEventListener('click',()=>void poll());
  for(const button of document.querySelectorAll('[data-reload-site]'))button.addEventListener('click',applySiteReload);
  for(const eventName of ['pointerdown','keydown','input'])document.addEventListener(eventName,()=>{lastInteraction=Date.now();},{passive:true});
  resumePolling();
}
function boot() {
  preferences=readPreferences();applyPreferences();
  const background=startBackground();
  bindPreferences();bindSharedAccent();bindMenu();bindCopies();bindTabs();bindPolling();restoreScroll();
  void setupWebsiteNotifications();
  let lastGlitch=0;
  document.addEventListener('click',event=>{const target=event.target.closest?.('a,button');if(!target||Date.now()-lastGlitch<2000)return;lastGlitch=Date.now();triggerGlitch(target.closest('section')||document.body);});
  requestAnimationFrame(()=>background.trigger(document.querySelector('main')||document.body));
  document.documentElement.dataset.siteReady='true';
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
}
