import test from 'node:test';
import assert from 'node:assert/strict';
import {handleClient,handleClientMedia} from '../application/worker/client-api.mjs';

const origin='https://www.abbeedo.com';
const account={mode:'xtream',server:'https://provider.example',username:'fixture-user',password:'fixture-secret'};
const message='حماية مصدر الاشتراك منعت الاتصال قبل إتمام تسجيل الدخول (HTTP 403). تواصل مع مزود الاشتراك للسماح بالاتصال أو توفير رابط HTTPS متوافق.';
const privateBody='https://provider.example/?username=fixture-user&password=fixture-secret upstream detail';
const clientRequest=input=>new Request(origin+'/api/client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
function fixture(status,headers){return {CLIENT_ALLOWED_HOSTS:'provider.example',CLIENT_SECRET:'c'.repeat(64),CLIENT_FETCH:async()=>new Response(privateBody,{status,headers})};}
async function assertSafe(response,{status=502,code='UPSTREAM_BLOCKED',httpStatus=403}={}){
 assert.equal(response.status,status);const body=await response.text(),data=JSON.parse(body);
 assert.equal(data.code,code);assert.equal(data.httpStatus,httpStatus);
 if(code==='UPSTREAM_BLOCKED')assert.equal(data.error,message);
 for(const secret of ['provider.example','fixture-user','fixture-secret','upstream detail'])assert.equal(body.includes(secret),false,secret);
 assert.match(response.headers.get('cache-control'),/no-store/);
}

test('source policy rejection requires Cloudflare HTTP403 plus HTML or an explicit mitigation header',async()=>{
 for(const headers of [
  {server:'cloudflare','content-type':'text/html; charset=UTF-8'},
  {server:'CloudFlare','content-type':'application/xhtml+xml'},
  {server:'cloudflare','content-type':'text/plain','cf-mitigated':'challenge'},
 ])await assertSafe(await handleClient(clientRequest({op:'auth',account}),fixture(403,headers)));
});

test('ordinary unauthorized and JSON forbidden responses retain the generic upstream error',async()=>{
 for(const [status,headers] of [
  [401,{server:'cloudflare','content-type':'text/html'}],
  [403,{server:'cloudflare','content-type':'application/json'}],
  [403,{server:'nginx','content-type':'text/html'}],
  [403,{'content-type':'text/html'}],
  [403,{server:'cloudflare','content-type':'text/plain','cf-mitigated':''}],
 ])await assertSafe(await handleClient(clientRequest({op:'auth',account}),fixture(status,headers)),{code:'UPSTREAM_HTTP',httpStatus:status});
});

test('streaming provider catalogues report a blocked source before opening NDJSON',async()=>{
 const env=fixture(403,{server:'cloudflare','content-type':'text/html'});
 const response=await handleClient(clientRequest({op:'catalog',kind:'live',account}),env);
 assert.match(response.headers.get('content-type'),/application\/json/);
 await assertSafe(response);
});

test('media uses the same source policy classification and preserves ordinary HTTP errors',async()=>{
 for(const [upstreamStatus,headers,status,code] of [
  [403,{server:'cloudflare','content-type':'text/html'},502,'UPSTREAM_BLOCKED'],
  [403,{server:'cloudflare','content-type':'application/json'},403,'MEDIA_HTTP'],
  [401,{server:'cloudflare','content-type':'text/html'},401,'MEDIA_HTTP'],
 ]){
  const env=fixture(upstreamStatus,headers);
  const resolution=await handleClient(clientRequest({op:'resolve',account,kind:'movie',id:'7'}),env);
  assert.equal(resolution.status,200);const data=await resolution.json();
  await assertSafe(await handleClientMedia(new Request(data.url),env),{status,code,httpStatus:upstreamStatus});
 }
});

test('provider account rejection remains an authentication error',async()=>{
 const env={CLIENT_ALLOWED_HOSTS:'provider.example',CLIENT_FETCH:async()=>Response.json({user_info:{auth:0,status:'Disabled'}})};
 const response=await handleClient(clientRequest({op:'auth',account}),env);
 assert.equal(response.status,401);assert.equal((await response.json()).code,'AUTH');
});
