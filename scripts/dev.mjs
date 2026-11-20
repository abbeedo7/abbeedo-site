import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import releases from '../api/releases.mjs';
import download from '../api/download.mjs';
const root=path.resolve(import.meta.dirname,'../.vercel/output/static');
await fs.access(path.join(root,'index.html'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.otf':'font/otf','.json':'application/json','.webmanifest':'application/manifest+json','.mp4':'video/mp4','.ts':'video/mp2t','.m3u8':'application/vnd.apple.mpegurl','.txt':'text/plain','.xml':'application/xml'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if((url.pathname==='/api/releases'||url.pathname==='/updates.json'))return releases(req,res);
  if(url.pathname==='/api/download'||url.pathname.startsWith('/downloads/'))return download(req,res);
  if(url.pathname==='/api/announcements'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end('{"messages":[]}');return;}
  if(url.pathname.startsWith('/api/')){res.statusCode=503;res.setHeader('Content-Type','application/json');res.end('{"code":"LOCAL_PREVIEW","error":"Local preview only; use Vercel private storage for application APIs."}');return;}
  if(url.pathname==='/open'){res.writeHead(307,{Location:'/app'});res.end();return;}
  const name=['/app','/app/'].includes(url.pathname)||url.pathname==='/'&&url.searchParams.get('source')==='installed'?'/app.html':url.pathname==='/'?'/index.html':['/apps','/apps/'].includes(url.pathname)?'/apps/index.html':url.pathname;
  let decoded;try{decoded=decodeURIComponent(name);}catch{res.statusCode=400;res.end();return;}
  const file=path.resolve(root,'.'+decoded);if(!file.startsWith(root+path.sep)){res.statusCode=404;res.end();return;}
  let bytes;try{bytes=await fs.readFile(file);}catch{res.statusCode=404;res.end('Not found');return;}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');
  if(name==='/sw.js')res.setHeader('Service-Worker-Allowed','/');
  const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  if(range){const start=Number(range[1]),end=Math.min(bytes.length-1,range[2]?Number(range[2]):bytes.length-1);if(start>=bytes.length||end<start){res.writeHead(416,{'Content-Range':'bytes */'+bytes.length});res.end();return;}res.statusCode=206;res.setHeader('Content-Range','bytes '+start+'-'+end+'/'+bytes.length);bytes=bytes.subarray(start,end+1);}
  res.setHeader('Content-Length',String(bytes.length));res.end(req.method==='HEAD'?undefined:bytes);
 }catch{if(!res.headersSent){res.statusCode=500;res.end('Preview error');}else res.destroy();}
});
server.listen(Number(process.env.PORT||9020),'0.0.0.0',()=>console.log('Local URL: http://127.0.0.1:'+(process.env.PORT||9020)+' (preview; no customer account data)'));
