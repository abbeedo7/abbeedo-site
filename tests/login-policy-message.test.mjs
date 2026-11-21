import test from 'node:test';
import assert from 'node:assert/strict';
import {errorText} from '../application/public/app/preferences.js';

test('a provider protection refusal explains the connection block in the chosen language',()=>{
 const error={code:'UPSTREAM_BLOCKED',httpStatus:403,message:'Server-side provider policy'};
 assert.match(errorText(error,'ar'),/حماية مصدر الاشتراك/);
 assert.match(errorText(error,'en'),/blocked the connection before sign-in/);
 assert.ok(!errorText(error,'ar').includes('كلمة المرور'));
});
test('an older Windows shell gets an actionable native update instruction instead of repeating the server refusal',()=>{
 const old=globalThis.abunasserDesktop;
 try{
  globalThis.abunasserDesktop={isDesktop:true};
  assert.match(errorText({code:'UPSTREAM_BLOCKED',httpStatus:403},'ar'),/1\.2\.1/);
  globalThis.abunasserDesktop={isDesktop:true,clientRequest(){}};
  assert.match(errorText({code:'UPSTREAM_BLOCKED',httpStatus:403},'en'),/subscription source blocked/);
 }finally{if(old===undefined)delete globalThis.abunasserDesktop;else globalThis.abunasserDesktop=old;}
});
