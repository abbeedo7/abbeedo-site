import {nativeTVInfo} from './tv-network.js';
const active=new WeakMap();
export function configureTVPresentation(scope=globalThis){
 const info=nativeTVInfo(scope),doc=scope.document;
 if(!info||!doc)return null;
 if(active.has(doc))return active.get(doc);
 doc.documentElement.dataset.tv=info.platform;
 if(!info.packaged&&!doc.getElementById('native-tv-styles')){const link=doc.createElement('link');link.id='native-tv-styles';link.rel='stylesheet';link.href='/tv-overrides.css?tv=1.2';doc.head.append(link);}
 const key=event=>{
  const code=event.keyCode||event.which;
  if([461,10009].includes(code)){event.preventDefault();event.stopImmediatePropagation();(doc.activeElement||doc.body).dispatchEvent(new scope.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return;}
  if(doc.documentElement.dataset.appReady==='true'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  const dialog=doc.querySelector('dialog[open]');if(!dialog)return;
  const buttons=[...dialog.querySelectorAll('button:not([disabled]),select,input,summary')].filter(el=>el.getClientRects().length);
  if(!buttons.length)return;
  const current=buttons.indexOf(doc.activeElement),step=['ArrowRight','ArrowDown'].includes(event.key)?1:-1;
  buttons[(Math.max(0,current)+step+buttons.length)%buttons.length].focus();event.preventDefault();
 };
 doc.addEventListener('keydown',key,true);
 const result={...info,destroy(){doc.removeEventListener('keydown',key,true);delete doc.documentElement.dataset.tv;active.delete(doc);}};
 active.set(doc,result);return result;
}
