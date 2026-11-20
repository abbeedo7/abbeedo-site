'use strict';

// electron-builder's pinned release already contains a pure Node extractor for
// its intermediate NSIS uninstaller. Select that existing path on Linux rather
// than executing an unsigned Windows stub in Wine. No installer bytes are forged.
if (process.platform === 'linux') {
  const version = require('app-builder-lib/package.json').version;
  if (version !== '26.18.0') throw new Error('Review the Linux NSIS extraction path before upgrading electron-builder.');
  const {UninstallerReader} = require('app-builder-lib/out/targets/nsis/nsisUtil');
  if (typeof UninstallerReader?.exec !== 'function') throw new Error('The pinned NSIS uninstaller extractor is unavailable.');
  const macosVersion = require('app-builder-lib/out/util/macosVersion');
  macosVersion.isMacOsCatalina = () => true;
}

const {build, Platform} = require('electron-builder');
const {Arch} = require('builder-util');
const targets = process.argv.includes('--portable') ? ['portable'] : process.argv.includes('--nsis-only') ? ['nsis'] : ['nsis', 'portable'];
build({targets: Platform.WINDOWS.createTarget(targets, Arch.x64), publish: 'never', ...(process.argv.includes('--prepackaged') ? {prepackaged: require('node:path').resolve(__dirname, '../dist/win-unpacked')} : {})}).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
