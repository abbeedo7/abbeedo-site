import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {zipStored,PACKAGE_IDS,TV_HOST} from '../scripts/build-tv.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const report=JSON.parse(await fs.readFile(path.join(root,'tv/dist/package-report.json'),'utf8'));
function crc32(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=value>>>1^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
function unzip(bytes){
 const entries=new Map();let offset=0;
 while(bytes.readUInt32LE(offset)===0x04034b50){
  assert.equal(bytes.readUInt16LE(offset+8),0,'TV packages use standard stored ZIP entries');
  const length=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+nameLength).toString(),start=offset+30+nameLength+extra,data=bytes.subarray(start,start+length);
  assert.equal(crc32(data),bytes.readUInt32LE(offset+14),'CRC: '+name);assert.ok(!entries.has(name),'No duplicated package path');assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'),'Safe package path');entries.set(name,data);offset=start+length;
 }
 assert.equal(bytes.readUInt32LE(offset),0x02014b50,'ZIP central directory exists');assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50,'ZIP terminator exists');assert.equal(bytes.readUInt16LE(bytes.length-12),entries.size);return entries;
}
function arEntries(bytes){assert.equal(bytes.subarray(0,8).toString(),'!<arch>\n');const result=new Map();for(let offset=8;offset<bytes.length;){const name=bytes.subarray(offset,offset+16).toString().trim().replace(/\/$/,''),size=Number(bytes.subarray(offset+48,offset+58).toString().trim());assert.equal(bytes.subarray(offset+58,offset+60).toString(),'`\n');result.set(name,bytes.subarray(offset+60,offset+60+size));offset+=60+size+(size%2);}return result;}
function tarEntries(bytes){const result=new Map();for(let offset=0;offset+512<=bytes.length;){const header=bytes.subarray(offset,offset+512);if(header.every(value=>value===0))break;const name=header.subarray(0,100).toString().split('\0')[0],size=parseInt(header.subarray(124,136).toString().replace(/\0/g,'').trim()||'0',8);result.set(name.replace(/^\.\//,''),bytes.subarray(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;}return result;}
const samsungArtifact=report.artifacts.find(value=>value.platform==='Samsung Tizen');
const samsung=unzip(await fs.readFile(path.join(root,samsungArtifact.file)));

test('built TV downloads match their recorded SHA-256 and actual byte counts',async()=>{
 for(const artifact of report.artifacts){const bytes=await fs.readFile(path.join(root,artifact.file));assert.equal(bytes.length,artifact.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);assert.equal(artifact.storeUploadReady,false);}
 assert.equal(report.physicalTVTested,false);assert.equal(report.samsungCertificateAvailable,false);
});

test('Samsung WGT contains a local runnable frontend and no invented signing identity',()=>{
 const config=samsung.get('config.xml').toString(),html=samsung.get('index.html').toString(),bundle=samsung.get('tv-app.js').toString();
 assert.match(config,/id="AbbeedoTV1\.tv" package="AbbeedoTV1"/);assert.match(config,/<content src="index\.html"\/>/);assert.match(config,/<tizen:profile name="tv-samsung"\/>/);
 assert.match(html,/<script src="tv-config\.js"><\/script>/);assert.match(html,/<script src="tv-app\.js" defer><\/script>/);assert.ok(html.indexOf('tv-config.js')<html.indexOf('tv-app.js'));
 assert.doesNotMatch(html,/<script[^>]+src="https?:/);assert.doesNotMatch(html,/type="module"|<iframe/);assert.doesNotMatch(bundle,/import\.meta/);assert.match(bundle,/installPackagedTVNetwork\(globalThis\)/);
 assert.ok(samsung.has('brand.png')&&samsung.has('abbeedo.otf')&&samsung.has('hls.min.js')&&samsung.has('mpegts.min.js'),'Own branding, font and playback dependencies are included');
 assert.ok(![...samsung.keys()].some(name=>/^(?:author-signature|signature\d*)\.xml$/i.test(name)));assert.equal(samsungArtifact.signed,false);assert.equal(samsungArtifact.packagedFrontend,true);assert.equal(samsungArtifact.hostedApprovalRequired,false);
});

test('all local Samsung entry resources exist inside the WGT',()=>{
 const html=samsung.get('index.html').toString();
 for(const [,raw]of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(/^(?:https?:|tel:|mailto:)/.test(raw)||raw==='./'||raw.startsWith('./downloads/'))continue;
  const resource=raw.split(/[?#]/)[0].replace(/^\.\//,'');assert.ok(samsung.has(resource),'Missing local HTML resource '+raw);
 }
 for(const [name,data]of samsung)if(name.endsWith('.css'))for(const [,raw]of data.toString().matchAll(/url\(\s*['"]?([^\s'")]+)['"]?\s*\)/g)){
  if(/^(?:https?:|data:|blob:|#)/.test(raw))continue;
  assert.ok(samsung.has(path.posix.normalize(path.posix.join(path.posix.dirname(name),raw.split(/[?#]/)[0]))),'Missing CSS resource '+name+': '+raw);
 }
});

test('packaged configuration requires the real native Samsung ID',()=>{
 const code=samsung.get('tv-config.js').toString();
 for(const id of [null,'AnotherApp.tv',PACKAGE_IDS.samsung]){
  const scope={AbortController,setTimeout};scope.window=scope;if(id)scope.tizen={application:{getCurrentApplication:()=>({appInfo:{id}})}};vm.runInNewContext(code,scope);
  assert.equal(scope.ABUNASSER_CONFIG?.apiOrigin,id===PACKAGE_IDS.samsung?TV_HOST:undefined);
  if(id===PACKAGE_IDS.samsung){assert.equal(scope.ABUNASSER_CONFIG.tvPackaged,true);assert.equal(scope.ABUNASSER_CONFIG.tvVersion,report.version);}
 }
});

test('Chromium 94 encrypted-memory fallback preserves binary records without structuredClone',async()=>{
 const old=globalThis.structuredClone;try{globalThis.structuredClone=undefined;const {Vault}=await import('../tv/samsung/app/storage.js');const vault=new Vault({name:'tv-test-'+Date.now(),namespace:'encrypted',memory:true});await vault.set('account',{name:'اختبار',values:[1,2,3]});assert.deepEqual(await vault.get('account'),{name:'اختبار',values:[1,2,3]});assert.deepEqual(await vault.list(),['account']);}finally{globalThis.structuredClone=old;}
});

test('LG IPK is a real archive with official webOS metadata and hosted loader',async()=>{
 const artifact=report.artifacts.find(value=>value.platform==='LG webOS');assert.ok(artifact,'LG official package was built');const entries=arEntries(await fs.readFile(path.join(root,artifact.file)));
 assert.equal(entries.get('debian-binary').toString(),'2.0\n');assert.ok(entries.has('control.tar.gz')&&entries.has('data.tar.gz'));
 const data=tarEntries(gunzipSync(entries.get('data.tar.gz'))),prefix='usr/palm/applications/'+PACKAGE_IDS.lg+'/',info=JSON.parse(data.get(prefix+'appinfo.json'));
 assert.equal(info.id,PACKAGE_IDS.lg);assert.equal(info.main,'index.html');assert.equal(info.version,report.version);assert.equal(info.resolution,'1920x1080');assert.ok(data.has(prefix+info.icon)&&data.has(prefix+info.largeIcon));
 assert.match(data.get(prefix+'loader.js').toString(),/https:\/\/www\.abbeedo\.com\/app\?tv=webos/);assert.doesNotMatch(data.get(prefix+'index.html').toString(),/<iframe/);
});

test('LG hosted loader reports offline state and retries with remote OK or network recovery',async()=>{
 const handlers={},status={},retry={focus(){this.focused=true;},addEventListener(type,handler){handlers['button:'+type]=handler;}},urls=[];
 const scope={navigator:{language:'ar',onLine:false},location:{replace(url){urls.push(url);}},document:{getElementById:id=>id==='status'?status:retry,addEventListener(type,handler){handlers['document:'+type]=handler;}},window:{addEventListener(type,handler){handlers['window:'+type]=handler;}}};
 vm.runInNewContext(await fs.readFile(path.join(root,'tv/webos/loader.js'),'utf8'),scope);assert.equal(urls.length,0);assert.equal(retry.focused,true);assert.match(status.textContent,/الإنترنت/);
 scope.navigator.onLine=true;handlers['document:keydown']({keyCode:13});assert.deepEqual(urls,[TV_HOST+'/app?tv=webos']);handlers['window:online']();assert.equal(urls.length,2);
});

test('ZIP builder preserves Unicode entries and detects data corruption',()=>{
 const archive=zipStored([{name:'اسم/ملف.txt',data:Buffer.from('ابوناصر TV')}]);assert.equal(unzip(archive).get('اسم/ملف.txt').toString(),'ابوناصر TV');const altered=Buffer.from(archive);altered[30+Buffer.byteLength('اسم/ملف.txt')]^=1;assert.throws(()=>unzip(altered),/CRC/);
});
