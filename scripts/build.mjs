import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {icon,ICON_NAMES} from '../src/icons.mjs';
import {buildApplication} from './build-application.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'.vercel/output'),staticDir=path.join(out,'static');
const config=JSON.parse(await fs.readFile(path.join(root,'site-config.json'),'utf8'));
if(config.domain!=='https://abbeedo.com'||!/^0\d{9}$/.test(config.phone)||config.whatsapp!=='https://wa.me/966571514382')throw Error('Invalid public site configuration');
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
async function files(directory){const result=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await files(file));else if(entry.isFile())result.push(file);}return result.sort();}
const hash=createHash('sha256');
for(const directory of ['src','public','api','application'])for(const file of await files(path.join(root,directory))){if(file.includes('/tests/'))continue;hash.update(path.relative(root,file));hash.update(await fs.readFile(file));}
hash.update(JSON.stringify(config));const revision='web-'+hash.digest('hex').slice(0,16);
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(staticDir,{recursive:true});
const application=await buildApplication({projectRoot:root,outputRoot:out});
await fs.cp(path.join(root,'public'),staticDir,{recursive:true});
const glyphs={
 devices:'<rect x="4" y="8" width="30" height="22" rx="3"/><path d="M12 38h14M19 30v8"/><rect x="31" y="20" width="13" height="23" rx="3"/><path d="M36 38h3"/>',
 display:'<rect x="4" y="6" width="40" height="28" rx="4"/><path d="M24 34v8M15 42h18"/>',
 menu:'<path d="M8 12h32M8 24h32M8 36h32"/>',
 speed:'<path d="M8 35a20 20 0 1 1 32 0M11 13l4 4M24 7v6M37 13l-4 4M8 25h6M34 25h6M24 29l10-12"/><circle cx="24" cy="29" r="3"/>'
};
function artwork(name){if(glyphs[name])return '<svg class="app-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+glyphs[name]+'</svg>';if(!ICON_NAMES.includes(name))throw Error('Missing icon: '+name);return icon(name);}
const layout=await fs.readFile(path.join(root,'src/layout.html'),'utf8');
for(const [name,target,title,page] of [['index.html','index.html','ابوناصر · اشتراكات وتطبيقات','home'],['apps.html','apps/index.html','التطبيقات والتحميل · ابوناصر','apps']]){
 const body=await fs.readFile(path.join(root,'src',name),'utf8');
 let text=layout.replace('{{BODY}}',body);
 const replacements={TITLE:title,PAGE:page,CANONICAL:config.domain+(page==='apps'?'/apps':'/'),DOMAIN:config.domain,HASH:revision,PHONE:config.phone,WHATSAPP:config.whatsapp,PRICE:config.yearly_price_sar,SUBSCRIBE_URL:config.whatsapp+'?text='+encodeURIComponent('أرغب بالاشتراك في ابوناصر TV')};
 for(const [key,value]of Object.entries(replacements))text=text.replaceAll('{{'+key+'}}',escape(value));
 text=text.replace(/\{\{ICON:([a-z_]+)\}\}/g,(_,key)=>artwork(key));
 if(/\{\{[A-Z]/.test(text))throw Error('Unresolved page template');
 const destination=path.join(staticDir,target);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,text);
}
await fs.writeFile(path.join(staticDir,'site-version.json'),JSON.stringify({name:config.site_name_ar||config.name_ar,name_en:config.site_name_en||config.name_en,version:config.website_version,revision,builtAt:new Date().toISOString()})+'\n');
await fs.writeFile(path.join(staticDir,'robots.txt'),'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: '+config.domain+'/sitemap.xml\n');
await fs.writeFile(path.join(staticDir,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+config.domain+'/</loc></url><url><loc>'+config.domain+'/apps</loc></url></urlset>');
await fs.writeFile(path.join(staticDir,'404.html'),'<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ابوناصر</title><style>body{background:#0a1018;color:#fff;font:22px sans-serif;text-align:center;padding:15vh 20px}a{color:#ff5260}</style><h1>الصفحة غير موجودة</h1><p>Page not found</p><a href="/">العودة للموقع · Home</a></html>');
for(const entry of ['releases','download']){
 const fn=path.join(out,'functions',entry+'.func');await fs.mkdir(fn,{recursive:true});
 await build({entryPoints:[path.join(root,'api',entry+'.mjs')],outfile:path.join(fn,'index.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',minify:false});
 await fs.writeFile(path.join(fn,'.vc-config.json'),JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',maxDuration:30,supportsResponseStreaming:true}));
}
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self' https: abbeedo-media:; media-src 'self' https: blob: abbeedo-media:; worker-src 'self' blob:; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const noCache={'Cache-Control':'no-store, max-age=0','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store'};
const routes=[
 {src:'/(.*)',headers:{'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':csp},continue:true},
 {src:'^/api/releases$',dest:'/releases'},
 {src:'^/api/download$',dest:'/download'},
 {src:'^/updates\\.json$',headers:noCache,dest:'/releases?format=android'},
 {src:'^/version\\.json$',headers:{...noCache,'Access-Control-Allow-Origin':'*'},continue:true},
 {src:'^/watch-demo(?:[0-9]+)?\\.(?:mp4|m3u8|ts|m4s)$',headers:{'Access-Control-Allow-Origin':'*'},continue:true},
 {src:'^/downloads/android\\.apk$',dest:'/download?file=android'},
 {src:'^/downloads/windows\\.exe$',dest:'/download?file=windows'},
 {src:'^/downloads/windows-portable\\.exe$',dest:'/download?file=portable'},
 {src:'^/open$',status:307,headers:{Location:'/app',...noCache}},
 {src:'^/app/?$',headers:{'Cache-Control':'no-cache, max-age=0, must-revalidate'},dest:'/app.html'},
 {src:'^/$',has:[{type:'query',key:'source',value:'installed'}],headers:{'Cache-Control':'no-cache, max-age=0, must-revalidate'},dest:'/app.html'},
 {src:'^/api(?:/.*)?$',headers:noCache,dest:'/api'},
 {src:'^/(?:site-version\\.json|sw\\.js|manifest(?:\\.en)?\\.webmanifest|version\\.json)$',headers:{...noCache,'Service-Worker-Allowed':'/'},continue:true},
 {src:'/assets/(.*)',headers:{'Cache-Control':'public, max-age=0, must-revalidate'},continue:true},
 {src:'^/(?:index\\.html|app\\.html|apps(?:/index\\.html)?)?$',headers:{'Cache-Control':'no-cache, max-age=0, must-revalidate'},continue:true},
 {src:'^/(?:watch|pair)\\.html$',headers:noCache,continue:true},
 {src:'^/apps/?$',dest:'/apps/index.html'},
 {handle:'filesystem'},
 {src:'/(.*)',status:404,dest:'/404.html'}
];
await fs.writeFile(path.join(out,'config.json'),JSON.stringify({version:3,routes},null,2)+'\n');
console.log(JSON.stringify({built:true,name:config.site_name_ar||config.name_ar,version:config.website_version,revision,application:application.version,output:'.vercel/output',domain:config.domain}));
