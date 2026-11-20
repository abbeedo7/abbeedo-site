import test from 'node:test';
import assert from 'node:assert/strict';
import {startVisualEffects,visualPolicy as applicationPolicy} from '../application/public/app/glitch.js';
import {startBackground,visualPolicy as websitePolicy} from '../public/assets/background.js';

function environment(){
  let clock=0,serial=0,playing=false;const timers=new Map(),images=[],animated=[],draws=[];
  const rectangle=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
  const paint={setTransform(){},clearRect(){},drawImage(...args){draws.push(args);},fillRect(){},save(){},restore(){},beginPath(){},rect(){},clip(){}};
  class Node extends EventTarget{
    constructor(type='div'){super();this.type=type;this.dataset={};this.children=[];this.hidden=false;this.style={};this.classList={add(){},remove(){}};}
    setAttribute(name,value){this[name]=value;}getAttribute(name){return this[name]??null;}
    append(child){this.children.push(child);}prepend(child){this.children.unshift(child);}remove(){this.removed=true;}
    getContext(){return paint;}closest(selector){return selector==='[hidden]'&&this.hidden?this:null;}
    matches(selector){return this.type==='logo'&&selector.includes('brand-logo');}
    getBoundingClientRect(){return this.rect||rectangle(0,0,1440,900);}
    getClientRects(){return this.hidden?[]:[this.getBoundingClientRect()];}
    querySelectorAll(){return [];}animate(){animated.push(this.id);return {cancel(){}};}
  }
  const body=new Node(),root=new Node(),player=new Node();player.hidden=true;
  const logos=[['header',rectangle(12,8,32,32)],['main',rectangle(430,160,190,190)],['offscreen',rectangle(300,1400,400,400)]].map(([id,rect])=>Object.assign(new Node('logo'),{id,rect}));
  body.querySelectorAll=()=>logos;
  class Doc extends EventTarget{
    constructor(){super();this.body=body;this.documentElement=root;this.baseURI='https://owned.test/';this.hidden=false;}
    createElement(type){return new Node(type);}
    querySelector(selector){return selector==='dialog[open]'&&this.dialogOpen?{}:null;}
    querySelectorAll(selector){return selector==='video'?[{paused:!playing,ended:false}]:logos;}
    getElementById(id){return id==='player-page'?player:id==='app-shell'?body:null;}
  }
  const document=new Doc(),storage=new Map(),media=Object.assign(new EventTarget(),{matches:false});
  const scope=Object.assign(new EventTarget(),{document,innerWidth:1440,innerHeight:900,devicePixelRatio:1,performance:{now:()=>clock},getComputedStyle:()=>({visibility:'visible',display:'block'}),matchMedia:()=>media});
  scope.setTimeout=(callback,delay)=>{const id=++serial;timers.set(id,{at:clock+delay,callback});return id;};
  scope.clearTimeout=id=>timers.delete(id);
  scope.requestAnimationFrame=callback=>scope.setTimeout(()=>callback(clock),16);
  scope.cancelAnimationFrame=scope.clearTimeout;
  scope.Image=class{constructor(){images.push(this);this.naturalWidth=512;this.naturalHeight=512;}load(){this.onload?.();}};
  scope.visualViewport=Object.assign(new EventTarget(),{width:1440,height:900,offsetTop:0});
  scope.sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  function advance(milliseconds){const end=clock+milliseconds;let count=0;for(;;){const next=[...timers].filter(([,value])=>value.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;assert.ok(++count<1000,'Timer loop must stay bounded');timers.delete(next[0]);clock=next[1].at;next[1].callback();}clock=end;}
  return {scope,document,body,root,images,animated,draws,timers,logos,storage,media,advance,setPlaying(value){playing=value;player.hidden=!value;}};
}

for(const [name,start,policy]of [['application',startVisualEffects,applicationPolicy],['website',startBackground,websitePolicy]]){
  test(name+' waits for its actual logo, repeats on the largest visible brand and suspends every idle timer',()=>{
    const env=environment(),controller=start(env.scope);
    assert.equal(start(env.scope),controller,'mount remains idempotent');
    env.advance(1000);assert.equal(Number(env.root.dataset.glitchCount)||0,0,'no blank burst before image load');
    env.images[0].load();assert.equal(env.root.dataset.glitchReady,'true');
    env.advance(220);assert.equal(env.root.dataset.glitchCount,'1');assert.equal(env.animated[0],'main','tiny header/offscreen logos are not preferred');
    assert.ok(env.draws.length>3,'the main canvas receives real logo slices after texture creation');
    env.advance(400);assert.equal(env.root.dataset.glitchActive,'false');
    env.advance(10000);assert.equal(env.root.dataset.glitchCount,'2','an idle user sees the effect again without clicking');
    env.document.hidden=true;controller.refresh();env.advance(30000);assert.equal(env.root.dataset.glitchCount,'2');assert.equal(env.timers.size,0);
    env.document.hidden=false;controller.refresh();env.advance(10000);assert.equal(env.root.dataset.glitchCount,'3');
    env.body.dataset.background='off';controller.refresh();env.advance(20000);assert.equal(env.root.dataset.glitchCount,'3','Still disables scheduled decorative bursts');
    env.body.dataset.reducedMotion='true';controller.refresh();assert.equal(controller.trigger(env.logos[1]),false);
    env.body.dataset.reducedMotion='false';env.body.dataset.background='standard';env.setPlaying(true);controller.refresh();assert.equal(controller.trigger(env.logos[1]),false);assert.equal(env.timers.size,0);
    controller.destroy();assert.equal(env.timers.size,0);assert.equal(env.root.dataset.visualMotion,'destroyed');
    assert.equal(policy({background:'off'}).automaticGlitchEnabled,false);
    assert.equal(policy({systemReducedMotion:true}).glitchEnabled,false);
  });
  test(name+' replays the initial request once the delayed texture is ready',()=>{
    const env=environment(),controller=start(env.scope);
    assert.equal(controller.trigger(env.body),false);assert.equal(Number(env.root.dataset.glitchCount)||0,0);
    env.images[0].load();assert.equal(env.root.dataset.glitchCount,'1');
    env.advance(350);assert.equal(env.root.dataset.glitchActive,'false');assert.ok(env.animated.every(id=>id==='main'),'only the actual logo moves; no whole page/card filters');
    controller.destroy();assert.equal(env.timers.size,0);
  });
  test(name+' covers the changing visual viewport and leaves card content stable when a dialog opens',()=>{
    const env=environment(),controller=start(env.scope),backdrop=env.body.children.find(node=>node.id==='visual-backdrop');
    env.scope.innerHeight=600;env.scope.visualViewport.height=650;env.scope.visualViewport.offsetTop=30;env.scope.visualViewport.dispatchEvent(new Event('resize'));
    assert.equal(backdrop.style.height,'680px','Safari viewport offsets cannot leave a strip uncovered');
    env.images[0].load();env.advance(220);assert.equal(env.root.dataset.glitchActive,'true');
    env.document.dialogOpen=true;controller.refresh();assert.equal(env.root.dataset.glitchActive,'false');assert.equal(backdrop.dataset.state,'running','opening settings does not remove the background');
    assert.equal(controller.trigger(env.body),false);assert.equal(env.timers.size,0);
    assert.ok(env.animated.every(id=>id==='main'),'the card/page is never animated or filtered');
    env.document.dialogOpen=false;const event=new Event('change');Object.defineProperty(event,'matches',{value:true});env.media.dispatchEvent(event);
    assert.equal(env.root.dataset.visualMotion,'reduced','the preference event value wins even when the query getter is stale');
    controller.destroy();
  });
}

test('website consumes a recent navigation marker and paints only after the arriving logo is ready',()=>{
 const env=environment(),key='abbeedo:website:glitch-arrival:v1';env.storage.set(key,JSON.stringify({at:Date.now()}));
 const controller=startBackground(env.scope);assert.equal(env.storage.has(key),false);assert.equal(env.root.dataset.glitchCount,undefined);
 env.images[0].load();assert.equal(env.root.dataset.glitchNavigation,'arriving');assert.equal(env.root.dataset.glitchCount,'1');controller.destroy();
});
