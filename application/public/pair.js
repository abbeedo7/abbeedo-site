'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const status = byId('status'), form = byId('subscription');
  const params = new URLSearchParams(location.hash.slice(1));
  const id = params.get('id') || '', token = params.get('token') || '', encodedKey = params.get('key') || '';
  history.replaceState(null, '', location.pathname);
  const requests = new Set();
  let aesKey, device, timer, sending = false, polling = false, active = true, exportedSnapshot = null, importedSnapshot = null;
  const fromBase64 = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), character => character.charCodeAt(0));
  const toBase64 = bytes => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  function message(text, error = false, element = status) {element.textContent=text; element.classList.toggle('error',error);}
  async function request(operation = '', method = 'GET', body) {
    const controller=new AbortController();requests.add(controller);const deadline=setTimeout(()=>controller.abort(),8000);
    try {
      const response = await fetch('/api/device-pairings/'+id+operation, {method,signal:controller.signal,redirect:'error',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
      if(Number(response.headers.get('content-length'))>131072)throw new Error('رد خدمة الربط أكبر من الحد المسموح.');
      const text=await response.text();if(new TextEncoder().encode(text).length>131072)throw new Error('رد خدمة الربط أكبر من الحد المسموح.');
      const data=JSON.parse(text);
      if (!response.ok) {const error = new Error(response.status===403?'رابط الربط غير صالح.':response.status===404?'انتهت جلسة الربط.':response.status===429?'طلبات كثيرة. انتظر قليلًا.':'تعذر الاتصال بخدمة الربط.');error.status = response.status;throw error;}
      return data;
    } finally {clearTimeout(deadline);requests.delete(controller);}
  }
  function showFields() {
    const type = byId('type').value;
    const visible = {server:type==='xtream'||type==='stalker',username:type==='provider'||type==='xtream',password:type==='provider'||type==='xtream',playlist:type==='m3u',mac:type==='stalker'};
    for (const [name,show] of Object.entries(visible)) {
      byId('field-'+name).hidden = !show;
      const input = byId(name==='mac'?'portal-mac':name);
      input.disabled = !show; input.required = show;
      if (!show) input.value='';
    }
    if(type==='stalker'&&!byId('portal-mac').value)byId('portal-mac').value=device?.mac||'';
    byId('method-hint').textContent = type==='provider'?'يُستخدم سيرفر اشتراك أبوناصر تلقائيًا. أدخل اسم المستخدم وكلمة المرور من مزودك.':type==='xtream'?'أدخل رابط السيرفر واسم المستخدم وكلمة المرور التي أعطاها لك المزود.':type==='m3u'?'ألصق رابط القائمة الكامل. لا تحتاج إدخال اسم مستخدم أو كلمة مرور في خانات منفصلة.':'استخدم رابط بوابة Stalker وعنوان MAC المسجل لدى مزودك. هذا المسار للقنوات المباشرة حسب دعم المزود.';
    byId('password').type='password';byId('show-password').textContent='إظهار';
  }
  function safeURL(value) {const url = new URL(value);if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new Error('أدخل رابط HTTP أو HTTPS صالحًا دون بيانات دخول في اسم النطاق.');return url.href;}
  async function decrypt(envelope) {
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(envelope.iv)},aesKey,fromBase64(envelope.ciphertext));
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
  }
  async function encrypt(value, maxBytes = 8192) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    if(bytes.length>maxBytes)throw new Error('البيانات أطول من الحد المسموح.');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},aesKey,bytes));
    return {iv:toBase64(iv),ciphertext:toBase64(cipher)};
  }
  function subscription() {
    const type=byId('type').value;
    let server=type==='provider'?'http://maglobalxx.xyz:2052':type==='m3u'?byId('playlist').value.trim():byId('server').value.trim();
    server=safeURL(server);
    const username=type==='provider'||type==='xtream'?byId('username').value.trim():'';
    const password=type==='provider'||type==='xtream'?byId('password').value:'';
    const mac=type==='stalker'?byId('portal-mac').value.trim().toUpperCase():'';
    if((type==='provider'||type==='xtream')&&(!username||!password))throw new Error('أدخل اسم المستخدم وكلمة المرور.');
    if(type==='stalker'&&!/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac))throw new Error('تحقق من عنوان MAC المكوّن من ست خانات مزدوجة.');
    return {type,server,username,password,mac,name:byId('name').value.trim()};
  }
  async function poll() {
    if(!active||document.hidden||polling)return;polling=true;
    try {
      const info=await request();device=info;
      const remaining=Math.max(0,Math.ceil((info.expiresAt-Date.now())/60000));
      byId('expires').textContent='تنتهي جلسة الربط خلال '+remaining+' دقيقة.';
      if(info.status==='submitted'){form.hidden=true;message('أُرسلت البيانات مشفّرة. افتح شاشة QR في الجهاز ليتم استلامها.');}
      if(info.status==='received'){
        form.hidden=true;message('استلم الجهاز بيانات الاشتراك. سيختبر التطبيق الاتصال بالمزود.');
        // The Android client advertises remote support explicitly; no dead controls are shown otherwise.
        byId('remote').hidden=true;
        if(info.state){try{const state=await decrypt(info.state);const actions=Array.isArray(state.remoteActions)?state.remoteActions.filter(action=>typeof action==='string'):[];byId('remote').hidden=!info.remoteAvailable||!actions.length;document.querySelectorAll('[data-command]').forEach(button=>button.disabled=!actions.includes(button.dataset.command));byId('keyboard').hidden=!actions.includes('search');document.querySelector('.transfer').hidden=!actions.some(action=>['export_settings','import_settings','resume_playback'].includes(action));byId('export-settings').disabled=!actions.includes('export_settings');const title=typeof state.currentTitle==='string'?state.currentTitle:'';const position=Number(state.positionMs)||0;byId('playback-state').textContent=title?(title+' • '+(state.isPlaying?'قيد التشغيل':'متوقف')+(position>0?' • '+Math.floor(position/60000)+':'+String(Math.floor(position/1000)%60).padStart(2,'0'):'')):'';if(validSnapshot(state.settingsSnapshot)){exportedSnapshot=state.settingsSnapshot;byId('download-settings').disabled=false;}}catch{byId('playback-state').textContent='';}}
      }
    }catch(error){message(error.message,true);if(error.status===403||error.status===404){active=false;form.hidden=true;byId('remote').hidden=true;}}
    polling=false;if(active&&!document.hidden)timer=setTimeout(poll,2500);
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending)return;sending=true;byId('submit').disabled=true;
    try {await request('','POST',await encrypt(subscription()));form.reset();form.hidden=true;message('أُرسلت بيانات الاشتراك مشفّرة. انتظر استلامها في الجهاز.');}
    catch(error){message(error.message,true);byId('submit').disabled=false;}
    finally{sending=false;}
  });
  byId('type').addEventListener('change',showFields);
  byId('show-password').addEventListener('click',()=>{const input=byId('password');const show=input.type==='password';input.type=show?'text':'password';byId('show-password').textContent=show?'إخفاء':'إظهار';});
  let commandBusy=false;
  async function command(action,value='') {
    if(commandBusy||!active)return;commandBusy=true;
    try {await request('/commands','POST',await encrypt({action,value,createdAt:Date.now()},65536));message('أُرسل الأمر إلى الجهاز.',false,byId('remote-status'));return true;}
    catch(error){message(error.message,true,byId('remote-status'));return false;}
    finally{commandBusy=false;}
  }
  document.querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',()=>command(button.dataset.command,button.dataset.value||'')));
  byId('keyboard').addEventListener('submit',event=>{event.preventDefault();const value=byId('remote-text').value.trim();if(value)command('search',value);});
  function validSnapshot(value) {return value && typeof value==='object' && !Array.isArray(value) && value.format==='ABBEEDO-SETTINGS-1' && value.preferences && typeof value.preferences==='object' && !Array.isArray(value.preferences);}
  byId('export-settings').addEventListener('click',async()=>{byId('download-settings').disabled=true;exportedSnapshot=null;if(await command('export_settings'))message('طلبنا نسخة الإعدادات من الجهاز. انتظر ظهور زر التحميل.',false,byId('remote-status'));});
  byId('download-settings').addEventListener('click',()=>{if(!validSnapshot(exportedSnapshot))return;const blob=new Blob([JSON.stringify(exportedSnapshot,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='ABBEEDO-settings-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);});
  byId('settings-file').addEventListener('change',async()=>{importedSnapshot=null;byId('import-settings').disabled=true;byId('resume-playback').disabled=true;byId('file-summary').textContent='';const file=byId('settings-file').files?.[0];if(!file)return;try{if(file.size>65536)throw new Error('حجم النسخة أكبر من 64 كيلوبايت.');const value=JSON.parse(await file.text());if(!validSnapshot(value))throw new Error('اختر نسخة إعدادات ABBEEDO صالحة.');importedSnapshot=value;byId('import-settings').disabled=false;byId('resume-playback').disabled=!(value.playback&&typeof value.playback==='object'&&typeof value.playback.itemId==='string');byId('file-summary').textContent='النسخة جاهزة للإرسال. ستظهر موافقة الاستعادة على الجهاز.';}catch(error){message(error.message,true,byId('remote-status'));}});
  byId('import-settings').addEventListener('click',async()=>{if(validSnapshot(importedSnapshot)&&await command('import_settings',importedSnapshot))message('أُرسلت النسخة مشفّرة. وافق على الاستعادة على شاشة الجهاز.',false,byId('remote-status'));});
  byId('resume-playback').addEventListener('click',async()=>{if(importedSnapshot?.playback&&await command('resume_playback',importedSnapshot.playback))message('أُرسل طلب المتابعة. يجب توفر المحتوى نفسه في اشتراك الجهاز.',false,byId('remote-status'));});
  document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(document.hidden){for(const controller of requests)controller.abort();}else if(active)void poll();});
  addEventListener('pagehide',()=>{active=false;clearTimeout(timer);for(const controller of requests)controller.abort();exportedSnapshot=null;importedSnapshot=null;});
  (async()=>{
    try {
      if(!/^[A-Za-z0-9_-]{22}$/.test(id)||!/^[A-Za-z0-9_-]{43}$/.test(token)||!/^[A-Za-z0-9_-]{43}$/.test(encodedKey))throw new Error('افتح هذه الصفحة بمسح رمز QR من شاشة تسجيل الدخول في التطبيق.');
      if(!crypto.subtle)throw new Error('المتصفح لا يدعم الربط المشفّر. حدّثه أو استخدم متصفحًا حديثًا.');
      aesKey=await crypto.subtle.importKey('raw',fromBase64(encodedKey),{name:'AES-GCM'},false,['encrypt','decrypt']);
      device=await request();byId('device-name').textContent=device.deviceName;byId('mac').textContent=device.mac;byId('device-id').textContent=device.deviceId||device.id;byId('device').hidden=false;
      form.hidden=device.status!=='waiting';showFields();message('الجهاز جاهز. اختر طريقة الاشتراك وأدخل بياناتك.');await poll();
    }catch(error){active=false;message(error.message,true);}
  })();
})();
