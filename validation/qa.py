"""Targeted local storefront/app coexistence QA; not a physical-device claim."""
from pathlib import Path
import json, os, re, sys, traceback
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
ORIGIN = os.environ.get('QA_ORIGIN', 'http://127.0.0.1:9020').rstrip('/')
os.environ['LD_LIBRARY_PATH'] = '/workspace/validation/3.8.2/safari/deps/usr/lib/x86_64-linux-gnu' + (':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
os.environ['PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS'] = '1'
(ROOT / 'screenshots').mkdir(exist_ok=True)
REPORT = {'passed': False, 'origin': ORIGIN, 'checks': [], 'failures': [], 'viewports': [], 'physical_devices_tested': False, 'live_domain_modified': False, 'limitations': ['Headless Linux Chromium/WebKit; not physical iPhone, Windows or television.', 'Release and revision polling uses owned fixtures; actual release endpoints have separate HTTP tests.']}
UA_IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
BASE_FEED={'android':{'available':True,'version':'3.9.4','url':'/downloads/android.apk'},'windows':{'setup':{'available':True,'version':'1.2.0','url':'/downloads/windows.exe'},'portable':{'available':True,'version':'1.2.0','url':'/downloads/windows-portable.exe'}}}
EXPECTED_LINKS={'/downloads/android.apk','/downloads/windows.exe','/downloads/windows-portable.exe'}
BANNED = re.compile(r'max\s*(?:tv|show|player|4k|xciptv|vpn)|maxtv\.me', re.I)

def mark(browser, name, **data):
    REPORT['checks'].append({'browser':browser,'name':name,**data}); print('PASS '+browser+' '+name, flush=True)
def fixture_context(browser, **kwargs):
    c=browser.new_context(**kwargs)
    c.route('**/api/releases', lambda route:route.fulfill(status=200, content_type='application/json', headers={'Cache-Control':'no-store'},body=json.dumps(BASE_FEED)))
    c.route('**/site-version.json',lambda route:route.fulfill(status=200,content_type='application/json',headers={'Cache-Control':'no-store'},body=json.dumps({'revision':'web-1111111111111111'})))
    c.add_init_script("Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text}}})")
    return c

def ready(p, path='/'):
    p.goto(ORIGIN+path, wait_until='domcontentloaded',timeout=25000)
    p.wait_for_function("document.documentElement.dataset.siteReady === 'true'", timeout=20000)

def no_overflow(p):
    value=p.evaluate("()=>({w:innerWidth,h:innerHeight,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)})")
    assert value['scroll']<=value['w']+1, value
    return value

def responsive(browser,name):
    c=fixture_context(browser, viewport={'width':390,'height':844});p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    for width,height in [(320,568),(390,844),(844,390),(1920,1080)]:
        p.set_viewport_size({'width':width,'height':height})
        for path in ['/','/apps']:
            ready(p,path);v=no_overflow(p);REPORT['viewports'].append({'browser':name,'path':path,**v})
            assert len(p.locator('#visual-backdrop').all())==1
            assert not BANNED.search(p.locator('body').inner_text())
            hrefs=p.locator('a[href]').evaluate_all('nodes=>nodes.map(n=>n.getAttribute("href"))')
            assert not any(BANNED.search(x) for x in hrefs)
        if width==1920:
            p.screenshot(path=str(ROOT/'screenshots'/(name+'-apps-desktop.png')),full_page=True)
            ready(p,'/');p.screenshot(path=str(ROOT/'screenshots'/(name+'-home-desktop.png')),full_page=True)
    assert not errors,errors
    mark(name,'Root and downloads fit 4 phone/landscape/desktop sizes without horizontal overflow',samples=8)
    mark(name,'Visible content and links contain only the new TV identity; single viewport backdrop')
    c.close()

def interaction(browser,name):
    c=fixture_context(browser,viewport={'width':390,'height':844});p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));ready(p)
    p.locator('#menu-toggle').click();assert p.locator('#menu-toggle').get_attribute('aria-expanded')=='true';p.keyboard.press('Escape');assert p.locator('#menu-toggle').get_attribute('aria-expanded')=='false'
    p.locator('[data-settings-open]').first.click();p.locator('#language-select').select_option('en')
    assert p.locator('html').get_attribute('lang')=='en';assert p.locator('html').get_attribute('dir')=='ltr';assert p.locator('#settings-title').inner_text()=='Website settings'
    p.locator('#accent-input').fill('#31ba9a');p.locator('#accent-input').dispatch_event('input');p.locator('#contrast-toggle').check();p.locator('#font-select').select_option('1.15');p.locator('#motion-select').select_option('fast')
    assert p.locator('html').evaluate("e=>e.style.getPropertyValue('--accent')")=='#31ba9a';assert p.locator('body').get_attribute('data-high-contrast')=='true'
    p.locator('#settings-close').click();ready(p,'/apps');assert p.locator('html').get_attribute('lang')=='en';assert p.locator('body').get_attribute('data-high-contrast')=='true';assert p.locator('body').get_attribute('data-background')=='fast';no_overflow(p)
    mark(name,'Free language/color/contrast/text/motion choices persist across pages; mobile menu works')
    p.locator('[data-tab=qr]').click();assert p.locator('#panel-qr').is_visible();assert p.locator('.qr-card img').count()==6
    p.wait_for_function("()=>[...document.querySelectorAll('.qr-card img')].every(i=>i.complete&&i.naturalWidth>0)")
    p.locator('[data-tab=qr]').focus();p.keyboard.press('ArrowRight');assert p.locator('[data-tab=help]').get_attribute('aria-selected')=='true';assert p.locator('#panel-help').is_visible()
    p.locator('[data-tab=downloads]').click();p.locator('[data-tab-shortcut=help]').click();assert p.locator('#panel-help').is_visible()
    p.locator('footer [data-copy="0571514382"]').click();p.wait_for_function("window.__copied === '0571514382'");assert p.evaluate('window.__copied')=='0571514382'
    p.locator('[data-tab=links]').click();p.locator('#panel-links [data-copy]').first.click();p.wait_for_function("window.__copied==='https://abbeedo.com/downloads/android.apk'")
    own=p.locator('a[href^="/downloads/"]').evaluate_all('nodes=>nodes.map(n=>n.getAttribute("href"))');assert set(own)==EXPECTED_LINKS
    mark(name,'QRs load, keyboard tabs and installation shortcut work; copied phone and stable links are exact')
    p.locator('[data-tab=qr]').click();p.screenshot(path=str(ROOT/'screenshots'/(name+'-qr-mobile.png')),full_page=True)
    assert not errors,errors;c.close()

