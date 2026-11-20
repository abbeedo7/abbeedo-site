import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const output=JSON.parse(await fs.readFile(new URL('../.vercel/output/config.json',import.meta.url),'utf8'));
function destination(address){const url=new URL(address,'https://www.abbeedo.com');for(const route of output.routes){if(route.handle==='filesystem')return 'filesystem';if(!new RegExp(route.src).test(url.pathname))continue;if(route.has?.some(condition=>condition.type==='query'&&url.searchParams.get(condition.key)!==condition.value))continue;if(route.dest||route.status)return route.dest||route.headers.Location;}return null;}
test('application page rewrites never capture its script directory or the storefront apps page',()=>{
 assert.equal(destination('/app'),'/app.html');assert.equal(destination('/app/'),'/app.html');
 assert.equal(destination('/app/entry.js'),'filesystem');assert.equal(destination('/app/core.js'),'filesystem');
 assert.equal(destination('/apps'),'/apps/index.html');assert.equal(destination('/apps/'),'/apps/index.html');
 assert.equal(destination('/'),'filesystem');assert.equal(destination('/?source=installed'),'/app.html');
});
test('fixed download aliases and release endpoint remain separate from private application API',()=>{
 assert.equal(destination('/downloads/android.apk'),'/download?file=android');assert.equal(destination('/downloads/windows.exe'),'/download?file=windows');assert.equal(destination('/downloads/windows-portable.exe'),'/download?file=portable');
 assert.equal(destination('/api/releases'),'/releases');assert.equal(destination('/api/client'),'/api');assert.equal(destination('/api/watch/rooms'),'/api');assert.equal(destination('/api/releases-invalid'),'/api');assert.equal(destination('/downloads/androidXapk'),'filesystem');assert.equal(destination('/open'),'/app');assert.equal(destination('/updates.json'),'/releases?format=android');
});
