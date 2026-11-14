// Shared application motion: compositor grid plus a short RGB tear of the
// actual brand texture. No second page background or perpetual JS render loop.
const controllers=new WeakMap();
const BURST_MS=220,QUIET_MS=320;
const inert=Object.freeze({refresh(){},trigger(){return false;},destroy(){}});

export function visualPolicy({background='standard',reducedMotion=false,systemReducedMotion=false,hidden=false,playback=false}={}){
  const speed=background==='fast'?'fast':'standard';
  const state=hidden?'hidden':playback?'playback':reducedMotion||systemReducedMotion?'reduced':background==='off'?'off':'running';
  return {state,speed,backgroundRunning:state==='running',glitchEnabled:!['hidden','playback','reduced'].includes(state)};
}

export function startBackground(scope=globalThis){
  const doc=scope?.document;
  if(!doc?.body||!doc.documentElement||!scope.requestAnimationFrame)return inert;
  if(controllers.has(doc))return controllers.get(doc);
  const root=doc.documentElement,background=doc.createElement('div'),canvas=doc.createElement('canvas');
  background.id='visual-backdrop';background.setAttribute('aria-hidden','true');
  for(const name of ['motion-glow','motion-grid motion-grid-x','motion-grid motion-grid-y']){const layer=doc.createElement('div');layer.className=name;background.append(layer);}
  canvas.id='visual-glitch';canvas.hidden=true;canvas.setAttribute('aria-hidden','true');
  doc.body.prepend(background);doc.body.append(canvas);doc.body.classList.add('visual-effects-ready');
  let context=null;try{context=canvas.getContext('2d');}catch{}
  let preference;try{preference=scope.matchMedia?.('(prefers-reduced-motion: reduce)');}catch{}
  let suspended=false,closed=false,frame=0,burst=null,lastBurst=-Infinity,logo=null,image=null;
  const now=()=>scope.performance?.now?.()??Date.now();
  const policy=()=>visualPolicy({background:doc.body.dataset.background||'standard',reducedMotion:doc.body.dataset.reducedMotion==='true',systemReducedMotion:!!preference?.matches,hidden:suspended||!!doc.hidden,playback:[...doc.querySelectorAll('video')].some(video=>!video.paused&&!video.ended)});
  function clearBurst(){if(frame)scope.cancelAnimationFrame(frame);frame=0;burst?.motion?.cancel();burst=null;canvas.hidden=true;root.dataset.glitchActive='false';if(context)context.clearRect(0,0,canvas.width,canvas.height);}
  function refresh(){if(closed)return;const value=policy();background.dataset.state=value.state;background.dataset.speed=value.speed;root.dataset.visualMotion=value.state;if(!value.glitchEnabled)clearBurst();}
  function texture(source,color){const result=doc.createElement('canvas'),ratio=Math.min(1,256/Math.max(source.naturalWidth,source.naturalHeight));result.width=Math.max(1,Math.round(source.naturalWidth*ratio));result.height=Math.max(1,Math.round(source.naturalHeight*ratio));let paint;try{paint=result.getContext('2d');}catch{return source;}if(!paint)return source;paint.drawImage(source,0,0,result.width,result.height);if(color){paint.globalCompositeOperation='source-in';paint.fillStyle=color;paint.fillRect(0,0,result.width,result.height);}return result;}
  const visibleBrand=target=>{const candidates=target?.matches?.('[data-brand-logo],.brand-logo')?[target]:[...(target?.querySelectorAll?.('[data-brand-logo],.brand-logo')||[])];return candidates.find(node=>!node.closest('[hidden]')&&node.getClientRects().length);};
  const firstBrand=visibleBrand(doc.body);
  if(scope.Image){image=new scope.Image();image.onload=()=>{if(closed||!image.naturalWidth)return;logo={white:texture(image),red:texture(image,'#ff164d'),cyan:texture(image,'#00edda')};};image.onerror=()=>{};image.src=firstBrand?.currentSrc||firstBrand?.src||new URL('./brand.png',import.meta.url).href;}
  function boundsFor(target){const rect=target?.getBoundingClientRect?.(),width=Math.max(1,scope.innerWidth||root.clientWidth),height=Math.max(1,scope.innerHeight||root.clientHeight);if(!rect)return {left:0,top:0,width,height};const left=Math.max(0,rect.left),top=Math.max(0,rect.top);return {left,top,width:Math.max(0,Math.min(width,rect.right)-left),height:Math.max(0,Math.min(height,rect.bottom)-top)};}
  function drawBurst(){
    frame=0;if(closed||!burst||!policy().glitchEnabled)return clearBurst();
    const elapsed=Math.max(0,now()-burst.began);if(elapsed>=BURST_MS)return clearBurst();
    const width=Math.max(1,scope.innerWidth||root.clientWidth),height=Math.max(1,scope.innerHeight||root.clientHeight),scale=Math.min(scope.devicePixelRatio||1,1.5,Math.sqrt(2000000/(width*height)));
    if(canvas.width!==Math.round(width*scale)||canvas.height!==Math.round(height*scale)){canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);}
    if(context){context.setTransform(scale,0,0,scale,0,0);context.clearRect(0,0,width,height);const bounds=boundsFor(burst.target),candidate=visibleBrand(burst.target),rect=candidate?.getBoundingClientRect();
      if(logo&&rect&&bounds.width&&bounds.height){const strength=Math.sin(Math.PI*elapsed/BURST_MS),fringe=Math.max(1,rect.width*.025)*strength,tick=Math.floor(elapsed/34);
        for(let slice=0;slice<11;slice++){const seed=(tick*17+slice*13)&31,displacement=((seed%9)-4)*rect.width*.016*strength,top=rect.top+rect.height*slice/11;context.save();context.beginPath();context.rect(Math.max(bounds.left,rect.left-fringe*4),Math.max(bounds.top,top),Math.min(bounds.width,rect.width+fringe*8),Math.max(0,Math.min(rect.height/11+.5,bounds.top+bounds.height-top)));context.clip();for(const [name,offset,alpha]of [['red',fringe,.66],['cyan',-fringe,.68],['white',0,.5]]){context.globalAlpha=alpha*strength;context.drawImage(logo[name],rect.left+displacement+offset,rect.top,rect.width,rect.height);}context.restore();}
      }
    }
    frame=scope.requestAnimationFrame(drawBurst);
  }
  function trigger(target=doc.querySelector('[data-hero]')||doc.querySelector('main')||doc.body){
    if(closed||!policy().glitchEnabled||!target||target.closest?.('[hidden]'))return false;
    const time=now();if(burst){const old=boundsFor(burst.target),next=boundsFor(target);if(next.width*next.height>old.width*old.height)burst.target=target;return true;}if(time-lastBurst<BURST_MS+QUIET_MS)return false;
    lastBurst=time;burst={target,began:time,motion:null};
    if(target.animate)try{burst.motion=target.animate([{translate:'0 0',filter:'none'},{translate:'3px 0',filter:'drop-shadow(2px 0 #ff164d88) drop-shadow(-2px 0 #00edda88)',offset:.22},{translate:'-3px 1px',filter:'drop-shadow(-1px 0 #ff164d66) drop-shadow(1px 0 #00edda66)',offset:.48},{translate:'1px 0',filter:'none',offset:.76},{translate:'0 0',filter:'none'}],{duration:BURST_MS,easing:'steps(1, end)'});}catch{}
    root.dataset.glitchActive='true';root.dataset.glitchCount=String((Number(root.dataset.glitchCount)||0)+1);canvas.hidden=false;frame=scope.requestAnimationFrame(drawBurst);return true;
  }
  const onPointer=event=>{const target=event.target?.closest?.('button,a[data-glitch],a.download-primary,a.download-secondary');if(target&&!target.disabled&&target.getAttribute('aria-disabled')!=='true')trigger(target);};
  const onHide=event=>{suspended=true;refresh();if(!event.persisted)controller.destroy();},onShow=()=>{suspended=false;refresh();};
  const observer=scope.MutationObserver?new scope.MutationObserver(refresh):null;observer?.observe(doc.body,{attributes:true,attributeFilter:['data-background','data-reduced-motion']});
  doc.addEventListener('visibilitychange',refresh);doc.addEventListener('pointerdown',onPointer,{passive:true});for(const event of ['play','playing','pause','ended','emptied'])doc.addEventListener(event,refresh,true);
  scope.addEventListener('pagehide',onHide);scope.addEventListener('pageshow',onShow);scope.addEventListener('resize',clearBurst,{passive:true});
  if(preference?.addEventListener)preference.addEventListener('change',refresh);else preference?.addListener?.(refresh);
  const controller={refresh,trigger,destroy(){if(closed)return;closed=true;clearBurst();observer?.disconnect();doc.removeEventListener('visibilitychange',refresh);doc.removeEventListener('pointerdown',onPointer);for(const event of ['play','playing','pause','ended','emptied'])doc.removeEventListener(event,refresh,true);scope.removeEventListener('pagehide',onHide);scope.removeEventListener('pageshow',onShow);scope.removeEventListener('resize',clearBurst);if(preference?.removeEventListener)preference.removeEventListener('change',refresh);else preference?.removeListener?.(refresh);background.remove();canvas.remove();doc.body.classList.remove('visual-effects-ready');root.dataset.visualMotion='destroyed';controllers.delete(doc);if(image){image.onload=null;image.onerror=null;}logo=null;image=null;}};
  controllers.set(doc,controller);root.dataset.visualEffects='ready';root.dataset.glitchActive='false';refresh();return controller;
}

export function triggerGlitch(target){try{return startBackground().trigger(target);}catch{return false;}}
