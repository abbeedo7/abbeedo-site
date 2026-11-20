import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPreferences,nextReleaseNoticeState} from '../public/assets/site.js';
const rows=(android='3.9.3',windows='1.2.0')=>({
 android:{available:true,version:android,url:'/downloads/android.apk'},
 windows:{available:true,version:windows,url:'/downloads/windows.exe'},
 portable:{available:true,version:windows,url:'/downloads/windows-portable.exe'}
});
test('website OS notifications require an explicit boolean opt-in',()=>{
 assert.equal(cleanPreferences().notifications,false);
 for(const value of ['true',1,{},null,false])assert.equal(cleanPreferences({notifications:value}).notifications,false);
 assert.equal(cleanPreferences({notifications:true}).notifications,true);
});
test('the initial release feed seeds silently and repeated versions never flood notices',()=>{
 const initial=nextReleaseNoticeState({},rows());assert.deepEqual(initial.notices,[]);
 assert.equal(initial.state.initialized,true);assert.equal(initial.state.versions.windows,'1.2.0');
 assert.deepEqual(nextReleaseNoticeState(initial.state,rows()).notices,[]);
 const newer=nextReleaseNoticeState(initial.state,rows('3.9.4','1.3.0'));
 assert.deepEqual(newer.notices.map(n=>n.id),['release-android-3.9.4','release-windows-1.3.0']);
 assert.equal(newer.notices.filter(n=>n.key==='windows').length,1,'setup and portable are one Windows release');
 assert.deepEqual(nextReleaseNoticeState(newer.state,rows('3.9.4','1.3.0')).notices,[]);
});
test('release outage, unknown version or downgrade does not manufacture another update',()=>{
 const previous=nextReleaseNoticeState({},rows('3.9.4','1.3.0')).state;
 const offline=nextReleaseNoticeState(previous,{android:{available:false},windows:{available:true,version:null},portable:{available:false}});
 assert.deepEqual(offline.notices,[]);assert.deepEqual(offline.state.versions,previous.versions);
 const lower=nextReleaseNoticeState(offline.state,rows('3.9.3','1.2.0'));assert.deepEqual(lower.notices,[]);
 assert.deepEqual(lower.state.versions,previous.versions);
 assert.deepEqual(nextReleaseNoticeState(lower.state,rows('3.9.4','1.3.0')).notices,[]);
});
test('notice history is bounded and contains no account data or untrusted IDs',()=>{
 const ids=Array.from({length:100},(_,n)=>'release-android-1.0.'+n);
 const result=nextReleaseNoticeState({version:1,initialized:true,versions:{android:'bad',password:'private'},ids:[...ids,'https://external.test/token','<script>']},rows());
 assert.ok(result.state.ids.length<=64);assert.ok(!JSON.stringify(result.state).includes('private'));
 assert.ok(result.state.ids.every(id=>/^(?:release-(?:android|windows)-[\d.]+|site-web-[a-f\d]{8,64})$/i.test(id)));
});