def motion(browser,name):
    c=fixture_context(browser,viewport={'width':1280,'height':800});p=c.new_page();ready(p);p.wait_for_function("document.documentElement.dataset.visualMotion==='running'")
    assert p.locator('body').evaluate("e=>getComputedStyle(e).backgroundImage")=='none'
    a=p.locator('.motion-grid-x').evaluate('e=>getComputedStyle(e).transform');p.wait_for_timeout(180);b=p.locator('.motion-grid-x').evaluate('e=>getComputedStyle(e).transform');assert a!=b
    p.wait_for_timeout(500)
    pixels=p.evaluate("""async()=>{const m=await import('/assets/background.js?site=2.1');const target=document.querySelector('.preview-brand img');await target.decode();const r=target.getBoundingClientRect(),canvas=document.querySelector('#visual-glitch');const triggered=m.triggerGlitch(target);if(!triggered)return {triggered};const began=performance.now();return await new Promise(resolve=>{const sample=()=>{const scale=canvas.width/innerWidth;const x=Math.max(0,Math.floor(r.left*scale)),y=Math.max(0,Math.floor(r.top*scale)),w=Math.min(canvas.width-x,Math.ceil(r.width*scale)),h=Math.min(canvas.height-y,Math.ceil(r.height*scale));if(w>0&&h>0){const bytes=canvas.getContext('2d').getImageData(x,y,w,h).data;for(let n=3;n<bytes.length;n+=4)if(bytes[n])return resolve({triggered,pixels:true})}if(performance.now()-began>650)return resolve({triggered,pixels:false});requestAnimationFrame(sample)};requestAnimationFrame(sample)})}""")
    assert pixels.get('pixels'),pixels;p.wait_for_timeout(360);assert p.locator('#visual-glitch').is_hidden()
    mark(name,'Single app grid really moves and actual logo glitch paints pixels then clears')
    p.locator('[data-settings-open]').first.click();p.locator('#reduced-toggle').check();p.wait_for_function("document.documentElement.dataset.visualMotion==='reduced'");assert not p.evaluate("async()=>{const m=await import('/assets/background.js?site=2.1');return m.triggerGlitch(document.querySelector('.preview-brand img'))}")
    p.locator('#reduced-toggle').uncheck();p.locator('#motion-select').select_option('off');p.wait_for_function("document.documentElement.dataset.visualMotion==='off'");p.locator('#motion-select').select_option('standard');p.emulate_media(reduced_motion='reduce');p.wait_for_function("document.documentElement.dataset.visualMotion==='reduced'");p.emulate_media(reduced_motion='no-preference');p.wait_for_function("document.documentElement.dataset.visualMotion==='running'")
    mark(name,'User and system reduced-motion settings stop grid/glitch; Still stops grid')
    c.close()

