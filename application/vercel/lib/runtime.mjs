import * as blob from '@vercel/blob';
import {createBlobBucket} from './blob-bucket.mjs';
import {resolveRuntimeSecrets} from '../../netlify/lib/runtime-secrets.mjs';

const names=['CLIENT_SECRET','RELAY_KEY','CLIENT_ALLOWED_HOSTS','WATCH_ALLOWED_HOSTS','ADMIN_LOGIN_EMAIL','ADMIN_PASSWORD_HASH','ADMIN_PASSWORD_SALT'];
let bootstrap;
export async function runtimeEnvironment(){
  // Vercel injects this token after a PRIVATE Blob store is connected in Storage.
  // Never accept it from a request, frontend variable, URL or source file.
  const token=process.env.BLOB_READ_WRITE_TOKEN;
  if(typeof token!=='string'||!token.startsWith('vercel_blob_rw_'))throw Error('Connect a private Vercel Blob store');
  const env=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  env.BUCKET=createBlobBucket(blob,{token});
  // Share only the private bootstrap within a warm instance. Sessions remain
  // durable Blob records and are always read uncached. A failed bootstrap is
  // evicted, so fixing Storage does not require waiting for an instance restart.
  const identity=[token,env.CLIENT_SECRET||'',env.RELAY_KEY||''];
  if(!bootstrap||bootstrap.until<=Date.now()||identity.some((value,index)=>bootstrap.identity[index]!==value)){
    const entry={identity,until:Date.now()+60000,promise:resolveRuntimeSecrets(env.BUCKET,env)};bootstrap=entry;
    entry.promise.catch(()=>{if(bootstrap===entry)bootstrap=undefined;});
  }
  Object.assign(env,await bootstrap.promise);
  return env;
}
export function unavailable(){return Response.json({error:'خدمة الاستضافة غير مهيأة. اربط مخزن Vercel Blob خاصًا بالمشروع ثم أعد النشر.',code:'HOSTING_CONFIG'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
