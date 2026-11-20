import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
os.environ['LD_LIBRARY_PATH']='/workspace/validation/3.8.2/safari/deps/usr/lib/x86_64-linux-gnu'
os.environ['PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS']='1'
report={'passed':False,'checks':[],'physical_devices_tested':False}
with sync_playwright() as pw:
 for name in ['chromium','webkit']:
  browser=getattr(pw,name).launch(headless=True,**({'executable_path':'/usr/bin/chromium','args':['--no-sandbox']} if name=='chromium' else {}))
  page=browser.new_page(viewport={'width':390,'height':844})
  page.goto('http://127.0.0.1:9020/');page.wait_for_function("document.documentElement.dataset.siteReady==='true'")
  for height in [844,700,900]:
   page.set_viewport_size({'width':390,'height':height})
   page.evaluate('document.documentElement.style.scrollBehavior="auto";window.scrollTo(0,document.documentElement.scrollHeight)')
   page.wait_for_timeout(130)
   box=page.locator('#visual-backdrop').bounding_box()
   assert box['y']==0 and box['height']>=height and box['width']>=390,box
   assert page.locator('#visual-backdrop').evaluate('e=>getComputedStyle(e).visibility')=='visible'
   assert page.evaluate('window.scrollY>500')
  page.screenshot(path=str(ROOT/'screenshots'/f'{name}-bottom-mobile.png'))
  report['checks'].append({'browser':name,'check':'Moving background covers the actually scrolled footer at 844/700/900px viewport heights'})
  browser.close()
report['passed']=True;(ROOT/'background-bottom-2.1-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
