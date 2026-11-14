// Private Vercel Blob implementation of the R2 subset used by session APIs.
// Keys never become public routes. Every read bypasses the Blob CDN cache.
import {Buffer} from 'node:buffer';

const NAMESPACE='abbeedo-runtime-v1/';
const MAX_RECORD=1024*1024;
const httpNames={contentType:'Content-Type',contentLanguage:'Content-Language',contentDisposition:'Content-Disposition',contentEncoding:'Content-Encoding',cacheControl:'Cache-Control'};
function keyPath(key){if(typeof key!=='string'||!key||key.length>900||/[\x00-\x1f\x7f?#\\]/.test(key)||key.startsWith('/')||key.split('/').some(part=>part==='.'||part==='..'))throw Error('Invalid private storage key');return NAMESPACE+key;}
async function bytes(value){if(typeof value==='string')return Buffer.from(value);if(value instanceof ArrayBuffer)return Buffer.from(value);if(ArrayBuffer.isView(value))return Buffer.from(value.buffer,value.byteOffset,value.byteLength);return Buffer.from(await new Response(value).arrayBuffer());}
function unpack(raw){let record;try{record=JSON.parse(raw);}catch{throw Error('Invalid private storage record');}if(record?.version!==1||typeof record.body!=='string'||record.body.length>MAX_RECORD*1.4||!Number.isSafeInteger(record.size)||record.size<0||record.size>MAX_RECORD||typeof record.uploaded!=='string'||!record.httpMetadata||typeof record.httpMetadata!=='object'||record.expiration!==null&&(!Number.isSafeInteger(record.expiration)||record.expiration<0))throw Error('Invalid private storage record');const body=Buffer.from(record.body,'base64');if(body.length!==record.size||body.toString('base64')!==record.body)throw Error('Invalid private storage record');return {...record,body};}
function expirationFor(body,options){if(options.expiration!==undefined){if(!Number.isSafeInteger(options.expiration)||options.expiration<0)throw Error('Invalid storage expiration');return options.expiration;}try{if(/json/i.test(options.httpMetadata?.contentType||'')){const value=JSON.parse(body.toString());const expires=value.expiresAt??value.until;if(Number.isSafeInteger(expires)&&expires>0)return Math.ceil(expires/1000);}}catch{}return null;}
function encodeCursor(value){return Buffer.from(JSON.stringify(value)).toString('base64url');}
function decodeCursor(cursor,prefix){if(!cursor)return undefined;try{if(typeof cursor!=='string'||cursor.length>8192)throw 0;const value=JSON.parse(Buffer.from(cursor,'base64url').toString());if(value.prefix!==prefix||typeof value.cursor!=='string')throw 0;return value.cursor;}catch{throw Error('Invalid storage cursor');}}

export function createBlobBucket(sdk,{token,now=Date.now}={}) {
  if(!sdk?.get||!sdk?.put||!sdk?.list||!sdk?.del)throw Error('Vercel Blob SDK required');
  const auth=token?{token}:{};
  const operation=()=>({...auth,abortSignal:AbortSignal.timeout(8000)});
  async function read(key,attempt=0){
    const path=keyPath(key),result=await sdk.get(path,{access:'private',useCache:false,...operation()});
    if(!result)return null;
    if(result.statusCode!==200||!result.stream||!result.blob?.etag)throw Error('Invalid private Blob response');
    const record=unpack(await new Response(result.stream).text());
    if(record.expiration!==null&&record.expiration*1000<=now()){
      try{await sdk.del(path,{...operation(),ifMatch:result.blob.etag});}
      catch(error){if(error instanceof sdk.BlobPreconditionFailedError&&attempt<2)return read(key,attempt+1);throw error;}
      return null;
    }
    return {record,blob:result.blob};
  }
  return {
    async put(key,value,options={}){
      const path=keyPath(key),body=await bytes(value);if(body.length>MAX_RECORD)throw Error('Private storage record too large');
      const condition=options.onlyIf;if(condition&&!(condition.etagDoesNotMatch==='*'||typeof condition.etagMatches==='string'&&condition.etagMatches))throw Error('Unsupported conditional storage write');
      const expiration=expirationFor(body,options),uploaded=new Date(now()).toISOString();
      const record={version:1,body:body.toString('base64'),size:body.length,uploaded,httpMetadata:options.httpMetadata||{},expiration};
      const ttl=expiration!==null?Math.max(1,Math.ceil((expiration*1000-now())/86400000)):null;
      const settings={access:'private',addRandomSuffix:false,allowOverwrite:condition?.etagDoesNotMatch!=='*',contentType:'application/json',cacheControlMaxAge:60,...(condition?.etagMatches?{ifMatch:condition.etagMatches}:{}),...(ttl!==null&&ttl<=730?{ttlDays:ttl}:{})};
      for(let attempt=0;attempt<2;attempt++){
        try{const result=await sdk.put(path,JSON.stringify(record),{...settings,...operation()});return {key,etag:result.etag,size:body.length,uploaded:new Date(uploaded),httpMetadata:record.httpMetadata};}
        catch(error){
          if(condition?.etagDoesNotMatch==='*'){
            // Some SDK versions report an existing pathname as BlobError.
            // A fresh authenticated read distinguishes a contender from a failure.
            if(await read(key))return null;
            if(attempt===0)continue;
          }else if(condition?.etagMatches&&error instanceof sdk.BlobPreconditionFailedError)return null;
          throw error;
        }
      }
    },
    async get(key){const entry=await read(key);if(!entry)return null;const {record,blob}=entry,body=record.body;return {key,size:body.length,etag:blob.etag,httpEtag:blob.etag,httpMetadata:record.httpMetadata,uploaded:new Date(record.uploaded),body:new Blob([body]).stream(),async text(){return body.toString();},async json(){return JSON.parse(body.toString());},async arrayBuffer(){return body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength);},writeHttpMetadata(headers){for(const [field,name]of Object.entries(httpNames))if(typeof record.httpMetadata[field]==='string')headers.set(name,record.httpMetadata[field]);}};},
    async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])await sdk.del(keyPath(key),operation());},
    async list({prefix='',limit=1000,cursor}={}){
      const physicalPrefix=prefix?keyPath(prefix):NAMESPACE,maximum=Math.max(1,Math.min(1000,Number(limit)||1000));
      const result=await sdk.list({prefix:physicalPrefix,limit:maximum,cursor:decodeCursor(cursor,prefix),...operation()});
      const objects=result.blobs.map(blob=>{if(!blob.pathname.startsWith(physicalPrefix))throw Error('Unexpected storage listing');return {key:blob.pathname.slice(NAMESPACE.length),etag:blob.etag,size:blob.size,uploaded:new Date(blob.uploadedAt)};});
      return {objects,truncated:result.hasMore,...(result.hasMore?{cursor:encodeCursor({prefix,cursor:result.cursor})}:{})};
    }
  };
}
