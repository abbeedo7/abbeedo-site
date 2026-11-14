import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReleaseFeed} from '../public/assets/site.js';
import {loadReleases,FEEDS,ANDROID_ORIGIN} from '../api/releases.mjs';
const digest='a'.repeat(64);
test('missing display-version feed retains usable Windows downloads and Android status',async()=>{
 const data={
  [FEEDS.android]:{versionName:'3.9.3',versionCode:28,downloadUrl:ANDROID_ORIGIN+'/abbeedo-3.9.3.apk',sha256:digest},
  [FEEDS.windows]:{windows:{setup:{available:true,size:100,sha256:digest,url:'/downloads/windows/setup.exe'},portable:{available:true,size:100,sha256:digest,url:'/downloads/windows/portable.exe'}}}
 };
 const release=await loadReleases({fetcher:async url=>{if(url===FEEDS.version)throw Error('Temporary version feed outage');return Response.json(data[url]);}});
 const rows=validateReleaseFeed(release.data);assert.equal(rows.android.version,'3.9.3');assert.equal(rows.windows.available,true);assert.equal(rows.windows.version,null);assert.ok(release.targets.windows.endsWith('/setup.exe'));
});
test('frontend metadata still rejects injected versions and a replaced download URL',()=>{
 const feed={android:{available:true,version:'3.9.3',url:'/downloads/android.apk'},windows:{setup:{available:true,version:'1.1.0',url:'/downloads/windows.exe'},portable:{available:true,version:'1.1.0',url:'/downloads/windows-portable.exe'}}};
 assert.throws(()=>validateReleaseFeed({...feed,android:{...feed.android,url:'https://external.example/a.apk'}}));
 assert.throws(()=>validateReleaseFeed({...feed,android:{...feed.android,version:'<script>'}}));
});
