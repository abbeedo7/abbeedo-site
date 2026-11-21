import {configureTVPresentation} from './tv-presentation.js';
import {startVisualEffects} from './glitch.js?site=2.1';
import {isAppContext, installationPlatform} from './install-gate.js?site=2.1';
import {SHARED_ACCENT_KEY,getSharedAccent,appearanceHandoffURL} from './shared-accent.js';
import {RELEASE_INDEX} from './distribution.js?site=2.0';
import {applyClientPreferences,readPreferences,migrateVaultPreferences,chooseInitialLanguage,openPublicPreferences,text} from './preferences.js';

// Apply a saved locale before any labels become visible, including the download page.
applyClientPreferences();
configureTVPresentation();
const visualEffects = startVisualEffects();
const gate = document.getElementById('install-gate');
const shell = document.getElementById('app-shell');
const status = document.getElementById('install-status');
const installButton = document.getElementById('install-button');
const platform = installationPlatform();
const nativeDownload = ['android','android-tv','windows'].includes(platform);
let pendingInstall=null,starting=false,loadFailed=false,statusWords=null,downloadWords=['جارٍ التحقق من توفر نسخة ويندوز…','Checking Windows download availability…'];
const setStatus=(ar,en)=>{statusWords=[ar,en];status.hidden=false;status.textContent=text(ar,en);};
function renderGate(){
  const set=(id,ar,en)=>document.getElementById(id).textContent=text(ar,en);
  set('install-heading',...(loadFailed?['تعذر فتح التطبيق','Could not open the app']:platform==='windows'?['تطبيق ابوناصر TV لويندوز','abbeedo TV for Windows']:platform==='android-tv'?['تطبيق ابوناصر TV لشاشتك','abbeedo TV for your television']:platform==='android'?['تطبيق ابوناصر TV لأندرويد','abbeedo TV for Android']:['أضف التطبيق لبدء المشاهدة','Add the app to start watching']));
  set('install-intro',...(loadFailed?['تحقق من اتصال الإنترنت، ثم أغلق التطبيق وافتحه مرة أخرى.','Check your internet connection, then close and reopen the app.']:platform==='windows'?['أفلامك ومسلسلاتك والبث المباشر من اشتراكك، في تطبيق على الكمبيوتر.','Your subscription movies, series and live channels in a desktop app.']:nativeDownload?['حمّل التطبيق المخصص لأجهزة أندرويد واستمتع بمحتوى اشتراكك.','Download the Android app to enjoy your subscription content.']:['يعمل ابوناصر TV من أيقونته على الشاشة الرئيسية. أضفه أولًا، ثم افتحه من الأيقونة الجديدة.','abbeedo TV opens from its Home Screen icon. Add it first, then open the new icon.']));
  set('install-note',...(platform==='windows'?['استخدم نسخة التثبيت، أو النسخة المحمولة لتشغيل التطبيق دون تثبيت.','Use the installer, or run the single portable EXE without installation.']:platform==='android-tv'?['يدعم Android TV وGoogle TV والتنقل بالريموت. استخدم رابط التحميل نفسه في تطبيق Downloader.','Supports Android TV, Google TV and remote navigation. Use the same link in Downloader.']:platform==='android'?['الملف نفسه يدعم الجوال وأجهزة Android TV وGoogle TV.','The same APK supports phones, Android TV and Google TV.']:['بعد الإضافة، افتح التطبيق من أيقونته لتظهر خيارات الدخول والمشاهدة.','After adding it, open its Home Screen icon to sign in and start watching.']));
  const steps={
    'ios-safari':[['اضغط زر المشاركة في Safari.','Tap Share in Safari.'],['اختر «إضافة إلى الشاشة الرئيسية» ثم اضغط «إضافة».','Choose Add to Home Screen, then tap Add.'],['افتح «ابوناصر TV» من الشاشة الرئيسية.','Open abbeedo TV from your Home Screen.']],
    'ios-other':[['انسخ رابط الموقع وافتحه في Safari.','Copy the website link and open it in Safari.'],['اضغط «مشاركة»، ثم «إضافة إلى الشاشة الرئيسية» و«إضافة».','Tap Share, then Add to Home Screen and Add.'],['افتح «ابوناصر TV» من أيقونته الجديدة.','Open abbeedo TV from its new icon.']],
    other:[['من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».','Choose Install app or Add to Home Screen in the browser menu.'],['أكد الإضافة، ثم افتح «ابوناصر TV» من الأيقونة الجديدة.','Confirm, then open abbeedo TV from the new icon.']],
    'android android-tv':[['حمّل ملف التطبيق بصيغة APK.','Download the APK file.'],['افتح الملف واتبع خطوات التثبيت التي يعرضها جهازك.','Open the file and follow your device installation steps.'],['افتح «ابوناصر TV» وأدخل بيانات اشتراكك.','Open abbeedo TV and enter your subscription.']],
    windows:[['حمّل نسخة Windows 10 أو Windows 11 ‏(64 بت).','Download for Windows 10 or Windows 11 (64-bit).'],['شغّل ملف التثبيت أو النسخة المحمولة EXE.','Run the installer or the portable EXE.'],['أدخل اشتراكك وابدأ المشاهدة.','Enter your subscription and start watching.']]
  };
  for(const list of document.querySelectorAll('ol[data-install-platforms]'))list.querySelectorAll('li > span').forEach((span,index)=>{const words=steps[list.dataset.installPlatforms]?.[index];if(words){const svg=span.querySelector('svg');span.textContent=text(...words);if(svg)span.append(' ',svg);}});
  for(const [id,ar,en,arDetail,enDetail]of [['android-download','تحميل تطبيق أندرويد','Download Android app','للجوال وAndroid TV وGoogle TV','Phone, Android TV and Google TV'],['windows-download','تحميل تطبيق ويندوز','Download Windows app','Windows 10 و11 · 64 بت','Windows 10 and 11 · 64-bit']]){const label=document.getElementById(id).lastElementChild,detail=label.querySelector('.download-detail');label.firstChild.textContent=text(ar,en);detail.textContent=text(arDetail,enDetail);}
  document.getElementById('download-status').textContent=text(...downloadWords);
  if(statusWords)status.textContent=text(...statusWords);
}
gate.dataset.platform=platform;
for(const element of document.querySelectorAll('[data-install-platforms]'))element.hidden=!element.dataset.installPlatforms.split(' ').includes(platform);
renderGate();
document.getElementById('website-settings-button').onclick=()=>openPublicPreferences();
window.addEventListener('abbeedo:preferences',()=>{const p=applyClientPreferences(),color=document.getElementById('preference-accent');if(color)color.value=p.accent;renderGate();});
function refreshSharedAccent(){const accent=getSharedAccent();if(accent&&accent!==document.documentElement.style.getPropertyValue('--accent').trim())window.dispatchEvent(new CustomEvent('abbeedo:preferences',{detail:readPreferences()}));}
window.addEventListener('storage',event=>{if(event.key===SHARED_ACCENT_KEY||event.key===null)refreshSharedAccent();});
window.addEventListener('pageshow',refreshSharedAccent);window.addEventListener('focus',refreshSharedAccent);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSharedAccent();});

