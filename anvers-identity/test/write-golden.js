// Rewrites test/golden.json and anvers-default.svg from the current grammar.
// Run it only on purpose, after raising GRAMMAR in anvers-identity.js: the
// golden test exists to catch a change that would redraw existing seeds,
// palette included. Then regenerate the demo's static fallback (README).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const A = require('../anvers-identity.js');

const NAMED = ['anvers', 'k3f9q2xa', 'anvers-01', 'anvers-05', 'anvers-09', 'anvers-12', 'anvers-17', 'nadar'];

// Besides the named seeds, the first seed of the family golden-N for every
// shape and every step of the legibility floor, so that a change to any
// step redraws a golden mark.
const wanted = new Set(['circle/none', 'square/none', 'square/mirrored', 'square/sheared',
                        'triangle/none', 'triangle/mirrored', 'triangle/sheared']);
const covering = [];
for (let i = 0; wanted.size && i < 100000; i++) {
  const m = A.describe(`golden-${i}`);
  const key = `${m.shape}/${m.distortion.floor}`;
  if (wanted.delete(key)) covering.push(m.seed);
}
if (wanted.size) throw new Error(`no golden seed for ${[...wanted].join(', ')}`);

const marks = {};
for (const seed of [...NAMED, ...covering]) {
  const {shape, colour, d, distortion} = A.describe(seed);
  marks[seed] = {shape, colour, floor: distortion.floor, d};
}
const baseline = {};
for (const seed of NAMED.slice(0, 3)) baseline[seed] = A.describe(seed, {align: 'baseline'}).d;

fs.writeFileSync(path.join(__dirname, 'golden.json'),
                 JSON.stringify({grammar: A.grammar, palette: A.palette, marks, baseline}, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, '..', 'anvers-default.svg'), A.svg(A.defaultSeed) + '\n');
process.stdout.write(`golden.json and anvers-default.svg written for grammar ${A.grammar}\n`);
