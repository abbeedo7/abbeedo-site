"""Package the complete deployable source, not a static-only snapshot."""
from pathlib import Path
import datetime,hashlib,json,re,zipfile

ROOT=Path(__file__).resolve().parent.parent
OUTPUT=Path('/workspace/library-files/abbeedo-com-Vercel-Ready.zip')
def load(path):return json.loads(path.read_text())
def digest(path):return hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
assert load(ROOT/'validation/report.json')['passed']
assert load(ROOT/'validation/polling-report.json')['passed']
assert load(ROOT/'validation/brand-audit.json')['passed']
assert load(ROOT/'validation/live-node-endpoints.json')['passed']
assert load(ROOT/'validation/vercel-schema.json')['passed']
assert load(ROOT/'docs/QR_TARGETS.json')['validated']
log=(ROOT/'validation/node-tests.log').read_text()
assert re.search(r'(?m)^ℹ pass 18$',log) and re.search(r'(?m)^ℹ fail 0$',log)
info=load(ROOT/'BUILD_INFO.json')
info['tests']['source_node_tests']=18
info['source_build_passed']=True
info['live_domain_changed']=False
info['prepared_at_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
info['revision']=load(ROOT/'.vercel/output/static/site-version.json')['revision']
(ROOT/'BUILD_INFO.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n')
files=[]
for file in sorted(ROOT.rglob('*')):
 relative=file.relative_to(ROOT)
 if any(part in ['node_modules','.vercel','.git','__pycache__'] for part in relative.parts):continue
 if not file.is_file() or file.is_symlink() or file.suffix in ['.pyc','.zip','.partial']:continue
 if file.name in ['MANIFEST_SHA256.txt','DELIVERY.json']:continue
 assert not file.name.startswith('.env') or file.name=='.env.example'
 assert file.suffix.lower() not in ['.exe','.apk','.ipa','.p12','.pem','.key','.jks','.mobileprovision']
 files.append(file)
manifest={str(file.relative_to(ROOT)):digest(file) for file in files}
(ROOT/'MANIFEST_SHA256.txt').write_text(''.join(sha+'  '+name+'\n' for name,sha in manifest.items()))
OUTPUT.parent.mkdir(exist_ok=True,parents=True)
temporary=OUTPUT.with_suffix('.zip.partial')
with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for file in files+[ROOT/'MANIFEST_SHA256.txt']:archive.write(file,str(file.relative_to(ROOT)))
with zipfile.ZipFile(temporary) as archive:
 assert archive.testzip() is None
 assert 'package.json' in archive.namelist() and 'vercel.json' in archive.namelist()
 for name,sha in manifest.items():assert hashlib.sha256(archive.read(name)).hexdigest()==sha
temporary.replace(OUTPUT)
result={'file':str(OUTPUT),'bytes':OUTPUT.stat().st_size,'sha256':digest(OUTPUT),'source_files':len(manifest),'domain':info['domain'],'revision':info['revision'],'live_domain_changed':False,'vercel_account_setup_required':True}
OUTPUT.with_suffix('.zip.sha256').write_text(result['sha256']+'  '+OUTPUT.name+'\n')
(ROOT/'DELIVERY.json').write_text(json.dumps(result,indent=2)+'\n')
Path('/workspace/artifacts/abbeedo-com-packaging.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
