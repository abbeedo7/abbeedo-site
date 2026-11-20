/** Shared appearance only: never read subscription data or encrypted account storage. */
export const SHARED_ACCENT_KEY='abbeedo:appearance:v1';
const WEBSITE_KEY='abbeedo:website:preferences:v2',APP_KEY='abbeedo:preferences:v1';
const DEFAULT_ACCENT='#ff242d',fallbacks=new WeakMap();
let memory=null;
export const appearanceStorage=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
const color=value=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value)?value.toLowerCase():null;
function stored(storage,key){try{return JSON.parse(storage?.getItem(key)||'null');}catch{return null;}}
function valid(record){return record?.version===1&&color(record.accent)?{version:1,accent:color(record.accent),updatedAt:Number(record.updatedAt)||0}:null;}
function current(storage){const persisted=valid(stored(storage,SHARED_ACCENT_KEY)),pending=storage?fallbacks.get(storage):memory;if(persisted&&(!pending||persisted.updatedAt>=pending.updatedAt)){if(storage)fallbacks.delete(storage);return persisted;}return pending||persisted;}
export function setSharedAccent(value,storage=appearanceStorage()){
 const accent=color(value);if(!accent)return null;
 const old=current(storage);if(old?.accent===accent)return old;
 const record={version:1,accent,updatedAt:Math.max(Date.now(),(old?.updatedAt||0)+1)};
 if(!storage)memory=record;else try{storage.setItem(SHARED_ACCENT_KEY,JSON.stringify(record));fallbacks.delete(storage);}catch{fallbacks.set(storage,record);}
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
