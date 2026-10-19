#!/usr/bin/env node
// Writes every Anvers browser theme as a standalone folder holding one
// manifest.json, under themes/ (or the directory given), and prints each
// theme's contrast in every state Chromium draws. Stops without writing if
// any text or icon falls below its contrast outside the exceptions a theme
// names.
//
//   node bin/anvers-themes.js [directory]
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {THEMES, check, serialize} = require('../anvers-themes.js');

const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'themes'));

let failed = false;
for (const theme of THEMES) {
  process.stdout.write(`${theme.folder} (${theme.role})\n`);
  for (const r of check(theme)) {
    const mark = {ok: 'ok  ', exception: 'KNOWN', FAIL: 'FAIL'}[r.status];
    process.stdout.write(`  ${mark} ${r.state}: ${r.fg} on ${r.bg}, ${r.ratio.toFixed(2)}:1 (needs ${r.min}:1)\n`);
    if (r.reason) process.stdout.write(`        ${r.reason}\n`);
    if (r.status === 'FAIL') failed = true;
  }
}
if (failed) {
  process.stderr.write('anvers-themes: a contrast check failed; nothing written\n');
  process.exit(1);
}
for (const theme of THEMES) {
  const dir = path.join(out, theme.folder);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'manifest.json'), serialize(theme));
}
process.stdout.write(`${THEMES.length} themes written to ${out}\n`);