// Migrate only public settings from an existing encrypted installation. Never expose account data.
if(!readPreferences().chosenLanguage&&isAppContext()){
  gate.hidden=true;
  try{const {Vault}=await import('./core.js?release=1.2.4');const vault=new Vault({namespace:'interface-v1'});const saved=await vault.get('ui',null);migrateVaultPreferences(saved?.settings);}catch{}
  applyClientPreferences();
}
if(!readPreferences().chosenLanguage)await chooseInitialLanguage();
renderGate();
function openIfInstalled(){
  if(!isAppContext())return false;
  if(starting)return true;
  starting=true;gate.hidden=true;shell.hidden=false;shell.inert=true;
  document.documentElement.dataset.launchContext='app';
  import('./ui.js?release=1.2.4').then(async module=>{await module.appReady;shell.inert=false;}).catch(()=>{
    starting=false;loadFailed=true;gate.hidden=false;shell.hidden=true;shell.inert=true;
    document.getElementById('install-instructions').hidden=true;document.getElementById('install-note').hidden=true;renderGate();
  });
  return true;
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();if(nativeDownload)return;pendingInstall=event;if(!starting)installButton.hidden=false;});
window.addEventListener('appinstalled',()=>{if(nativeDownload)return;pendingInstall=null;installButton.hidden=true;setStatus('تمت الإضافة. افتح «ابوناصر TV» من أيقونته على الشاشة الرئيسية.','Added. Open abbeedo TV from its Home Screen icon.');});
installButton.addEventListener('click',async()=>{if(!pendingInstall)return;const prompt=pendingInstall;pendingInstall=null;installButton.disabled=true;try{await prompt.prompt();const choice=await prompt.userChoice;if(choice?.outcome==='accepted')setStatus('بعد اكتمال الإضافة، افتح التطبيق من أيقونته على الشاشة الرئيسية.','Once added, open the app from its Home Screen icon.');}catch{setStatus('افتح قائمة المتصفح واختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».','Open the browser menu and choose Add to Home Screen or Install app.');}finally{installButton.disabled=false;installButton.hidden=!pendingInstall;}});
document.getElementById('copy-install-link').addEventListener('click',async()=>{const address=appearanceHandoffURL(new URL('/app',location.href).href);let copied=false;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(address);copied=true;}}catch{}if(!copied){const input=document.createElement('textarea');input.value=address;input.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.append(input);input.select();try{copied=document.execCommand('copy');}catch{}input.remove();}setStatus(...(copied?['تم نسخ الرابط. افتحه في Safari ثم أضفه إلى الشاشة الرئيسية.','Link copied. Open it in Safari, then add it to your Home Screen.']:['تعذر نسخ الرابط. انسخه من شريط العنوان وافتحه في Safari.','Could not copy. Copy it from the address bar and open it in Safari.']));});
async function refreshWindowsDownloads(){const notice=document.getElementById('download-status'),retry=document.getElementById('retry-download-check');retry.hidden=true;downloadWords=['جارٍ التحقق من توفر نسخة ويندوز…','Checking Windows download availability…'];notice.textContent=text(...downloadWords);try{const response=await fetch(RELEASE_INDEX,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Unavailable');const release=await response.json();let available=false;for(const [key,id]of [['setup','windows-download'],['portable','windows-portable']]){const ready=release.windows?.[key]?.available===true;document.getElementById(id).setAttribute('aria-disabled',String(!ready));if(key==='setup')available=ready;}downloadWords=available?['نسخة ويندوز جاهزة للتحميل.','Windows download is ready.']:['التحميل غير متاح مؤقتًا. أعد المحاولة بعد قليل.','Downloads are temporarily unavailable. Please try again shortly.'];retry.hidden=available;}catch{downloadWords=['تعذر التحقق من رابط التحميل. تحقق من الاتصال ثم أعد المحاولة.','Could not check downloads. Check your connection and retry.'];retry.hidden=false;}notice.textContent=text(...downloadWords);}
for(const id of ['windows-download','windows-portable'])document.getElementById(id).addEventListener('click',event=>{if(event.currentTarget.getAttribute('aria-disabled')==='true')event.preventDefault();});
document.getElementById('retry-download-check').addEventListener('click',refreshWindowsDownloads);
if(!openIfInstalled()){
  gate.hidden=false;document.documentElement.dataset.launchContext='browser';
  if(platform==='windows')refreshWindowsDownloads();
  if(platform==='android-tv')requestAnimationFrame(()=>document.getElementById('android-download').focus({preventScroll:true}));
  const media=window.matchMedia?.('(display-mode: standalone)');if(media?.addEventListener)media.addEventListener('change',openIfInstalled);else media?.addListener?.(openIfInstalled);
  window.addEventListener('pageshow',openIfInstalled);document.addEventListener('visibilitychange',()=>{if(!document.hidden)openIfInstalled();});
  if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
document.documentElement.dataset.installGateReady='true';
visualEffects.trigger(gate.hidden?shell:gate);
