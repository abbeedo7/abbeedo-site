import {BRAND} from './core.js?release=1.2';
import {RELEASE_ORIGIN, WINDOWS_SETUP, WINDOWS_PORTABLE, ANDROID_APK} from './distribution.js?site=2.1';

export function compareVersions(left, right) {
  const parse = value => typeof value === 'string' && /^\d{1,5}(?:\.\d{1,5}){1,3}$/.test(value) ? value.split('.').map(Number) : null;
  const a=parse(left), b=parse(right); if(!a||!b)return null;
  for(let n=0;n<Math.max(a.length,b.length);n++){const delta=(a[n]||0)-(b[n]||0);if(delta)return delta>0?1:-1;}return 0;
}
export async function checkForUpdates({fetcher=globalThis.fetch,registration,platform=globalThis.ABUNASSER_CONFIG?.tvPackaged?globalThis.ABUNASSER_CONFIG.tvPlatform:globalThis.abunasserDesktop?.isDesktop?'windows':'web',currentVersion=BRAND.version,nativeVersion=globalThis.abunasserDesktop?.version,origin=globalThis.ABUNASSER_CONFIG?.apiOrigin||globalThis.location?.origin}={}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000),base=origin||RELEASE_ORIGIN;
  try {
    const response=await fetcher(new URL('/version.json',base),{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw Object.assign(new Error('Could not check updates'),{code:'UPDATE_NETWORK',httpStatus:response.status});
    const feed=await response.json();if(compareVersions(feed.version,currentVersion)===null)throw Object.assign(new Error('Invalid release information'),{code:'UPDATE_FEED'});
    const tvPackaged=globalThis.ABUNASSER_CONFIG?.tvPackaged===true;
    let webAvailable=!tvPackaged&&compareVersions(feed.version,currentVersion)>0;
    if(!tvPackaged&&!registration&&platform==='web'&&globalThis.navigator?.serviceWorker)registration=await navigator.serviceWorker.getRegistration();
    if(!tvPackaged&&registration){await registration.update();webAvailable=webAvailable||!!registration.waiting;}
    let latest=feed.version,releaseUnavailable=false;
    if(['windows','android'].includes(platform)){
      try{const release=await fetcher(new URL('/api/releases',base),{cache:'no-store',signal:controller.signal});if(!release.ok)throw Error('No published release');const data=await release.json(),row=platform==='windows'?data.windows?.setup:data.android;if(row?.available!==true||compareVersions(row.version,'0.0.0')===null)throw Error('No published release');latest=row.version;}catch{latest=null;releaseUnavailable=true;}
    }
    const installed=tvPackaged?(globalThis.ABUNASSER_CONFIG.tvVersion||currentVersion):platform==='windows'?(nativeVersion||currentVersion):currentVersion;
    return {platform,currentVersion,installedVersion:installed,latestVersion:latest,available:latest!==null&&compareVersions(latest,installed)>0,webAvailable,registration,releaseUnavailable,tvPackaged,
      downloadURL:platform==='windows'?WINDOWS_SETUP:platform==='android'?ANDROID_APK:null,portableURL:platform==='windows'?WINDOWS_PORTABLE:null};
  }finally{clearTimeout(timer);}
}
export async function applyWebUpdate(registration,{reload=()=>globalThis.location.reload(),serviceWorker=globalThis.navigator?.serviceWorker}={}) {
  if(!registration?.waiting){reload();return;}
  await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);serviceWorker?.removeEventListener?.('controllerchange',finish);resolve();};const timer=setTimeout(finish,5000);serviceWorker?.addEventListener?.('controllerchange',finish,{once:true});registration.waiting.postMessage({type:'SKIP_WAITING'});});
  reload();
}
// Check without interrupting playback or replacing the page. Installation is an explicit action.
export function createUpdateMonitor({onUpdate=()=>{},check=checkForUpdates,intervalMs=60000,document=globalThis.document,online=()=>globalThis.navigator?.onLine!==false}={}) {
  let active=false,timer=null,busy=false,lastVersion='',lastCheck=0,generation=0;
  async function poll(){if(!active||busy||document?.hidden||!online())return;busy=true;const token=generation;try{const result=await check();if(!active||token!==generation)return;lastCheck=Date.now();if((result.available||result.webAvailable)&&lastVersion!==result.latestVersion){lastVersion=result.latestVersion;await onUpdate(result);}}catch{}finally{busy=false;}}
  const visible=()=>{if(!document?.hidden&&Date.now()-lastCheck>=60000)void poll();};
  return {poll,start(){if(active)return;active=true;generation++;document?.addEventListener?.('visibilitychange',visible);timer=setInterval(()=>void poll(),Math.max(60000,intervalMs));void poll();},stop(){active=false;generation++;clearInterval(timer);document?.removeEventListener?.('visibilitychange',visible);}};
}
