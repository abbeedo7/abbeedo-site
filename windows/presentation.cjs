'use strict';

const fs = require('node:fs');
const path = require('node:path');
const APP_ID = 'com.abunasser.tv.windows';
const LEGACY_PROFILE_DIRECTORY = 'Abunasser TV';
const NAMES = Object.freeze({ar: 'ابوناصر TV', en: 'abbeedo TV'});

function normalizeLanguage(value, supported = ['ar', 'en']) {
  if (typeof value !== 'string' || value.length > 35) return null;
  try {
    const canonical = Intl.getCanonicalLocales(value)[0];
    if (!canonical) return null;
    const language = canonical.split('-')[0].toLowerCase();
    return supported.includes(language) ? language : null;
  } catch { return null; }
}
function chooseLanguage({saved, locale, supported = ['ar', 'en']} = {}) {
  return normalizeLanguage(saved, supported) || normalizeLanguage(locale, supported) || supported[0] || 'ar';
}
function appName(language) { return language === 'ar' ? NAMES.ar : NAMES.en; }
function legacyProfilePath(appDataDirectory) { return path.join(appDataDirectory, LEGACY_PROFILE_DIRECTORY); }
function readLanguage(profileDirectory, supported = ['ar', 'en']) {
  try {
    const record = JSON.parse(fs.readFileSync(path.join(profileDirectory, 'presentation.json'), 'utf8'));
    return normalizeLanguage(record.language, supported);
  } catch { return null; }
}
async function writeLanguage(profileDirectory, language, supported = ['ar', 'en']) {
  const selected = normalizeLanguage(language, supported);
  if (!selected) throw new Error('Unsupported presentation language.');
  await fs.promises.mkdir(profileDirectory, {recursive: true});
  const destination = path.join(profileDirectory, 'presentation.json');
  const temporary = destination + '.tmp';
  await fs.promises.writeFile(temporary, JSON.stringify({language: selected}) + '\n', {mode: 0o600});
  await fs.promises.rename(temporary, destination);
}
module.exports = {APP_ID, LEGACY_PROFILE_DIRECTORY, NAMES, normalizeLanguage, chooseLanguage, appName, legacyProfilePath, readLanguage, writeLanguage};
