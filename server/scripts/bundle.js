// Bundle script for Nakama TypeScript runtime using esbuild
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const entryPath = path.join(__dirname, '../src/main.ts');
const outputPath = path.join(__dirname, '../build/index.js');

function stripCommonJs(code) {
  let updated = code;
  updated = updated.replace(/^"use strict";\s*/gm, '');
  updated = updated.replace(/Object\.defineProperty\(exports.*\n/g, '');
  updated = updated.replace(/exports\.\w+ = void 0;\s*/g, '');
  updated = updated.replace(/exports\.\w+ = \w+;\s*/g, '');
  updated = updated.replace(/module\.exports = .*;\s*/g, '');
  updated = updated.replace(/globalScope\.InitModule = exports\.InitModule;/g, 'globalScope.InitModule = InitModule;');
  updated = updated.replace(/^const /gm, 'var ');
  updated = updated.replace(/^let /gm, 'var ');
  updated = updated.replace(
    /initializer\.registerMatch\("quiz_match",\s*\{\s*matchInit,\s*matchJoinAttempt,\s*matchJoin,\s*matchLeave,\s*matchLoop,\s*matchTerminate,\s*matchSignal\s*\}\);/m,
    'initializer.registerMatch("quiz_match", { matchInit: matchInit, matchJoinAttempt: matchJoinAttempt, matchJoin: matchJoin, matchLeave: matchLeave, matchLoop: matchLoop, matchTerminate: matchTerminate, matchSignal: matchSignal });'
  );
  return updated;
}

esbuild.build({
  entryPoints: [entryPath],
  bundle: true,
  outfile: outputPath,
  format: 'cjs',
  platform: 'neutral',
  target: ['es2015'],
  logLevel: 'info',
}).then(() => {
  const raw = fs.readFileSync(outputPath, 'utf8');
  const cleaned = stripCommonJs(raw);
  fs.writeFileSync(outputPath, cleaned);
  console.log('Bundle created successfully: build/index.js');
  console.log(`Total size: ${(cleaned.length / 1024).toFixed(2)} KB`);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
