import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {routeAPI,trustedRequest} from './lib/api-router.mjs';
import {runtimeEnvironment,unavailable} from './lib/runtime.mjs';

export function nodeRequest(request,{signal,production=process.env.VERCEL==='1'}={}){
  const headers=new Headers();for(const [name,value]of Object.entries(request.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
  const host=headers.get('host');if(!host||!/^[a-z0-9.\-]+(?::\d+)?$/i.test(host))throw Error('Invalid request host');
  const protocol=production?'https':request.socket?.encrypted?'https':'http';
  const url=new URL(request.url,protocol+'://'+host);if(url.host!==host)throw Error('Invalid request target');
  const method=request.method||'GET';return new Request(url,{method,headers,signal,...(!['GET','HEAD'].includes(method)?{body:Readable.toWeb(request),duplex:'half'}:{})});
}
export async function writeResponse(response,outgoing,{method='GET'}={}){
  outgoing.statusCode=response.status;
  for(const [name,value]of response.headers)if(name!=='set-cookie')outgoing.setHeader(name,value);
  const cookies=response.headers.getSetCookie?.()||[];if(cookies.length)outgoing.setHeader('Set-Cookie',cookies);
  if(method==='HEAD'||!response.body){await response.body?.cancel();outgoing.end();return;}
  // flushHeaders and pipeline preserve streaming/backpressure; do not buffer
  // video or NDJSON into response.send/json (the buffered 4.5 MB limit).
  outgoing.flushHeaders?.();await pipeline(Readable.fromWeb(response.body),outgoing);
}
export function createHandler({environment=runtimeEnvironment,router=routeAPI}={}){
  return async function handler(incoming,outgoing){
    const controller=new AbortController(),abort=()=>{if(!outgoing.writableEnded)controller.abort();};incoming.once('aborted',abort);outgoing.once('close',abort);
    try{
      const request=nodeRequest(incoming,{signal:controller.signal}),forwarded=process.env.VERCEL==='1'?request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for'):incoming.socket?.remoteAddress;
      const ip=forwarded?.split(',')[0]?.trim();let response;
      try{response=await router(trustedRequest(request,{ip}),await environment());}catch{response=unavailable();}
      await writeResponse(response,outgoing,{method:request.method});
    }catch{if(!outgoing.headersSent){outgoing.statusCode=400;outgoing.setHeader('Cache-Control','no-store');outgoing.end('Invalid request');}else outgoing.destroy();}
    finally{incoming.off('aborted',abort);outgoing.off('close',abort);}
  };
}
export default createHandler();
