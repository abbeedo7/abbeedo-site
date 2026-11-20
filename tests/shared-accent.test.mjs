import test from 'node:test';
import assert from 'node:assert/strict';
import * as website from '../public/assets/shared-accent.js';
import * as application from '../application/public/app/shared-accent.js';
import {readPreferences,writePreferences,migrateVaultPreferences,clearPreferences} from '../application/public/app/preferences.js';

const WEB='abbeedo:website:preferences:v2',APP='abbeedo:preferences:v1';
function storage(values={}) {
  const map=new Map(Object.entries(values));
  return {map,getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
}
test('app migration keeps a saved Vault color before a public appearance record exists',()=>{
  const saved=storage();
  assert.deepEqual(readPreferences(saved).values,{});
  const record=migrateVaultPreferences({accent:'#abcdef',language:'en'},saved);
  assert.equal(record.values.accent,'#abcdef');
  assert.equal(record.chosenLanguage,true);
  assert.equal(website.getSharedAccent(null,saved),'#abcdef');
});
test('other app settings cannot restore a stale color and deleting preferences resets the shared color',()=>{
  const saved=storage({[APP]:JSON.stringify({version:1,chosenLanguage:true,values:{accent:'#ff242d',language:'ar'}})});
  website.setSharedAccent('#ffffff',saved);
  assert.equal(readPreferences(saved).values.accent,'#ffffff');
  const changed=writePreferences({theme:'light'},{storage:saved,notify:false});
  assert.equal(changed.values.accent,'#ffffff');
  assert.equal(changed.values.language,'ar');
  assert.equal(changed.values.theme,'light');
  clearPreferences(saved);
  assert.equal(readPreferences(saved).chosenLanguage,false);
  assert.equal(website.getSharedAccent(null,saved),'#ff242d');
});
test('website and app share explicit colors in both directions without changing other preferences',()=>{
  const web={accent:'#ffffff',language:'en',theme:'light',notifications:true};
  const app={version:1,chosenLanguage:true,values:{accent:'#ff242d',language:'ar',theme:'sport'}};
  const saved=storage({[WEB]:JSON.stringify(web),[APP]:JSON.stringify(app)});
  assert.equal(application.getSharedAccent(null,saved),'#ffffff');
  website.setSharedAccent('#123456',saved);
  assert.equal(application.getSharedAccent(null,saved),'#123456');
  application.setSharedAccent('#000000',saved);
  assert.equal(website.getSharedAccent(null,saved),'#000000');
  assert.deepEqual(JSON.parse(saved.getItem(WEB)),web);
  assert.deepEqual(JSON.parse(saved.getItem(APP)),app);
  assert.deepEqual(Object.keys(JSON.parse(saved.getItem(website.SHARED_ACCENT_KEY))).sort(),['accent','updatedAt','version']);
});
for(const [name,module]of [['website',website],['application',application]]) {
  test(name+' preserves app custom colors and does not seed an empty installation before migration',()=>{
    const empty=storage();
    assert.equal(module.getSharedAccent(null,empty),null);
    assert.equal(module.getSharedAccent('#ff242d',empty),'#ff242d');
    assert.equal(empty.map.size,0);
    const saved=storage({[WEB]:JSON.stringify({accent:'#ff242d'}),[APP]:JSON.stringify({values:{accent:'#Ab12Cd'}})});
    assert.equal(module.getSharedAccent(null,saved),'#ab12cd');
    assert.equal(JSON.parse(saved.getItem(module.SHARED_ACCENT_KEY)).accent,'#ab12cd');
  });
  test(name+' rejects malformed colors and keeps changes usable when storage is blocked',()=>{
    const saved=storage({[module.SHARED_ACCENT_KEY]:JSON.stringify({version:1,accent:'url(https://untrusted.invalid)'})});
    assert.equal(module.getSharedAccent(null,saved),null);
    assert.equal(module.setSharedAccent('white',saved),null);
    const blocked={getItem(){throw Error('unavailable');},setItem(){throw Error('unavailable');}};
    module.setSharedAccent('#ffffff',blocked);
    assert.equal(module.getSharedAccent('#ff242d',blocked),'#ffffff');
    module.setSharedAccent('#000000',blocked);
    assert.equal(module.getSharedAccent(null,blocked),'#000000');
  });
}
