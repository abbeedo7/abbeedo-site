import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

export const TV_HOST='https://www.abbeedo.com';
export const PACKAGE_IDS=Object.freeze({lg:'com.abbeedo.tv.app',samsung:'AbbeedoTV1.tv'});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function files(directory){const list=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())list.push(...await files(file));else if(entry.isFile())list.push(file);}return list.sort();}
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function zipStored(entries){
 const pieces=[],central=[];let offset=0;
 for(const item of entries){const name=Buffer.from(item.name,'utf8'),data=Buffer.from(item.data),crc=crc32(data),header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(0,8);header.writeUInt16LE(0x5b6e,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);pieces.push(header,name,data);
  const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50,0);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(0,10);record.writeUInt16LE(0x5b6e,14);record.writeUInt32LE(crc,16);record.writeUInt32LE(data.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(0o100644<<16>>>0,38);record.writeUInt32LE(offset,42);central.push(record,name);offset+=header.length+name.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...pieces,directory,end]);
}
async function hash(file){return createHash('sha256').update(await fs.readFile(file)).digest('hex');}
export async function prepareSamsung({projectRoot=root}={}){
 const publicDir=path.join(projectRoot,'application/public'),source=path.join(projectRoot,'tv/samsung'),metadata=JSON.parse(await fs.readFile(path.join(projectRoot,'tv/package.json'),'utf8'));
 await fs.access(path.join(publicDir,'app/tv-network.js'));
 // A rebuilt package must not keep removed frontend modules from an older release.
 for(const file of await files(source))if(!['config.xml','icon.png','store-icon.png'].includes(path.relative(source,file)))await fs.rm(file);
 const included=[];
 for(const file of await files(publicDir)){
  const relative=path.relative(publicDir,file).replaceAll(path.sep,'/');
  if(['index.html','sw.js','manifest.webmanifest','manifest.en.webmanifest'].includes(relative)||relative.startsWith('watch-demo')||['watch.html','watch.js','watch.css','watch-media.js','pair.html','pair.js','pair.css','privacy.html'].includes(relative))continue;
  const destination=path.join(source,relative);await fs.mkdir(path.dirname(destination),{recursive:true});
  if(/\.(?:js|css)$/.test(relative)){
   let text=await fs.readFile(file,'utf8');
   if(relative.endsWith('.css'))text=text.replaceAll('dvh','vh').replaceAll('dvw','vw').replace(/url\((['"]?)\//g,'url($1./');
   if(relative.endsWith('.js'))text=text.replaceAll("'/brand.png'","'brand.png'").replaceAll('"/brand.png"','"brand.png"').replaceAll("'/app-icon.png'","'app-icon.png'").replaceAll('"/app-icon.png"','"app-icon.png"').replaceAll("'/jsqr.js'","'jsqr.js'");
   if(relative==='app/preferences.js')text=text.replaceAll('new URL(import.meta.url)','new URL(document.baseURI)');
   if(relative==='app/player.js')text=text.replace("new URL('../hls.min.js', import.meta.url)","new URL('hls.min.js', document.baseURI)").replace("new URL('../mpegts.min.js', import.meta.url)","new URL('mpegts.min.js', document.baseURI)");
   // Chromium 94 predates structuredClone. Only encrypted storage records use
   // this fallback, whose binary fields must remain binary rather than JSON.
   if(relative==='app/storage.js')text=text.replaceAll('structuredClone(','copyTVRecord(')+"\nfunction copyTVRecord(record){return {...record,...(record.iv?{iv:record.iv.slice()}:{}),...(record.ciphertext?{ciphertext:record.ciphertext.slice(0)}:{})};}\n";
   await fs.writeFile(destination,text);
  }else await fs.copyFile(file,destination);
  included.push(relative);
 }
 const compat="(function(){if(typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout!=='function'){AbortSignal.timeout=function(ms){var c=new AbortController();setTimeout(function(){c.abort();},Math.max(0,Math.min(Number(ms)||0,2147483647)));return c.signal;};}}());\n";
 const config="(function(){var a;try{a=window.tizen.application.getCurrentApplication();}catch(e){}var id=a&&(a.appInfo&&a.appInfo.id||a.id);if(id!=='AbbeedoTV1.tv')return;window.ABUNASSER_CONFIG=Object.assign({},window.ABUNASSER_CONFIG||{},{apiOrigin:'https://www.abbeedo.com',tvPackaged:true,tvPlatform:'tizen',tvVersion:"+JSON.stringify(metadata.version)+"});}());\n";
 await fs.writeFile(path.join(source,'tv-config.js'),compat+config);
 const original=await fs.readFile(path.join(source,'app/entry.js'),'utf8'),imports=original.match(/^import[^;\n]+;$/gm)||[],body=original.replace(/^import[^;\n]+;$/gm,'');
 const wrapped=imports.join('\n')+"\nimport {installPackagedTVNetwork} from './tv-network.js';\n(async function(){const tv=installPackagedTVNetwork(globalThis);if(!tv.installed)throw Error('Native Samsung TV application context is required.');\n"+body+"\n})().catch(function(error){console.error('TV startup failed');var e=document.getElementById('install-heading');if(e)e.textContent='تعذر فتح التطبيق · Could not open the app';});\n";
 const entry=path.join(source,'app/tv-entry.mjs');await fs.writeFile(entry,wrapped);
 await fs.mkdir(path.join(source,'assets'),{recursive:true});
 await build({entryPoints:[path.join(publicDir,'app/appearance-bootstrap.js')],outfile:path.join(source,'assets/appearance-bootstrap.js'),bundle:true,format:'iife',platform:'browser',target:'chrome94',minify:true});
 await build({entryPoints:[entry],outfile:path.join(source,'tv-app.js'),bundle:true,format:'iife',platform:'browser',target:'chrome94',minify:false,legalComments:'inline'});
 let html=await fs.readFile(path.join(publicDir,'index.html'),'utf8');
 html=html.replace(/<link\b[^>]*rel="manifest"[^>]*>/g,'').replace(/<script\b[^>]*type="module"[^>]*src="\/app\/entry\.js[^"]*"[^>]*><\/script>/,'<script src="tv-app.js" defer></script>');
 html=html.replace(/((?:href|src)=["'])\//g,'$1./').replace('width=device-width,initial-scale=1,viewport-fit=cover','width=1920,initial-scale=1');
 html=html.replace('</head>','<script src="tv-config.js"></script><link rel="stylesheet" href="tv-overrides.css"></head>');
 await fs.writeFile(path.join(source,'index.html'),html);
 const desktop=await fs.readFile(path.join(publicDir,'desktop.css'),'utf8');
 const fallback="\n/* Chromium 94 TV engines need fixed fallbacks for color-mix and dynamic viewport units. */\nhtml,body{height:100%;width:100%;overscroll-behavior:none}body{background-image:none}.browser-only,[data-browser-only]{display:none!important}#visual-backdrop{background:var(--bg,#0a1018)}#visual-backdrop .motion-grid-x{background-image:linear-gradient(90deg,rgba(245,246,248,.15) .7px,transparent .7px)}#visual-backdrop .motion-grid-y{background-image:linear-gradient(rgba(245,246,248,.15) .7px,transparent .7px)}#visual-backdrop .motion-glow{background:radial-gradient(ellipse at 72% 22%,rgba(255,36,45,.27),transparent 65%),radial-gradient(ellipse at 10% 90%,rgba(16,73,49,.4),transparent 62%)}button:focus,a:focus,input:focus,select:focus{outline:4px solid var(--accent-readable,var(--accent));outline-offset:4px}#video{background:#000}.app-shell{min-height:100vh}\n";
 await fs.writeFile(path.join(source,'tv-overrides.css'),desktop.replaceAll(' and (pointer:fine)','').replaceAll('dvh','vh').replaceAll('dvw','vw')+fallback);
 return {source,version:metadata.version,files:included,packagedFrontend:true,hostedApprovalRequired:false};
}
export async function buildTV({projectRoot=root,cli=process.env.WEBOS_CLI,skipLG=false}={}){
 const source=path.join(projectRoot,'tv'),out=path.join(source,'dist'),metadata=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8'));
 await fs.mkdir(out,{recursive:true});
 const prepared=await prepareSamsung({projectRoot}),samsung=prepared.source,entries=[];
 for(const file of await files(samsung))entries.push({name:path.relative(samsung,file).replaceAll(path.sep,'/'),data:await fs.readFile(file)});
 const wgt=path.join(out,'abbeedo-TV-Samsung-UNSIGNED-'+metadata.version+'.wgt');await fs.writeFile(wgt,zipStored(entries));
 const artifacts=[{platform:'Samsung Tizen',file:path.relative(projectRoot,wgt),bytes:(await fs.stat(wgt)).size,sha256:await hash(wgt),signed:false,packagedFrontend:true,hostedApprovalRequired:false,storeUploadReady:false,requires:['Samsung author and distributor certificate','Physical-TV QA and Samsung TV Seller Office review']}];
 if(!skipLG){
  const executable=cli||path.join(source,'tooling/node_modules/.bin/ares-package');
  try{await fs.access(executable);}catch{throw Error('Official LG CLI required. Run npm ci --prefix tv/tooling, or set WEBOS_CLI to ares-package.');}
  const checked=spawnSync(executable,['--check',path.join(source,'webos')],{cwd:projectRoot,encoding:'utf8'});
  if(checked.status!==0)throw Error('LG metadata validation failed: '+(checked.stderr||checked.stdout).slice(0,1200));
  const packaged=spawnSync(executable,['--outdir',out,path.join(source,'webos')],{cwd:projectRoot,encoding:'utf8'});
  if(packaged.status!==0)throw Error('LG packaging failed: '+(packaged.stderr||packaged.stdout).slice(0,1200));
  const ipk=path.join(out,PACKAGE_IDS.lg+'_'+metadata.version+'_all.ipk');
  await fs.access(ipk);
  artifacts.unshift({platform:'LG webOS',file:path.relative(projectRoot,ipk),bytes:(await fs.stat(ipk)).size,sha256:await hash(ipk),packagedBy:'@webos-tools/cli@3.2.6',metadataValidated:true,storeUploadReady:false,requires:['LG Seller Lounge application registration and review','Physical-TV QA']});
 }
 const report={built:true,version:metadata.version,hosting:{lg:'Official hosted webOS app at '+TV_HOST+'/app',samsung:'Local packaged shared frontend with a narrow cookie-free TV API gateway'},minimumSharedWebEngine:'Chromium94-class, generally 2023 TV models or newer',physicalTVTested:false,samsungCertificateAvailable:false,artifacts};
 await fs.writeFile(path.join(out,'package-report.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildTV({skipLG:process.argv.includes('--skip-lg')})));
