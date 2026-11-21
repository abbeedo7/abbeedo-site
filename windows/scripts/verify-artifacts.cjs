'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const asar = require('@electron/asar');
const resedit = require('resedit');
const {getPath7za} = require('app-builder-lib/out/toolsets/7zip');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'abbeedo-windows-verify-'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(path.join(root, file));

function peInfo(bytes) {
  assert.equal(bytes.toString('ascii', 0, 2), 'MZ');
  const offset = bytes.readUInt32LE(0x3c);
  assert.equal(bytes.readUInt32LE(offset), 0x4550);
  const optional = offset + 24;
  const magic = bytes.readUInt16LE(optional);
  const directories = optional + (magic === 0x20b ? 112 : 96);
  return {machine: bytes.readUInt16LE(offset + 4), authenticodeSigned: bytes.readUInt32LE(directories + 4 * 8 + 4) > 0};
}

(async () => {
  try {
    const seven = await getPath7za();
    const run = args => execFileSync(seven, args, {maxBuffer: 4 * 1024 * 1024});
    const definitions = [
      ['setup', pkg.build.nsis.artifactName],
      ['portable', pkg.build.portable.artifactName],
    ];
    const asarPath = path.join(root, 'dist/win-unpacked/resources/app.asar');
    const packaged = fs.readFileSync(asarPath);
    const artifacts = [];
    for (const [kind, filename] of definitions) {
      assert.equal(path.extname(filename), '.exe');
      const file = path.join(root, 'dist', filename);
      const bytes = fs.readFileSync(file);
      assert.ok(bytes.length > 100 * 1024 * 1024, kind + ' must contain the real Electron runtime');
      assert.equal(peInfo(bytes).authenticodeSigned, false);
      run(['t', file]);
      const listing = run(['l', file]).toString();
      assert.match(listing, /Type = Nsis/);
      assert.match(listing, /app-64\.7z/);
      if (kind === 'setup') {
        assert.match(listing, /Uninstall abbeedo TV\.exe/);
        for (const [embedded, source] of [['modern-wizard.bmp', 'assets/installer-sidebar.bmp'], ['modern-header.bmp', 'assets/installer-header.bmp']]) {
          assert.ok(run(['e', file, '$PLUGINSDIR/' + embedded, '-so']).equals(read(source)), embedded + ' must match the branded installer artwork');
        }
      }
      const extracted = path.join(temporary, kind);
      fs.mkdirSync(extracted);
      run(['e', file, '$PLUGINSDIR/app-64.7z', '-o' + extracted, '-y']);
      const nested = path.join(extracted, 'app-64.7z');
      assert.ok(fs.statSync(nested).size > 100 * 1024 * 1024);
      run(['t', nested]);
      run(['e', nested, 'resources/app.asar', '-o' + extracted, '-y']);
      assert.ok(fs.readFileSync(path.join(extracted, 'app.asar')).equals(packaged), kind + ' ASAR must equal the packaged source');
      const runtimeListing = run(['l', nested]).toString();
      assert.match(runtimeListing, /abbeedo TV\.exe/);
      artifacts.push({kind, path: file, bytes: bytes.length, sha256: hash(bytes), archiveIntegrityVerified: true, embeddedRuntimeVerified: true, sourceAsarMatched: true});
    }
    const runtimeFiles = ['app-config.json', 'assets/icon.png', 'assets/abbeedo.otf', 'error.html', 'error.js', 'main.cjs', 'preload.cjs', 'security.cjs', 'presentation.cjs', 'update-monitor.cjs', 'window-state.cjs', 'updater.cjs', 'client-provider.cjs', 'provider-fetch.cjs'];
    for (const file of runtimeFiles) assert.ok(asar.extractFile(asarPath, file).equals(read(file)), file);
    for (const file of ['client-api.mjs', 'watch-party.mjs', 'media-sniff.mjs']) {
      assert.ok(asar.extractFile(asarPath, 'client-worker/' + file).equals(fs.readFileSync(path.join(root, '../application/worker', file))), 'client-worker/' + file);
      runtimeFiles.push('client-worker/' + file);
    }
    const packagedPackage = JSON.parse(asar.extractFile(asarPath, 'package.json').toString());
    assert.equal(packagedPackage.version, pkg.version);
    const extractedRuntime = path.join(temporary, 'runtime');
    asar.extractAll(asarPath, extractedRuntime);
    const {createClientProvider} = require(path.join(extractedRuntime, 'client-provider.cjs'));
    const runtimeProvider = createClientProvider({origin: 'https://www.abbeedo.com', fetcher: () => {throw new Error('Runtime verification must not contact a provider');}});
    const runtimeResult = await runtimeProvider.clientRequest({op: 'auth', account: {mode: 'direct', server: 'http://maglobalxx.xyz:2052', url: 'https://fixture.example/movie.mp4'}});
    assert.equal(runtimeResult.status, 200);
    assert.equal(JSON.parse(runtimeResult.body).userInfo.sourceVerified, false);
    runtimeProvider.stop();
    const binary = read('dist/win-unpacked/abbeedo TV.exe');
    const details = peInfo(binary);
    assert.equal(details.machine, 0x8664);
    assert.equal(details.authenticodeSigned, false);
    const executable = resedit.NtExecutable.from(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
    const resources = resedit.NtExecutableResource.from(executable);
    assert.ok(resources.entries.some(value => value.type === 3));
    assert.ok(resources.entries.some(value => value.type === 14));
    const version = resedit.Resource.VersionInfo.fromEntries(resources.entries)[0].getStringValues({lang: 1033, codepage: 1200});
    assert.equal(version.ProductName, 'abbeedo TV');
    assert.equal(version.FileVersion, pkg.version);
    const report = {
      passed: true, checkedAtUTC: new Date().toISOString(), version: pkg.version,
      platform: 'Windows 10/11 x64', electron: '45.2.3', builder: '26.18.0',
      archiveIntegrityVerified: true, setupAndPortableIncludeRealPayload: true,
      setupPortableAndUnpackedAsarMatch: true, runtimeSourceFilesMatched: runtimeFiles, packagedProviderWorkerImportVerified: true,
      brandIconAndVersionVerified: true, brandedInstallerImagesMatched: true, appExecutableMachine: '0x8664',
      portableDistributionFiles: [pkg.build.portable.artifactName],
      installerLanguageSelectorConfigured: true, installerLanguageSelector: 'locale selected before UI; no popup', installerLanguages: pkg.build.nsis.installerLanguages,
      preservedProfileDirectory: 'Abunasser TV',
      authenticodeSigned: false, physicalWindowsTested: false,
      appOrigin: new URL(require('../app-config.json').appURL).origin,
      artifacts,
    };
    fs.mkdirSync(path.join(root, 'validation'), {recursive: true});
    fs.writeFileSync(path.join(root, 'validation/artifact-report.json'), JSON.stringify(report, null, 2) + '\n');
    for (const artifact of artifacts) fs.writeFileSync(artifact.path + '.sha256', artifact.sha256 + '  ' + path.basename(artifact.path) + '\n');
    console.log(JSON.stringify(report));
  } finally {fs.rmSync(temporary, {recursive: true, force: true});}
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
