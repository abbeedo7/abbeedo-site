import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSET_NAMES,releaseFeedURL,configuredSource,readFeed,loadReleases,createReleasesHandler} from '../releases.mjs';
import {createDownloadHandler,requestedFile,resolvePublicDownload} from '../download.mjs';
const configuration={provider:'github',github:{owner:'abbeedo7',repository:'abbeedo-site',tag:'latest'}};
const base='https://github.com/abbeedo7/abbeedo-site',hash='a'.repeat(64);
const manifest=()=>({schemaVersion:1,tag:'v1.2.0',webVersion:'2.1.0',android:{version:'3.9.3',versionCode:28,filename:ASSET_NAMES.android,sha256:hash,size:5000000},windows:{version:'1.2.0',setup:{filename:ASSET_NAMES.windows,sha256:hash,size:120000000},portable:{filename:ASSET_NAMES.portable,sha256:hash,size:119000000}}});
function fetcher(record=manifest()){
 return async(url,options)=>{
  assert.equal(options.cache,'no-store');assert.equal(options.redirect,'manual');assert.ok(options.signal instanceof AbortSignal);
  if(url===releaseFeedURL(configuration))return Response.redirect(base+'/releases/download/v1.2.0/releases.json');
  if(url===base+'/releases/download/v1.2.0/releases.json')return Response.redirect('https://release-assets.githubusercontent.com/github-production-release-asset/123/manifest?signature=owned-fixture');
  if(Object.values(ASSET_NAMES).some(name=>url===base+'/releases/download/v1.2.0/'+name)){
   assert.equal(options.method,'GET');assert.equal(options.headers.Range,'bytes=0-0');
   assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);
   return Response.redirect('https://release-assets.githubusercontent.com/github-production-release-asset/123/'+new URL(url).pathname.split('/').pop()+'?signature=owned-fixture');
  }
  assert.equal(new URL(url).hostname,'release-assets.githubusercontent.com');return Response.json(record);
 };
}
function response(){return {statusCode:0,headers:{},body:null,setHeader(name,value){this.headers[name.toLowerCase()]=value;},end(value){this.body=value??'';}};}
test('metadata follows publisher-owned release manifest, preserving stable public aliases and integrity',async()=>{
 const result=await loadReleases({configuration,fetcher:fetcher(),now:()=>new Date('2026-11-14T00:00:00Z')});
 assert.equal(result.status,200);assert.equal(result.data.android.url,'/downloads/android.apk');assert.equal(result.data.android.versionCode,28);assert.equal(result.data.windows.setup.version,'1.2.0');assert.equal(result.data.windows.portable.sha256,hash);assert.equal(result.data.checkedAt,'2026-11-14T00:00:00.000Z');
 assert.equal(result.targets.android,base+'/releases/download/v1.2.0/abbeedo-TV-Android.apk');assert.equal(result.data.windows.setup.assetUrl,base+'/releases/download/v1.2.0/abbeedo-TV-Setup.exe');assert.equal(result.data.windows.setup.url,'/downloads/windows.exe');
});
test('a newer published release is selected with no website build or URL change',async()=>{
 const first=await loadReleases({configuration,fetcher:async()=>Response.json(manifest())});const next=manifest();next.tag='v1.3.0';next.android.version='3.9.4';next.android.versionCode=29;next.windows.version='1.3.0';
 const second=await loadReleases({configuration,fetcher:async()=>Response.json(next)});assert.notEqual(first.targets.android,second.targets.android);assert.match(second.targets.windows,/\/v1\.3\.0\//);assert.equal(first.data.android.url,second.data.android.url);
});
test('incomplete platform metadata does not hide another valid platform',async()=>{
 const data=manifest();data.android.sha256='invalid';const first=await loadReleases({configuration,fetcher:fetcher(data)});assert.equal(first.data.android.available,false);assert.equal(first.data.windows.setup.available,true);
 data.windows.setup.filename='wrong.exe';data.windows.portable.size=Infinity;assert.equal((await loadReleases({configuration,fetcher:fetcher(data)})).status,503);
});
test('release assets reject foreign repositories, injected URLs, wrong names and malformed hashes',async()=>{
 for(const url of ['https://evil.test/a.apk','https://github.com/other/repo/releases/download/v1.2.0/abbeedo-TV-Android.apk',base+'/releases/download/v1.2.0/abbeedo-TV-Android.apk?token=secret','https://user:pass@github.com/abbeedo7/abbeedo-site/releases/download/v1.2.0/abbeedo-TV-Android.apk']){
  const data=manifest();data.android.url=url;assert.equal((await loadReleases({configuration,fetcher:fetcher(data)})).targets.android,null);
 }
});
test('manifest redirects cannot escape own repository or GitHub release-asset CDN',async()=>{
 for(const target of ['https://evil.test/releases.json','http://github.com/abbeedo7/abbeedo-site/releases/latest/download/releases.json','https://github.com/another/repo/releases/download/v1.2.0/releases.json','http://127.0.0.1/','https://user:pass@release-assets.githubusercontent.com/github-production-release-asset/123/a']){
  let calls=0;await assert.rejects(readFeed(releaseFeedURL(configuration),{configuration,fetcher:async()=>{calls++;return Response.redirect(target);}}));assert.equal(calls,1);
 }
});
test('manifest tag must match observed or explicitly selected release tag',async()=>{
 const data=manifest();data.tag='v9.9.9';await assert.rejects(readFeed(releaseFeedURL(configuration),{configuration,fetcher:fetcher(data)}));
 const pinned={provider:'github',github:{owner:'abbeedo7',repository:'abbeedo-site',tag:'v1.1.0'}};await assert.rejects(readFeed(releaseFeedURL(pinned),{configuration:pinned,fetcher:async()=>Response.json(manifest())}));
});
test('unconfigured or unavailable hosting never falls back to an unrelated download host',async()=>{
 let calls=0;const result=await loadReleases({configuration:{provider:'github',github:{}},fetcher:async()=>{calls++;}});assert.equal(result.status,503);assert.equal(result.data.configurationRequired,true);assert.equal(calls,0);assert.deepEqual(Object.values(result.targets),[null,null,null]);
 const absent=await loadReleases({configuration,fetcher:async()=>new Response('Not found',{status:404})});assert.equal(absent.data.code,'RELEASE_UNAVAILABLE');assert.deepEqual(Object.values(absent.targets),[null,null,null]);
});
test('manifest parser bounds response size and rejects HTML, invalid JSON and arbitrary input URLs',async()=>{
 for(const result of [new Response('html',{headers:{'Content-Type':'text/html'}}),Response.json({...manifest(),large:'x'.repeat(131073)}),Response.json({schemaVersion:8})])await assert.rejects(readFeed(releaseFeedURL(configuration),{configuration,fetcher:async()=>result}));
 await assert.rejects(readFeed('https://evil.test/feed',{configuration}));
});
test('one bounded timeout aborts a stalled manifest request',async()=>{
 let aborted=false;await assert.rejects(readFeed(releaseFeedURL(configuration),{configuration,timeoutMs:15,fetcher:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}))}));assert.equal(aborted,true);
});
test('public release metadata is uncached; GET, HEAD and OPTIONS use correct empty-body semantics',async()=>{
 const handler=createReleasesHandler({configuration,fetcher:fetcher()});for(const method of ['GET','HEAD','OPTIONS']){const out=response();await handler({method},out);assert.equal(out.statusCode,method==='OPTIONS'?204:200);assert.equal(out.headers['vercel-cdn-cache-control'],'no-store');if(method!=='GET')assert.equal(out.body,'');}
 const out=response();await handler({method:'POST'},out);assert.equal(out.statusCode,405);
});
test('download aliases resolve public files on the server and never navigate customers through GitHub sign-in UI',async()=>{
 const handler=createDownloadHandler({configuration,fetcher:fetcher()});for(const [file,name]of Object.entries(ASSET_NAMES))for(const method of ['GET','HEAD']){const out=response();await handler({method,url:'/api/download?file='+file},out);assert.equal(out.statusCode,307);assert.equal(out.headers.location,'https://release-assets.githubusercontent.com/github-production-release-asset/123/'+name+'?signature=owned-fixture');assert.equal(out.body,'');assert.equal(out.headers['cache-control'],'no-store, max-age=0');}
});
test('public file redirects reject login pages, external/private hosts, credentials and HTML instead of silently requesting an account',async()=>{
 const target=base+'/releases/download/v1.2.0/'+ASSET_NAMES.android;
 for(const location of ['https://github.com/login','https://evil.test/file.apk','http://release-assets.githubusercontent.com/github-production-release-asset/123/a','https://127.0.0.1/file.apk','https://user:pass@release-assets.githubusercontent.com/github-production-release-asset/123/a']){
  await assert.rejects(resolvePublicDownload(target,'android',{configuration,fetcher:async()=>Response.redirect(location)}));
 }
 await assert.rejects(resolvePublicDownload(target,'android',{configuration,fetcher:async()=>new Response('<html>Sign in</html>',{headers:{'Content-Type':'text/html'}})}));
 await assert.rejects(resolvePublicDownload('https://github.com/unrelated/repo/releases/download/v1.2.0/'+ASSET_NAMES.android,'android',{configuration,fetcher:async()=>{throw Error('must not fetch');}}));
});
test('a public binary resolution timeout aborts its request without retaining a signed link',async()=>{
 let aborted=false;await assert.rejects(resolvePublicDownload(base+'/releases/download/v1.2.0/'+ASSET_NAMES.android,'android',{configuration,timeoutMs:10,fetcher:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}))}));assert.equal(aborted,true);
});
test('arbitrary and duplicate file parameters fail before any network request',async()=>{
 const handler=createDownloadHandler({configuration,fetcher:async()=>{throw Error('Must not fetch');}});for(const url of ['/api/download?file=http://evil.test','/api/download?file=android&file=portable','/api/download?file=android&url=https://evil.test','/api/download']){const out=response();await handler({method:'GET',url},out);assert.equal(out.statusCode,400);}
 assert.equal(requestedFile({url:'/downloads/android.apk'}),'android');assert.equal(requestedFile({url:'/downloads/windows-portable.exe'}),'portable');
});
test('optional public Blob hosting is pinned to one configured public store',async()=>{
 const blob={provider:'public-blob',blob:{manifestUrl:'https://owned-store.public.blob.vercel-storage.com/releases/releases.json'}},data=manifest();
 for(const [key,row]of [['android',data.android],['windows',data.windows.setup],['portable',data.windows.portable]])row.url='https://owned-store.public.blob.vercel-storage.com/releases/v1.2.0/'+ASSET_NAMES[key];
 const good=await loadReleases({configuration:blob,fetcher:async()=>Response.json(data)});assert.equal(good.status,200);
 data.android.url='https://foreign-store.public.blob.vercel-storage.com/releases/'+ASSET_NAMES.android;assert.equal((await loadReleases({configuration:blob,fetcher:async()=>Response.json(data)})).targets.android,null);
 assert.equal(configuredSource({provider:'public-blob',blob:{manifestUrl:'https://evil.test/releases.json'}}),null);
});
test('Android updater endpoint uses compatible version-code schema and its fixed own-domain download alias',async()=>{
 const handler=createReleasesHandler({configuration,fetcher:fetcher()});
 for(const url of ['/updates.json','/releases?format=android']){
  const out=response();await handler({method:'GET',url},out);assert.equal(out.statusCode,200);const row=JSON.parse(out.body);assert.equal(row.versionCode,28);assert.equal(row.versionName,'3.9.3');assert.equal(row.sha256,hash);assert.equal(row.downloadUrl,'https://www.abbeedo.com/downloads/android.apk');
 }
 const invalid=response();await handler({method:'GET',url:'/releases?format=android&format=web'},invalid);assert.equal(invalid.statusCode,400);
 const unknown=response();await handler({method:'GET',url:'/releases?format=https://evil.test'},unknown);assert.equal(unknown.statusCode,400);
});
test('Android updater does not announce a download when only Windows is available',async()=>{
 const data=manifest();data.android.sha256='broken';const out=response();await createReleasesHandler({configuration,fetcher:fetcher(data)})({method:'GET',url:'/updates.json'},out);assert.equal(out.statusCode,503);assert.equal(JSON.parse(out.body).code,'DOWNLOAD_UNAVAILABLE');
});
