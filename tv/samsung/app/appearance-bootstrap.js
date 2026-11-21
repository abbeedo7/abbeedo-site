import {consumeAppearanceHandoff,getSharedAccent,appearanceHandoffURL} from './shared-accent.js';
import {applyAccentColors} from './accent-colors.js';

// Bundled as a classic, blocking script at the beginning of each page body.
// No page controls exist yet, so the saved appearance precedes their first paint.
const doc=globalThis.document;
if(doc?.body){
 consumeAppearanceHandoff();
 const application=doc.documentElement.dataset.appearanceContext==='app';
 let raw={};try{const parsed=JSON.parse(localStorage.getItem(application?'abbeedo:preferences:v1':'abbeedo:website:preferences:v2')||'null');raw=application?parsed?.values||{}:parsed||{};}catch{}
 const theme=['dark','light','sport','cinema'].includes(raw.theme)?raw.theme:'dark';
 doc.body.dataset.theme=theme;
 const scale=Number(application?raw.text_scale:raw.textScale);
 if(scale>=1&&scale<=1.5)doc.documentElement.style.setProperty('--scale',String(scale));
 const language=['ar','en'].includes(raw.language)?raw.language:'ar';
 doc.documentElement.lang=language;doc.documentElement.dir=language==='en'?'ltr':'rtl';
 applyAccentColors(doc,getSharedAccent(raw.accent||'#ff242d'),{theme,application,highContrast:application?raw.high_contrast===true:raw.contrast===true});
 doc.documentElement.dataset.appearanceReady='true';
 // Also carry color if a link is used before deferred application modules load.
 doc.addEventListener('click',event=>{
  const anchor=event.target.closest?.('a[href]');if(!anchor)return;
  const old=anchor.getAttribute('href'),next=appearanceHandoffURL(old,{base:doc.location.href});
  if(next!==old)anchor.setAttribute('href',next);
 },true);
}