def blocked(browser,name):
    c=fixture_context(browser,viewport={'width':390,'height':844});c.add_init_script("Storage.prototype.getItem=function(){throw Error('Storage blocked')};Storage.prototype.setItem=function(){throw Error('Storage blocked')}");p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));ready(p);p.locator('[data-settings-open]').first.click();p.locator('#language-select').select_option('en');assert p.locator('html').get_attribute('lang')=='en';assert 'unavailable' in p.locator('#settings-storage-status').inner_text();p.locator('#accent-input').fill('#85adff');p.locator('#accent-input').dispatch_event('input');assert p.locator('html').evaluate("e=>e.style.getPropertyValue('--accent')")=='#85adff';assert not errors,errors;mark(name,'Settings remain functional with blocked storage and give an honest persistence message');c.close()

def polling(browser,name):
    c=browser.new_context(viewport={'width':390,'height':844});p=c.new_page();feed=json.loads(json.dumps(BASE_FEED));revision={'revision':'web-1111111111111111'};errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    p.route('**/api/releases',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(feed)))
    p.route('**/site-version.json',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(revision)))
    p.clock.install();ready(p,'/apps');p.wait_for_function("document.querySelector('[data-release-status=android]').dataset.state==='ready'")
    assert '3.9.4' in p.locator('[data-release-status=android]').inner_text()
    feed['android']['version']='4.0.0';p.clock.fast_forward(61000);p.wait_for_function("document.querySelector('[data-release-status=android]').textContent.includes('4.0.0')")
    hrefs=p.locator('a[href^="/downloads/"]').evaluate_all('nodes=>nodes.map(n=>n.getAttribute("href"))');assert set(hrefs)==EXPECTED_LINKS
    mark(name,'Live release poll updates visible version while own-domain download links stay stable')
    p.locator('[data-settings-open]').first.click();revision['revision']='web-2222222222222222';p.clock.fast_forward(61000);p.wait_for_function("!document.querySelector('#site-update-banner').hidden");assert p.locator('#settings-dialog').evaluate('e=>e.open')
    p.locator('#settings-close').click()
    with p.expect_navigation(wait_until='domcontentloaded',timeout=20000):p.clock.fast_forward(16000)
    p.wait_for_function("document.documentElement.dataset.siteReady==='true'")
    assert not errors,errors;mark(name,'New source revision waits for settings/idle then refreshes the page safely');c.close()

def installed(browser,name):
    c=browser.new_context(viewport={'width':390,'height':844},user_agent=UA_IOS);c.add_init_script("Object.defineProperty(navigator,'standalone',{value:true});localStorage.setItem('abbeedo:preferences:v1',JSON.stringify({version:1,values:{language:'ar'},chosenLanguage:true}))");p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));ready(p);assert p.locator('.site-header').is_visible();assert p.locator('#app-shell').count()==0;assert p.title()=='ابوناصر';p.goto(ORIGIN+'/app',wait_until='domcontentloaded');p.wait_for_function("document.documentElement.dataset.appReady==='true'",timeout=25000);assert p.locator('#app-shell').is_visible();p.locator('#demo-button').click();assert p.locator('#home-cards [data-kind]').count()==3;assert p.locator('#home-page').is_visible();assert not errors,errors;mark(name,'Website Home Screen stays on website; explicit /app opens app and demo');c.close()
    c=browser.new_context();p=c.new_page();r=p.goto(ORIGIN+'/?source=installed',wait_until='domcontentloaded');assert r and r.status==200;assert p.locator('#app-shell').count()==1;assert p.locator('.site-header').count()==0;mark(name,'Legacy installed start URL serves app HTML instead of replacing it with storefront');c.close()

with sync_playwright() as pw:
    for name in os.environ.get('QA_BROWSERS','chromium,webkit').split(','):
        browser=None
        try:
            options={'headless':True}
            if name=='chromium':options.update(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            browser=getattr(pw,name).launch(**options)
            for group in [responsive,interaction,motion,blocked,polling,installed]:
                if os.environ.get('QA_GROUPS') and group.__name__ not in os.environ['QA_GROUPS'].split(','):continue
                try:group(browser,name)
                except Exception as error:
                    item={'browser':name,'group':group.__name__,'message':str(error),'traceback':traceback.format_exc()};REPORT['failures'].append(item);print(item['traceback'],flush=True)
        except Exception as error:REPORT['failures'].append({'browser':name,'group':'launch','message':str(error),'traceback':traceback.format_exc()})
        finally:
            if browser:browser.close()
REPORT['passed']=not REPORT['failures'];(ROOT/os.environ.get('QA_REPORT','report.json')).write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':REPORT['passed'],'checks':len(REPORT['checks']),'failures':len(REPORT['failures'])},ensure_ascii=False));sys.exit(0 if REPORT['passed'] else 1)
