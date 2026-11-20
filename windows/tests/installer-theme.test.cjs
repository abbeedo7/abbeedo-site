'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('installer chooses one persisted or explicit language before GUI and suppresses mixed-language popup',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../assets/installer-languages.nsh'),'utf8'),pkg=require('../package.json');
 assert.equal(pkg.build.nsis.displayLanguageSelector,false);
 assert.ok(!source.includes('Page custom AbbeedoLanguagePage')&&!source.includes('LangDLL::LangDialog'));
 assert.match(source,/!macro preInit/);assert.match(source,/StrCpy \$LANGUAGE 1025/);assert.match(source,/StrCpy \$LANGUAGE 1033/);
 for(const name of ['AbbeedoWelcomeTitle','AbbeedoWelcomeBody','AbbeedoCaption']){assert.match(source,new RegExp('LangString '+name+' 1025'));assert.match(source,new RegExp('LangString '+name+' 1033'));}
 assert.match(source,/MUI_BGCOLOR "0A1018"/);assert.match(source,/SetCtlColors \$0 FFFFFF FF242D/);
 assert.match(source,/Call un\.AbbeedoTheme/);assert.match(source,/\/LANG=/);assert.match(source,/\/ABBEEDOLANG=/);
});
