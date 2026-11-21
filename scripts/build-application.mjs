import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

async function files(directory){const list=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())list.push(...await files(file));else if(entry.isFile())list.push(file);}return list.sort();}
export function versionModuleImports(source,revision){
 const stamp=value=>{if(!/^(?:\.\.?\/|\/(?!\/))/.test(value))return value;const url=new URL(value,'https://build.invalid/');if(!/\.(?:m?js)$/.test(url.pathname))return value;url.searchParams.set('app-build',revision);return value.split(/[?#]/)[0]+url.search+url.hash;};
 return source.replace(/(\b(?:import|export)\s+(?:[\w*$,\s{}]+?\s+from\s*)?)(['"])([^'"\n]+)\2/g,(all,prefix,quote,value)=>prefix+quote+stamp(value)+quote).replace(/(\bimport\s*\(\s*)(['"])([^'"\n]+)\2/g,(all,prefix,quote,value)=>prefix+quote+stamp(value)+quote);
}
function versionHTMLAssets(html,revision){return html.replace(/((?:src|href)=["'])([^"']+)(["'])/g,(all,prefix,value,quote)=>{if(!value.startsWith('/')||value.startsWith('//'))return all;const url=new URL(value,'https://build.invalid');if(!/\.(?:m?js|css|webmanifest)$/.test(url.pathname))return all;url.searchParams.set('app-build',revision);return prefix+url.pathname+url.search+url.hash+quote;});}
export function applicationServiceWorker({cache,shell,offlineWorker=''}){
 return `const CACHE=${JSON.stringify(cache)},SHELL=${JSON.stringify(shell)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('abunasser-apple-web-1-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
const ownedFallback=request=>caches.match(request,{cacheName:CACHE}).then(cached=>cached||caches.match(request,{cacheName:CACHE,ignoreSearch:true}));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname==='/version.json'||request.headers.has('range'))return;
 if(request.mode==='navigate'){
  const app=['/app','/app/','/app.html','/open'].includes(url.pathname)||(url.pathname==='/'&&url.searchParams.get('source')==='installed');
  if(app)event.respondWith(fetch(request).catch(()=>caches.match('/app.html',{cacheName:CACHE})));
  return;
 }
 if(!SHELL.includes(url.pathname))return;
 if(/\\.(?:m?js|css|html|webmanifest)$/.test(url.pathname)){
  event.respondWith(fetch(request,{cache:'no-cache'}).then(response=>{
   if(response.status>=500)return ownedFallback(request).then(cached=>cached||response);
   if(response.ok){const saved=caches.open(CACHE).then(cache=>cache.put(request,response.clone())).catch(()=>{});event.waitUntil?.(saved);}
   return response;
  }).catch(()=>ownedFallback(request)));
 }else event.respondWith(caches.match(request,{cacheName:CACHE}).then(cached=>cached||fetch(request).catch(()=>ownedFallback(request))));
});
${offlineWorker}
`;
}
export async function buildApplication({projectRoot,outputRoot}){
 if(!projectRoot||!outputRoot)throw new Error('Explicit project and output paths are required');
 const source=path.join(projectRoot,'application'),frontend=path.join(source,'public'),staticDir=path.join(outputRoot,'static'),functionDir=path.join(outputRoot,'functions/api.func');
 const metadata=JSON.parse(await fs.readFile(path.join(source,'application.json'),'utf8'));
 await fs.mkdir(staticDir,{recursive:true});await fs.mkdir(functionDir,{recursive:true});
 const appFiles=await files(frontend),copied=[];
 for(const file of appFiles){
  const relative=path.relative(frontend,file);if(relative==='sw.js')continue;
  const destination=path.join(staticDir,relative==='index.html'?'app.html':relative);
  await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(file,destination);
  copied.push('/'+(relative==='index.html'?'app.html':relative).replaceAll(path.sep,'/'));
 }
 await build({entryPoints:[path.join(frontend,'app/appearance-bootstrap.js')],outfile:path.join(staticDir,'assets/appearance-bootstrap.js'),bundle:true,format:'iife',platform:'browser',target:'es2020',minify:true});
 copied.push('/assets/appearance-bootstrap.js');
 for(const filename of ['manifest.webmanifest','manifest.en.webmanifest']){
  const destination=path.join(staticDir,filename),manifest=JSON.parse(await fs.readFile(destination,'utf8'));
  manifest.id='/app';manifest.scope='/';manifest.start_url='/app?source=installed';
  await fs.writeFile(destination,JSON.stringify(manifest,null,2)+'\n');
 }
 const shell=copied.filter(file=>!file.includes('watch-demo')&&!['/sw.js','/version.json','/pair.html','/pair.js','/pair.css','/watch.html','/watch.js','/watch.css','/watch-media.js'].includes(file));
 const fingerprint=createHash('sha256');for(const file of shell){fingerprint.update(file);fingerprint.update(await fs.readFile(path.join(staticDir,file.slice(1))));}
 const revision=fingerprint.digest('hex').slice(0,16);
 for(const file of copied){
  const target=path.join(staticDir,file.slice(1));
  if(file.startsWith('/app/')&&/\.(?:m?js)$/.test(file))await fs.writeFile(target,versionModuleImports(await fs.readFile(target,'utf8'),revision));
  else if(file==='/app.html')await fs.writeFile(target,versionHTMLAssets(await fs.readFile(target,'utf8'),revision));
 }
 const cache='abunasser-apple-web-1-'+revision,offlineWorker=await fs.readFile(path.join(source,'scripts/offline-service-worker.js'),'utf8');
 await fs.writeFile(path.join(staticDir,'sw.js'),applicationServiceWorker({cache,shell,offlineWorker}));
 await build({entryPoints:[path.join(source,'vercel/handler.mjs')],outfile:path.join(functionDir,'index.mjs'),bundle:true,format:'esm',platform:'node',target:'node22',define:{__ABBEEDO_VERSION__:JSON.stringify(metadata.version)},banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"}});
 await fs.writeFile(path.join(functionDir,'.vc-config.json'),JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',maxDuration:300,supportsResponseStreaming:true},null,2)+'\n');
 return {staticDir,functionDir,appPath:'/app.html',cache,version:metadata.version,shell,revision};
}
