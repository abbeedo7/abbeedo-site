import {startBackground, triggerGlitch} from './background.js';

const PREFERENCES_KEY = 'abbeedo:website:preferences:v2';
const SCROLL_KEY = 'abbeedo:site:reload-scroll:v1';
const DEFAULTS = Object.freeze({language:'ar',accent:'#ff242d',contrast:false,motion:'standard',reduced:false,textScale:1,theme:'dark'});
const RELEASE_KEYS = ['android','windows','portable'];
const VERSION = /^\d{1,5}(?:\.\d{1,5}){1,3}$/;
let preferences = {...DEFAULTS}, memoryPreferences = null;

export function cleanPreferences(input={}) {
  const value = input && typeof input==='object' && !Array.isArray(input) ? input : {};
  return {language:['ar','en'].includes(value.language)?value.language:DEFAULTS.language,
    accent:/^#[a-f\d]{6}$/i.test(value.accent||'')?value.accent.toLowerCase():DEFAULTS.accent,
    contrast:value.contrast===true,motion:['standard','fast','off'].includes(value.motion)?value.motion:DEFAULTS.motion,
    reduced:value.reduced===true,textScale:Number.isFinite(Number(value.textScale))&&Number(value.textScale)>=1&&Number(value.textScale)<=1.3?Number(value.textScale):1,
    theme:['dark','light','sport','cinema'].includes(value.theme)?value.theme:DEFAULTS.theme};
}

function readPreferences() {
  if(memoryPreferences)return {...memoryPreferences};
  try {
    const stored=localStorage.getItem(PREFERENCES_KEY);
    if(stored)return cleanPreferences(JSON.parse(stored));
    const old=JSON.parse(localStorage.getItem('f7rv.site.preferences.v1')||'null');
    if(old&&typeof old==='object')return cleanPreferences({language:old.language,accent:old.accent,contrast:old.contrast,reduced:old.reducedMotion,motion:old.speed==='still'?'off':old.speed==='fast'?'fast':'standard'});
  } catch {}
  return {...DEFAULTS};
}
function savePreferences() {
  memoryPreferences={...preferences};
  try {localStorage.setItem(PREFERENCES_KEY,JSON.stringify(preferences));return true;} catch {return false;}
}
const words=(ar,en)=>preferences.language==='en'?en:ar;
const brand=()=>words('ابوناصر TV','abbeedo TV');
const byID=id=>document.getElementById(id);
let toastTimer=0,storageExplained=false,lastInteraction=Date.now(),releaseResult=null,releaseFailure=false,releaseCheckedAt=null;
let currentRevision='',pendingRevision='',reloadTimer=0,pollTimer=0,inFlight=null,pollController=null,generation=0,stopped=false,reloading=false;

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
  for(const element of document.querySelectorAll('[data-ar][data-en]'))element.textContent=element.dataset[preferences.language];
  for(const element of document.querySelectorAll('[data-brand-name]'))element.textContent=brand();
  for(const element of document.querySelectorAll('[data-ar-label][data-en-label]'))element.setAttribute('aria-label',element.dataset[preferences.language==='ar'?'arLabel':'enLabel']);
  for(const element of document.querySelectorAll('[data-ar-alt][data-en-alt]'))element.alt=element.dataset[preferences.language==='ar'?'arAlt':'enAlt'];
  const applications=location.pathname.replace(/\/+$/,'')==='/apps';
  document.title=applications?words('التطبيقات والتحميل | ابوناصر TV','Apps and downloads | abbeedo TV'):brand();
  document.querySelector('meta[name="description"]')?.setAttribute('content',words('ابوناصر TV — البث المباشر والأفلام والمسلسلات من اشتراكك. حمّل التطبيق المناسب لجهازك أو افتحه من الويب.','abbeedo TV — your subscription live channels, movies and series. Download the app for your device or open the web app.'));
  renderReleaseStatus();
}
function syncPreferenceControls() {
  const values={'language-select':preferences.language,'accent-input':preferences.accent,'motion-select':preferences.motion,'font-select':String(preferences.textScale),'theme-select':preferences.theme};
  for(const [id,value]of Object.entries(values)){const control=byID(id);if(control)control.value=value;}
  if(byID('contrast-toggle'))byID('contrast-toggle').checked=preferences.contrast;
  if(byID('reduced-toggle'))byID('reduced-toggle').checked=preferences.reduced;
}
function applyPreferences() {
  document.documentElement.style.setProperty('--accent',preferences.accent);
  document.documentElement.style.setProperty('--scale',String(preferences.textScale));
  document.body.dataset.background=preferences.motion;
  document.body.dataset.reducedMotion=String(preferences.reduced);
  document.body.dataset.highContrast=String(preferences.contrast);
  document.body.dataset.theme=preferences.theme;
  localize();syncPreferenceControls();
  document.documentElement.dataset.preferencesReady='true';
  window.dispatchEvent(new CustomEvent('abbeedo:website-preferences',{detail:{...preferences}}));
}
function updatePreference(patch) {
  preferences=cleanPreferences({...preferences,...patch});const saved=savePreferences();applyPreferences();
  const notice=byID('settings-storage-status');if(notice)notice.textContent=saved?words('تُحفظ اختياراتك تلقائيًا على هذا الجهاز.','Preferences are saved automatically on this device.'):words('تعمل اختياراتك خلال هذه الزيارة. التخزين غير متاح في هذا المتصفح.','Preferences work for this visit. Storage is unavailable in this browser.');
  if(!saved&&!storageExplained){storageExplained=true;toast(words('تعمل الإعدادات لهذه الزيارة؛ لم يسمح المتصفح بحفظها.','Preferences work for this visit; this browser did not allow saving.'));}
}
function bindPreferences() {
  const dialog=byID('settings-dialog');let opener=null;
  for(const button of document.querySelectorAll('[data-settings-open]'))button.addEventListener('click',()=>{if(!dialog)return;opener=button;syncPreferenceControls();if(!dialog.open)dialog.showModal();});
  byID('settings-close')?.addEventListener('click',()=>dialog?.close());
  dialog?.addEventListener('close',()=>{opener?.focus({preventScroll:true});tryAutomaticReload();});
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
  pendingRevision=revision;const banner=byID('site-update-banner');if(banner)banner.hidden=false;tryAutomaticReload();
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
      try{releaseResult=validateReleaseFeed(release.value);releaseFailure=false;releaseCheckedAt=Date.now();}catch{releaseFailure=true;}
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
  window.addEventListener('pagehide',()=>{stopped=true;cancelPoll();});window.addEventListener('pageshow',event=>{if(event.persisted){stopped=false;resumePolling();}});
  for(const button of document.querySelectorAll('[data-refresh-releases]'))button.addEventListener('click',()=>void poll());
  for(const button of document.querySelectorAll('[data-reload-site]'))button.addEventListener('click',applySiteReload);
  for(const eventName of ['pointerdown','keydown','input'])document.addEventListener(eventName,()=>{lastInteraction=Date.now();},{passive:true});
  resumePolling();
}
function boot() {
  preferences=readPreferences();applyPreferences();
  const background=startBackground();
  bindPreferences();bindMenu();bindCopies();bindTabs();bindPolling();restoreScroll();
  let lastGlitch=0;
  document.addEventListener('click',event=>{const target=event.target.closest?.('a,button');if(!target||Date.now()-lastGlitch<2000)return;lastGlitch=Date.now();triggerGlitch(target.closest('section')||document.body);});
  requestAnimationFrame(()=>background.trigger(document.querySelector('main')||document.body));
  document.documentElement.dataset.siteReady='true';
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
}
