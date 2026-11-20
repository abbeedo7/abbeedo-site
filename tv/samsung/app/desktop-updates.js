const EVENT='abbeedo:desktop-update';
let connected=false,disposePanel=null;
export function bindDesktopUpdates(open){
 const bridge=globalThis.abunasserDesktop;
 if(connected||!bridge?.nativeUpdater||typeof bridge.onUpdateStatus!=='function')return;
 connected=true;
 bridge.onUpdateStatus(state=>{
  if(!state||typeof state.status!=='string')return;
  globalThis.dispatchEvent(new CustomEvent(EVENT,{detail:state}));
  if(state.open===true)Promise.resolve(open()).catch(()=>{});
 });
}
export function openDesktopUpdates({sheet,node,btn,actions,x,toast}){
 const bridge=globalThis.abunasserDesktop;
 if(!bridge?.nativeUpdater)return false;
 disposePanel?.();
 const box=node('div','desktop-updater');
 let latest=null,busy=false;
 const bytes=value=>{const n=Math.max(0,Number(value)||0);return(n/1048576).toFixed(1)+' MB';};
 const invoke=async method=>{
  if(busy)return;busy=true;
  try{const value=await bridge[method]();if(value)draw(value);}
  catch{box.replaceChildren(node('p','inline-error',x('تعذر إكمال التحديث. أعد المحاولة.','The update could not finish. Try again.')));}
  finally{busy=false;}
 };
 function draw(state){
  if(!state||!box.isConnected)return;
  latest=state;box.replaceChildren();
  box.append(node('p','',x('الإصدار المثبت: ','Installed version: ')+(state.installedVersion||bridge.version)));
  if(state.version)box.append(node('p','',x('الإصدار المتاح: ','Available version: ')+state.version));
  const messages={
   idle:x('يمكنك فحص التحديث الآن.','You can check for updates now.'),
   checking:x('جارٍ التحقق من التحديث…','Checking for updates…'),
   available:x('التحديث جاهز للتنزيل داخل التطبيق.','The update can be downloaded inside the app.'),
   current:x('تستخدم أحدث إصدار منشور.','You are using the latest published release.'),
   unavailable:x('لا يوجد إصدار منشور متاح الآن. أعد المحاولة لاحقًا.','No published release is available right now. Try again later.'),
   downloading:x('جارٍ تنزيل التحديث والتحقق من سلامته…','Downloading and verifying the update…'),
   cancelled:x('أُلغي التنزيل. يمكنك بدء التنزيل مجددًا.','Download cancelled. You can start it again.'),
   ready:x('اكتمل التنزيل والتحقق. اضغط التثبيت لإكمال التحديث.','Download verified. Choose Install to finish updating.'),
   installing:x('جارٍ تشغيل المثبت. أكمل الخطوات لإعادة فتح التطبيق.','Opening setup. Complete it to reopen the app.'),
   error:x('تعذر إكمال التحديث بأمان. أعد المحاولة.','The update could not be completed safely. Try again.')
  };
  box.append(node('p',state.status==='error'?'inline-error':'',messages[state.status]||messages.idle));
  if(state.status==='downloading'){
   const progress=node('progress');progress.max=1;progress.value=Math.min(1,Math.max(0,Number(state.progress)||0));progress.setAttribute('aria-label',x('تقدم تنزيل التحديث','Update download progress'));
   box.append(progress,node('p','muted',bytes(state.received)+' / '+bytes(state.total)),btn(x('إلغاء التنزيل','Cancel download'),()=>invoke('cancelUpdate'),'close'));
  }else if(state.status==='ready'){
   box.append(btn(x('تثبيت التحديث الآن','Install update now'),()=>invoke('installUpdate'),'update','primary'));
  }else if(['available','cancelled'].includes(state.status)){
   box.append(btn(x('تنزيل التحديث','Download update'),()=>invoke('downloadUpdate'),'download','primary'));
  }else if(!['checking','installing'].includes(state.status)){
   box.append(btn(x('فحص التحديث','Check for update'),()=>invoke('checkForUpdates'),'refresh'));
  }
 }
 const update=event=>draw(event.detail);
 globalThis.addEventListener(EVENT,update);
 disposePanel=()=>globalThis.removeEventListener(EVENT,update);
 sheet(x('تحديث التطبيق','App update'),box);
 void bridge.getUpdateStatus().then(state=>{
  draw(state);
  if(!['downloading','ready','installing','checking'].includes(state?.status))void invoke('checkForUpdates');
 }).catch(()=>void invoke('checkForUpdates'));
 return true;
}
