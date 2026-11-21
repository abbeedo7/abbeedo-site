"""Export verified Vercel/GitHub source. Native Windows binaries ship separately."""
from pathlib import Path
import datetime, hashlib, json, os, re, zipfile

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
OUTPUT = Path(os.environ.get('ABBEEDO_PACKAGE_OUTPUT', str(ROOT.parent / ('abbeedo-com-Vercel-' + VERSION + '.zip'))))

def load(relative):
    return json.loads((ROOT / relative).read_text())

def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def checks(report):
    assert report.get('passed') is True, 'A required validation report did not pass'
    return len(report.get('checks', []))

browser_checks = checks(load('validation/report.json'))
review_checks = checks(load('validation/review-2.1-report.json'))
checks(load('validation/brand-audit.json'))
checks(load('validation/vercel-schema.json'))
assert load('docs/QR_TARGETS.json')['validated']
node_log = f'validation/node-tests-{VERSION}.log' if (ROOT / f'validation/node-tests-{VERSION}.log').exists() else 'validation/node-tests-2.1.log'
log = (ROOT / node_log).read_text()
matched = re.search(r'(?m)^ℹ pass (\d+)$', log)
assert matched and int(matched[1]) >= 56 and re.search(r'(?m)^ℹ fail 0$', log)
android = load('release-assets/android.json')
assert digest(ROOT / 'release-assets/abbeedo-TV-Android.apk') == android['sha256']
android_validation = load('validation/android-3.9.4-build-info.json')
assert android_validation['passed'] and android_validation['sha256'] == android['sha256']
assert android_validation['original_certificate_preserved'] and android_validation['in_app_update']
windows_version = load('windows/package.json')['version']
windows_validation = load(f'validation/windows-artifacts-{windows_version}.json')
windows_log = (ROOT / f'validation/windows-tests-{windows_version}.log').read_text()
windows_pass = re.search(r'(?m)^ℹ pass (\d+)$', windows_log)
assert windows_pass and re.search(r'(?m)^ℹ fail 0$', windows_log)
assert windows_validation['version'] == windows_version
assert windows_validation['passed'] and windows_validation['archiveIntegrityVerified']
tv = load('tv/dist/package-report.json')
for artifact in tv['artifacts']:
    file = ROOT / artifact['file']
    assert file.stat().st_size == artifact['bytes'] and digest(file) == artifact['sha256']
hosting = load('validation/hosting-status-2.1.json')
info = {
    'prepared_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'version': VERSION, 'application_version': load('application/application.json')['version'],
    'windows_version': windows_version,
    'android_version': android['version'], 'android_version_code': android['versionCode'],
    'domain': 'https://abbeedo.com', 'current_primary_domain': 'https://www.abbeedo.com',
    'website_name': 'ابوناصر', 'application_name': 'ابوناصر TV',
    'live_domain_changed': hosting.get('live_domain_modified', False),
    'vercel_project_access': hosting.get('vercel_account_access', False),
    'github_published_by_agent': hosting.get('github_published_by_agent', False),
    'production_receipt': {key: hosting.get('production_' + key) for key in ['version', 'revision', 'commit', 'deployment_id']},
    'hosting_status_checked_at_utc': hosting.get('checked_at_utc'),
    'private_backend_configured': hosting['private_backend_configured'],
    'public_github_downloads_ready': hosting['public_downloads_ready'],
    'repository': 'https://github.com/abbeedo7/abbeedo-site',
    'source_build_passed': True,
    'revision': load('.vercel/output/static/site-version.json')['revision'],
    'tests': {'source_node_tests': int(matched[1]), 'storefront_browser_checks': browser_checks,
              'desktop_pwa_updater_browser_checks': review_checks,
              'windows_tests': int(windows_pass[1]),
              'android_focused_tests': android_validation['focused_tests']['tests'],
              'physical_devices_tested': False},
    'samsung_package_signed': False,
    'owner_setup_guide': 'docs/DEPLOY_2_1_AR.md',
    'native_windows_binaries_in_source_zip': False,
}
info['source_revision_published'] = (info['production_receipt']['version'] == VERSION and info['production_receipt']['revision'] == info['revision'])
if (ROOT / f'validation/hotfix-{VERSION}-report.json').exists():
    info['tests']['hotfix_browser_checks'] = checks(load(f'validation/hotfix-{VERSION}-report.json'))
(ROOT / 'BUILD_INFO.json').write_text(json.dumps(info, ensure_ascii=False, indent=2) + '\n')
files = []
for file in sorted(ROOT.rglob('*')):
    relative = file.relative_to(ROOT)
    if any(part in {'node_modules', '.vercel', '.git', '__pycache__'} for part in relative.parts):
        continue
    if relative.parts[:2] in [('windows', 'dist'), ('windows', 'validation')]:
        continue
    if not file.is_file() or file.is_symlink() or file.suffix in {'.pyc', '.zip', '.partial'}:
        continue
    if file.name in {'MANIFEST_SHA256.txt', 'DELIVERY.json'}:
        continue
    assert not file.name.startswith('.env') or file.name == '.env.example'
    assert file.suffix.lower() not in {'.exe', '.ipa', '.p12', '.pem', '.key', '.jks', '.keystore', '.mobileprovision'}
    if file.suffix.lower() == '.apk':
        assert str(relative) == 'release-assets/abbeedo-TV-Android.apk'
    files.append(file)
manifest = {str(file.relative_to(ROOT)): digest(file) for file in files}
(ROOT / 'MANIFEST_SHA256.txt').write_text(''.join(sha + '  ' + name + '\n' for name, sha in manifest.items()))
OUTPUT.parent.mkdir(exist_ok=True, parents=True)
temporary = OUTPUT.with_suffix('.zip.partial')
with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in files + [ROOT / 'MANIFEST_SHA256.txt']:
        archive.write(file, str(file.relative_to(ROOT)))
with zipfile.ZipFile(temporary) as archive:
    assert archive.testzip() is None
    for required in ['package.json', 'vercel.json', 'windows/package.json', '.github/workflows/publish-release.yml',
                     'release-assets/abbeedo-TV-Android.apk', 'docs/DEPLOY_2_1_AR.md']:
        assert required in archive.namelist(), required
    for name, sha in manifest.items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == sha
    assert all(not name.endswith('.exe') for name in archive.namelist())
temporary.replace(OUTPUT)
result = {'file': str(OUTPUT), 'bytes': OUTPUT.stat().st_size, 'sha256': digest(OUTPUT),
          'source_files': len(manifest), 'domain': info['domain'], 'revision': info['revision'],
          'live_domain_changed': info['live_domain_changed'], 'vercel_account_setup_required': not hosting['private_backend_configured'],
          'github_initial_publication_required': not hosting['public_downloads_ready']}
OUTPUT.with_suffix('.zip.sha256').write_text(result['sha256'] + '  ' + OUTPUT.name + '\n')
(ROOT / 'DELIVERY.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
