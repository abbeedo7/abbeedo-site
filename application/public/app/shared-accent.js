/** Shared appearance only: never read subscription data or encrypted account storage. */
export const SHARED_ACCENT_KEY='abbeedo:appearance:v1';
const WEBSITE_KEY='abbeedo:website:preferences:v2',APP_KEY='abbeedo:preferences:v1';
const DEFAULT_ACCENT='#ff242d',stateKey=Symbol.for('abbeedo.public-appearance.v1');
// The blocking bundle and later ES modules share the same fallback when storage
// is denied. Consuming a navigation color must not lose it after URL cleanup.
const state=globalThis[stateKey]||(globalThis[stateKey]={fallbacks:new WeakMap(),memory:null}),fallbacks=state.fallbacks;
export const appearanceStorage=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
const color=value=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value)?value.toLowerCase():null;
function stored(storage,key){try{return JSON.parse(storage?.getItem(key)||'null');}catch{return null;}}
function valid(record){return record?.version===1&&color(record.accent)?{version:1,accent:color(record.accent),updatedAt:Number(record.updatedAt)||0}:null;}
function current(storage){const persisted=valid(stored(storage,SHARED_ACCENT_KEY)),pending=storage?fallbacks.get(storage):state.memory;if(persisted&&(!pending||persisted.updatedAt>=pending.updatedAt)){if(storage)fallbacks.delete(storage);return persisted;}return pending||persisted;}
export function setSharedAccent(value,storage=appearanceStorage(),{updatedAt}={}){
 const accent=color(value);if(!accent)return null;
 const old=current(storage),incoming=Number.isSafeInteger(updatedAt)&&updatedAt>0?updatedAt:null;
 if(incoming&&old&&old.updatedAt>=incoming)return old;
 if(old?.accent===accent&&!incoming)return old;
 const record={version:1,accent,updatedAt:incoming||Math.max(Date.now(),(old?.updatedAt||0)+1)};
 if(!storage)state.memory=record;else try{storage.setItem(SHARED_ACCENT_KEY,JSON.stringify(record));fallbacks.delete(storage);}catch{fallbacks.set(storage,record);}
 return record;
}
export function getSharedAccent(fallback=null,storage=appearanceStorage()){
 const saved=current(storage);if(saved)return saved.accent;
 // The website had no per-color timestamp. Prefer an existing custom website
 // color, then an existing app choice; defaults must not erase a custom choice.
 const website=color(stored(storage,WEBSITE_KEY)?.accent)||color(stored(storage,'f7rv.site.preferences.v1')?.accent),app=color(stored(storage,APP_KEY)?.values?.accent);
 const migrated=website&&website!==DEFAULT_ACCENT?website:app||website;
 if(migrated)return setSharedAccent(migrated,storage).accent;
 // Do not persist a default on an empty installation before Vault migration.
 return color(fallback);
}
export function getSharedAppearance(storage=appearanceStorage()){
 getSharedAccent(null,storage);return current(storage);
}
const HANDOFF='appearance',STAMP='appearance_at';
/** Only a public color and handoff time cross a navigation boundary. */
export function consumeAppearanceHandoff({location=globalThis.location,history=globalThis.history,storage=appearanceStorage()}={}){
 let url;try{url=new URL(location.href);}catch{return null;}
 if(!url.searchParams.has(HANDOFF)&&!url.searchParams.has(STAMP))return null;
 const raw=url.searchParams.get(HANDOFF)||'',stamp=Number(url.searchParams.get(STAMP)),old=current(storage);
 let adopted=null;
 if(/^[a-f\d]{6}$/i.test(raw)&&Number.isSafeInteger(stamp)&&stamp>0&&stamp<=Date.now()+300000&&(!old||stamp>old.updatedAt))adopted=setSharedAccent('#'+raw,storage,{updatedAt:stamp});
 url.searchParams.delete(HANDOFF);url.searchParams.delete(STAMP);
 try{history?.replaceState(history.state,'',url.pathname+url.search+url.hash);}catch{}
 return adopted;
}
export function appearanceHandoffURL(value,{base=globalThis.location?.href,storage=appearanceStorage()}={}){
 if(typeof value!=='string'||value.startsWith('#'))return value;
 let url,origin;try{origin=new URL(base);url=new URL(value,origin);}catch{return value;}
 if(!['http:','https:'].includes(url.protocol)||!(url.origin===origin.origin||['abbeedo.com','www.abbeedo.com'].includes(url.hostname)))return value;
 if(!['/','/app','/app/','/app.html','/open','/apps','/apps/'].includes(url.pathname))return value;
 const record=getSharedAppearance(storage);if(!record)return value;
 url.searchParams.set(HANDOFF,record.accent.slice(1));url.searchParams.set(STAMP,String(Math.max(Date.now(),record.updatedAt)));
 return url.origin===origin.origin?url.pathname+url.search+url.hash:url.href;
}
export function decorateAppearanceLinks(doc=globalThis.document){
 if(!doc)return;
 for(const anchor of doc.querySelectorAll('a[href]')){
  const original=anchor.getAttribute('href'),next=appearanceHandoffURL(original,{base:doc.location?.href});
  if(next!==original)anchor.setAttribute('href',next);
 }
}
