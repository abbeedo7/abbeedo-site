import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReleaseFeed} from '../public/assets/site.js';
import {loadReleases,ASSET_NAMES} from '../api/releases.mjs';
const digest='a'.repeat(64);
test('an unavailable Windows release does not hide a valid Android release',async()=>{
 const manifest={schemaVersion:1,tag:'v1.2.0',webVersion:'1.2.0',android:{version:'3.9.4',versionCode:29,filename:ASSET_NAMES.android,sha256:digest,size:5428082},windows:{version:'1.2.0'}};
 const release=await loadReleases({fetcher:async()=>Response.json(manifest)});
 const rows=validateReleaseFeed(release.data);assert.equal(rows.android.version,'3.9.4');assert.equal(rows.android.available,true);assert.equal(rows.windows.available,false);assert.ok(release.targets.android.includes('github.com/abbeedo7/abbeedo-site/'));
});
test('frontend metadata still rejects injected versions and a replaced download URL',()=>{
 const feed={android:{available:true,version:'3.9.3',url:'/downloads/android.apk'},windows:{setup:{available:true,version:'1.1.0',url:'/downloads/windows.exe'},portable:{available:true,version:'1.1.0',url:'/downloads/windows-portable.exe'}}};
 assert.throws(()=>validateReleaseFeed({...feed,android:{...feed.android,url:'https://external.example/a.apk'}}));
 assert.throws(()=>validateReleaseFeed({...feed,android:{...feed.android,version:'<script>'}}));
});
