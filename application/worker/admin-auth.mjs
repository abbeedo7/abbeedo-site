const adminCookie='__Host-abbeedo_admin';
const authHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function authJson(data,status=200,cookie){const headers={...authHeaders};if(cookie)headers['Set-Cookie']=cookie;return Response.json(data,{status,headers})}
function authHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function authHash(s){return authHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))}
function authToken(request){const m=(request.headers.get('cookie')||'').match(/(?:^|;\s*)__Host-abbeedo_admin=([a-f0-9]{64})(?:;|$)/);return m?.[1]}
async function adminSession(request,env){const token=authToken(request);if(!token||!env.BUCKET)return null;const key='admin-sessions/'+await authHash(token);const stored=await env.BUCKET.get(key);if(!stored)return null;const session=await stored.json();if(session.expiresAt<=Date.now()||session.verifier!==env.ADMIN_PASSWORD_HASH||session.email!==env.ADMIN_LOGIN_EMAIL){await env.BUCKET.delete(key);return null}return session}
export async function adminAuth(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/api/admin/session'&&request.method==='GET')return authJson({authenticated:!!await adminSession(request,env)});
 if(request.method!=='POST')return authJson({error:'Method not allowed'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return authJson({error:'Forbidden'},403);
 if(!env.BUCKET||!env.ADMIN_LOGIN_EMAIL||!env.ADMIN_PASSWORD_HASH||!env.ADMIN_PASSWORD_SALT)return authJson({error:'دخول الإدارة غير مهيأ.'},503);
 if(path==='/api/admin/logout'){const token=authToken(request);if(token)await env.BUCKET.delete('admin-sessions/'+await authHash(token));return authJson({ok:true},200,adminCookie+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0')}
 if(path!=='/api/admin/login')return authJson({error:'Not found'},404);
 if(!(request.headers.get('content-type')||'').includes('application/json'))return authJson({error:'JSON required'},415);
 const raw=await request.text();if(raw.length>2048)return authJson({error:'Invalid request'},413);
 let data;try{data=JSON.parse(raw)}catch{return authJson({error:'Invalid request'},400)}
 if(typeof data.email!=='string'||typeof data.password!=='string'||data.password.length>256)return authJson({error:'بيانات الدخول غير صحيحة.'},401);
 const now=Date.now(),rateKey='admin-rate/'+await authHash(request.headers.get('cf-connecting-ip')||'unknown');
 const saved=await env.BUCKET.get(rateKey);let rate=saved?await saved.json():{count:0,until:now+15*60000};if(rate.until<now)rate={count:0,until:now+15*60000};
 if(rate.count>=8)return authJson({error:'محاولات كثيرة. حاول بعد 15 دقيقة.'},429);
 rate.count++;await env.BUCKET.put(rateKey,JSON.stringify(rate));
 const salt=Uint8Array.from(env.ADMIN_PASSWORD_SALT.match(/../g),h=>parseInt(h,16));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(data.password),'PBKDF2',false,['deriveBits']);
 const actual=authHex(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256));
 let diff=actual.length^env.ADMIN_PASSWORD_HASH.length;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^env.ADMIN_PASSWORD_HASH.charCodeAt(i);
 if(diff!==0||data.email.trim().toLowerCase()!==env.ADMIN_LOGIN_EMAIL.toLowerCase())return authJson({error:'الإيميل أو كلمة المرور غير صحيحة.'},401);
 await env.BUCKET.delete(rateKey);
 const token=authHex(crypto.getRandomValues(new Uint8Array(32))),session={email:env.ADMIN_LOGIN_EMAIL,verifier:env.ADMIN_PASSWORD_HASH,expiresAt:now+8*3600000};
 const oldToken=authToken(request);if(oldToken)await env.BUCKET.delete('admin-sessions/'+await authHash(oldToken));
 await env.BUCKET.put('admin-sessions/'+await authHash(token),JSON.stringify(session));
 return authJson({ok:true},200,adminCookie+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800');
}
export {adminSession};
