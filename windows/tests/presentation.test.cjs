'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {APP_ID, normalizeLanguage, chooseLanguage, appName, legacyProfilePath, readLanguage, writeLanguage} = require('../presentation.cjs');

test('locale selection accepts supported languages and prioritizes saved customer choice', () => {
  assert.equal(normalizeLanguage('ar-SA'), 'ar');
  assert.equal(normalizeLanguage('EN-us'), 'en');
  for (const value of ['fr', '../en', 'en/../../private', '', {}, null, 'a'.repeat(36)]) assert.equal(normalizeLanguage(value), null);
  assert.equal(chooseLanguage({saved: 'en', locale: 'ar-SA'}), 'en');
  assert.equal(chooseLanguage({saved: 'broken', locale: 'en-US'}), 'en');
  assert.equal(chooseLanguage({locale: 'fr-FR'}), 'ar');
  assert.equal(appName('en'), 'abbeedo TV');
  assert.equal(appName('ar'), 'ابوناصر TV');
});

test('branding changes preserve the established profile and write only language metadata', async () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'abbeedo-profile-'));
  try {
    const profile = legacyProfilePath(appData);
    assert.equal(path.basename(profile), 'Abunasser TV');
    fs.mkdirSync(profile);
    const existing = Buffer.from('existing private browser storage');
    fs.writeFileSync(path.join(profile, 'Cookies'), existing);
    await writeLanguage(profile, 'en-US');
    assert.equal(readLanguage(profile), 'en');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile, 'presentation.json'), 'utf8')), {language: 'en'});
    assert.ok(fs.readFileSync(path.join(profile, 'Cookies')).equals(existing));
    await assert.rejects(writeLanguage(profile, '../outside'));
    assert.deepEqual(fs.readdirSync(profile).sort(), ['Cookies', 'presentation.json']);
    fs.writeFileSync(path.join(profile, 'presentation.json'), 'corrupt');
    assert.equal(readLanguage(profile), null);
    assert.equal(APP_ID, 'com.abunasser.tv.windows');
  } finally {fs.rmSync(appData, {recursive: true, force: true});}
});

test('native offline page follows the selected language without displaying an English or Arabic placeholder', () => {
  const script = fs.readFileSync(path.join(__dirname, '../error.js'), 'utf8');
  for (const language of ['ar', 'en']) {
    const nodes = new Map();
    for (const id of ['brand-icon', 'error-title', 'error-description', 'retry', 'connection-error']) nodes.set(id, {textContent: '', hidden: true});
    const document = {documentElement: {}, getElementById: id => nodes.get(id)};
    vm.runInNewContext(script, {document, URLSearchParams, location: {search: '?lang=' + language}, navigator: {language: language === 'ar' ? 'en-US' : 'ar-SA'}});
    assert.equal(document.documentElement.lang, language);
    assert.equal(document.documentElement.dir, language === 'ar' ? 'rtl' : 'ltr');
    assert.equal(document.title, appName(language));
    assert.equal(nodes.get('connection-error').hidden, false);
    assert.ok(nodes.get('retry').textContent.length > 0);
    assert.equal(/[\u0600-\u06ff]/.test(nodes.get('error-title').textContent), language === 'ar');
  }
  assert.match(fs.readFileSync(path.join(__dirname, '../error.html'), 'utf8'), /id="connection-error" hidden/);
});

test('both Windows distributions are executable artifacts and installer language choice is enabled', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.version, '1.2.1');
  assert.equal(pkg.build.appId, APP_ID);
  assert.equal(pkg.build.productName, appName('en'));
  assert.deepEqual(pkg.build.win.target, ['nsis', 'portable']);
  assert.equal(pkg.build.nsis.artifactName, 'abbeedo-TV-Setup.exe');
  assert.equal(pkg.build.portable.artifactName, 'abbeedo-TV-Portable.exe');
  assert.equal(pkg.build.portable.unpackDirName, true);
  assert.deepEqual(pkg.build.nsis.installerLanguages, ['ar_SA', 'en_US']);
  assert.equal(pkg.build.nsis.displayLanguageSelector, false);
  assert.match(fs.readFileSync(path.join(__dirname,'../assets/installer-languages.nsh'),'utf8'),/\/LANG=/);
});
