from pathlib import Path
import json,os,traceback,sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
ORIGIN='http://127.0.0.1:9020'
os.environ['LD_LIBRARY_PATH']='/workspace/validation/3.8.2/safari/deps/usr/lib/x86_64-linux-gnu'
os.environ['PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS']='1'
SEED="localStorage.setItem('abbeedo:preferences:v1',JSON.stringify({version:1,values:{language:'ar'},chosenLanguage:true}))"
IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
WIN='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'
FEED={'android':{'available':True,'version':'3.9.4','url':'/downloads/android.apk'},'windows':{'setup':{'available':True,'version':'1.2.0','url':'/downloads/windows.exe'},'portable':{'available':True,'version':'1.2.0','url':'/downloads/windows-portable.exe'}}}
report={'passed':False,'checks':[],'failures':[],'physical_devices_tested':False,'native_install_simulated':True}
def mark(name,text):report['checks'].append({'browser':name,'check':text});print('PASS '+name+' '+text,flush=True)
def context(browser,**kwargs):
 c=browser.new_context(**kwargs);c.add_init_script(SEED)
 c.route('**/api/releases',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(FEED)))
 return c
def run(browser,name):
 c=context(browser,viewport={'width':390,'height':844},user_agent=IOS)
 c.add_init_script("Object.defineProperty(navigator,'standalone',{value:true,configurable:true})")
 p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(ORIGIN,wait_until='domcontentloaded');p.wait_for_function("document.documentElement.dataset.siteReady==='true'")
 assert p.url.rstrip('/')==ORIGIN and p.title()=='ابوناصر'
 manifest=p.request.get(ORIGIN+'/site.webmanifest').json();app=p.request.get(ORIGIN+'/manifest.webmanifest').json()
 assert manifest['id']=='/website' and manifest['start_url']=='/' and manifest['name']=='ابوناصر'
 assert app['id']=='/app' and app['scope']=='/app' and app['start_url'].startswith('/app')
 icon=p.request.get(ORIGIN+p.locator('link[rel=apple-touch-icon]').get_attribute('href'));assert icon.status==200 and icon.body().startswith(b'\x89PNG')
 mark(name,'Website Home Screen stays on website; app has separate identity and real PNG icon')
 p.goto(ORIGIN+'/app',wait_until='domcontentloaded');p.wait_for_function("document.documentElement.dataset.appReady==='true'")
 assert p.locator('#app-website-home').is_visible()
 p.locator('#app-website-home').click();p.wait_for_function("document.documentElement.dataset.siteReady==='true'");assert p.url.rstrip('/')==ORIGIN
 assert not errors,errors;mark(name,'Browser app has a working return-to-website button');c.close()
 for size in [(1366,768),(1920,1080)]:
  c=context(browser,viewport={'width':size[0],'height':size[1]},user_agent=WIN);p=c.new_page();p.goto(ORIGIN+'/app',wait_until='domcontentloaded');p.wait_for_function("document.documentElement.dataset.installGateReady==='true'")
  brand=p.locator('.install-brand').bounding_box();card=p.locator('.install-card').bounding_box();settings=p.locator('#website-settings-button').bounding_box()
  assert brand['y']+brand['height']<=card['y']+1,(brand,card)
  assert settings['height']>=52 and p.locator('#gate-website-home').is_visible()
  assert p.evaluate('document.documentElement.scrollHeight<=innerHeight+1')
  p.locator('#website-settings-button').click();p.wait_for_timeout(100)
  assert p.locator('.install-card').evaluate("n=>getComputedStyle(n).visibility==='visible'&&getComputedStyle(n).opacity==='1'&&getComputedStyle(n).transform==='none'")
  c.close()
 mark(name,'Desktop logo stays above download card; large settings button and stable card at 1366/1920')
 c=context(browser,viewport={'width':1366,'height':768},user_agent=WIN)
 c.add_init_script("""window.__nativeCalls={check:0,download:0,install:0};window.__alerts=false;window.__updateListener=null;
 const emit=s=>window.__updateListener?.(s);
 window.abunasserDesktop=Object.freeze({isDesktop:true,platform:'win32',version:'1.2.0',nativeUpdater:true,nativeUpdates:true,nativeAnnouncements:true,
 getNotificationsEnabled:async()=>({ok:true,enabled:window.__alerts,supported:true}),setNotificationsEnabled:async enabled=>{window.__alerts=enabled;return{ok:true,enabled,supported:true}},
 onUpdateStatus:fn=>{window.__updateListener=fn;return()=>{window.__updateListener=null}},getUpdateStatus:async()=>({status:'idle',installedVersion:'1.2.0'}),
 checkForUpdates:async()=>{window.__nativeCalls.check++;return{ok:true,status:'available',version:'1.3.0',installedVersion:'1.2.0',total:100}},
 downloadUpdate:async()=>{window.__nativeCalls.download++;setTimeout(()=>emit({status:'ready',version:'1.3.0',installedVersion:'1.2.0',received:100,total:100,progress:1}),80);return{ok:true,status:'downloading',version:'1.3.0',installedVersion:'1.2.0',received:40,total:100,progress:.4}},
 cancelUpdate:async()=>({ok:true,status:'cancelled',version:'1.3.0',installedVersion:'1.2.0'}),
 installUpdate:async()=>{window.__nativeCalls.install++;return{ok:true,status:'installing',version:'1.3.0',installedVersion:'1.2.0'}}});""")
 p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto(ORIGIN+'/app',wait_until='domcontentloaded');p.wait_for_function("document.documentElement.dataset.appReady==='true'")
 assert p.locator('#app-website-home').is_hidden()
 p.locator('#settings-button').click();p.locator('[data-setting=update]').click()
 p.locator('#sheet').get_by_role('button',name='تنزيل التحديث',exact=True).click()
 p.locator('#sheet').get_by_role('button',name='تثبيت التحديث الآن',exact=True).click()
 calls=p.evaluate('window.__nativeCalls');assert calls['download']==1 and calls['install']==1 and calls['check']>=1
 assert p.url==ORIGIN+'/app';mark(name,'Windows updates download and install inside app through bounded native bridge without website navigation')
 p.locator('#sheet-close').click();p.locator('[data-setting=notifications]').click();p.wait_for_function('window.__alerts===true')
 assert not errors,errors;mark(name,'Native notification opt-in synchronizes with the app setting')
 if p.locator('#sheet').is_visible():p.locator('#sheet-close').click()
 p.locator('#back-button').click();p.locator('#demo-button').click()
 live=p.locator('#home-cards [data-kind=live]');live.focus()
 expected=p.locator('#home-cards .home-card').evaluate_all("(nodes)=>{const a=nodes.find(n=>n.dataset.kind==='live').getBoundingClientRect();return nodes.filter(n=>n.getBoundingClientRect().x>a.x+4).sort((l,r)=>l.getBoundingClientRect().x-r.getBoundingClientRect().x)[0]?.dataset.kind}")
 p.keyboard.press('ArrowRight');assert p.evaluate('document.activeElement.dataset.kind')==expected
 assert not errors,errors;mark(name,'Remote Right stays on the adjacent home card rather than jumping to tools')
 c.close()
with sync_playwright() as pw:
 for name in ['chromium','webkit']:
  browser=None
  try:
   browser=getattr(pw,name).launch(headless=True,**({'executable_path':'/usr/bin/chromium','args':['--no-sandbox']} if name=='chromium' else {}));run(browser,name)
  except Exception as e:report['failures'].append({'browser':name,'error':str(e),'traceback':traceback.format_exc()});print(traceback.format_exc(),flush=True)
  finally:
   if browser:browser.close()
report['passed']=not report['failures'];(ROOT/'review-2.1-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'checks':len(report['checks']),'failures':len(report['failures'])}));sys.exit(0 if report['passed'] else 1)
