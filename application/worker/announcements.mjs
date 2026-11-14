import {adminSession} from './admin-auth.mjs';
const announcementHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function announcementJson(data,status=200){return Response.json(data,{status,headers:announcementHeaders})}
export async function announcements(request,env){
 const path=new URL(request.url).pathname,admin=path.startsWith('/api/admin/');
 if(admin&&!await adminSession(request,env))return announcementJson({error:'سجّل الدخول بإيميل وكلمة مرور الإدارة.'},403);
 if(!env.BUCKET)return announcementJson({error:'خدمة التنبيهات غير مهيأة.'},503);
 const now=Date.now();
 if(request.method==='GET'){
  const listed=await env.BUCKET.list({prefix:'announcements/',limit:100});
  const rows=await Promise.all(listed.objects.map(async o=>{const item=await env.BUCKET.get(o.key);return item?item.json():null}));
  const messages=rows.filter(m=>m&&m.expiresAt>now).sort((a,b)=>a.createdAt-b.createdAt).slice(-30);
  return announcementJson({messages});
 }
 if(!admin)return announcementJson({error:'Method not allowed'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return announcementJson({error:'Forbidden'},403);
 if(request.method==='POST'){
  if(!(request.headers.get('content-type')||'').includes('application/json'))return announcementJson({error:'JSON required'},415);
  const raw=await request.text();if(raw.length>9000)return announcementJson({error:'الرسالة طويلة جدًا.'},413);
  let input;try{input=JSON.parse(raw)}catch{return announcementJson({error:'بيانات غير صالحة.'},400)}
  const title=typeof input.title==='string'?input.title.trim():'',body=typeof input.body==='string'?input.body.trim():'',days=Number(input.days);
  if(!title||title.length>100||!body||body.length>2000||!Number.isInteger(days)||days<1||days>30)return announcementJson({error:'أدخل عنوانًا حتى 100 حرف ونصًا حتى 2000 حرف، ومدة من 1 إلى 30 يومًا.'},400);
  const id=crypto.randomUUID(),message={id,title,body,createdAt:now,expiresAt:now+days*86400000};
  const listed=await env.BUCKET.list({prefix:'announcements/',limit:100});
  // Bound retained data; remove expired entries before accepting more.
  for(const o of listed.objects){const item=await env.BUCKET.get(o.key);if(item&&(await item.json()).expiresAt<=now)await env.BUCKET.delete(o.key);}
  if((await env.BUCKET.list({prefix:'announcements/',limit:31})).objects.length>=30)return announcementJson({error:'لديك 30 رسالة نشطة. احذف رسالة قديمة أولًا.'},409);
  await env.BUCKET.put('announcements/'+id+'.json',JSON.stringify(message),{httpMetadata:{contentType:'application/json'}});
  return announcementJson({message},201);
 }
 if(request.method==='DELETE'){
  const id=new URL(request.url).searchParams.get('id');if(!/^[a-f0-9-]{36}$/.test(id||''))return announcementJson({error:'Invalid id'},400);
  await env.BUCKET.delete('announcements/'+id+'.json');return announcementJson({ok:true});
 }
 return announcementJson({error:'Method not allowed'},405);
}
