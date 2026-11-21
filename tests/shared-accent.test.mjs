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
test('navigation carries only a public color and handoff time between isolated storage contexts',()=>{
  const origin=storage(),target=storage({[APP]:JSON.stringify({version:1,values:{accent:'#ff242d'}})});
  const chosen=website.setSharedAccent('#1357df',origin);
  const href=website.appearanceHandoffURL('/app?source=installed#start',{base:'https://www.abbeedo.com/',storage:origin});
  const url=new URL(href,'https://www.abbeedo.com');
  assert.deepEqual([...url.searchParams.keys()].sort(),['appearance','appearance_at','source']);
  assert.equal(url.searchParams.get('appearance'),'1357df');
  assert.ok(Number(url.searchParams.get('appearance_at'))>=chosen.updatedAt);
  const calls=[],history={state:{scroll:12},replaceState(...args){calls.push(args);}};
  application.consumeAppearanceHandoff({location:{href:url.href},history,storage:target});
  assert.equal(application.getSharedAccent(null,target),'#1357df');
  assert.equal(application.getSharedAppearance(target).updatedAt,Number(url.searchParams.get('appearance_at')));
  assert.deepEqual(calls[0],[history.state,'','/app?source=installed#start']);
  const next=application.appearanceHandoffURL('/',{base:'https://www.abbeedo.com/app',storage:target});
  assert.equal(new URL(next,'https://www.abbeedo.com').searchParams.get('appearance'),'1357df');
});
test('a current navigation overrides a different container default migrated after the source choice',()=>{
  const origin=storage(),target=storage(),now=Date.now();
  website.setSharedAccent('#1357df',origin,{updatedAt:now-10000});
  application.setSharedAccent('#ff242d',target,{updatedAt:now-5000});
  const href=website.appearanceHandoffURL('/app',{base:'https://www.abbeedo.com/',storage:origin});
  application.consumeAppearanceHandoff({location:{href:new URL(href,'https://www.abbeedo.com').href},history:{replaceState(){}},storage:target});
  assert.equal(application.getSharedAccent(null,target),'#1357df');
});
test('bootstrap and later module copies retain a handoff color even when browser storage rejects access',()=>{
  const blocked={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
  website.consumeAppearanceHandoff({location:{href:'https://www.abbeedo.com/app?appearance=1357df&appearance_at='+Date.now()},history:{replaceState(){}},storage:blocked});
  assert.equal(application.getSharedAccent('#ff242d',blocked),'#1357df');
  application.setSharedAccent('#00aaff',blocked);
  assert.equal(website.getSharedAccent(null,blocked),'#00aaff');
});
test('stale or invalid appearance links cannot replace a newer choice or modify external/download links',()=>{
  const saved=storage(),now=Date.now();
  website.setSharedAccent('#ff0000',saved,{updatedAt:now});
  for(const query of ['appearance=0000ff&appearance_at='+(now-1000),'appearance=javascript&appearance_at='+now,'appearance=0000ff&appearance_at='+(now+3600000)]){
    const history={replaceState(){}};
    website.consumeAppearanceHandoff({location:{href:'https://www.abbeedo.com/?'+query},history,storage:saved});
    assert.equal(website.getSharedAccent(null,saved),'#ff0000');
  }
  for(const link of ['#television','/downloads/android.apk','https://unrelated.invalid/app'])assert.equal(website.appearanceHandoffURL(link,{base:'https://www.abbeedo.com/',storage:saved}),link);
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
