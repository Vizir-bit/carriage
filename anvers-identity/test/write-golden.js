// Rewrites test/golden.json and anvers-default.svg from the current grammar.
// Run it only on purpose, after raising GRAMMAR in anvers-identity.js: the
// golden test exists to catch a change that would redraw existing seeds,
// palette included.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const A = require('../anvers-identity.js');

const SEEDS = ['anvers', 'k3f9q2xa', 'anvers-01', 'anvers-05', 'anvers-09', 'anvers-12', 'anvers-17', 'nadar'];

const marks = {};
for (const seed of SEEDS) {
  const {shape, colour, d} = A.describe(seed);
  marks[seed] = {shape, colour, d};
}
const shapes = new Set(Object.values(marks).map(m => m.shape));
if (shapes.size !== A.shapes.length) throw new Error('golden seeds must cover every shape');
const baseline = {};
for (const seed of SEEDS.slice(0, 3)) baseline[seed] = A.describe(seed, {align: 'baseline'}).d;

fs.writeFileSync(path.join(__dirname, 'golden.json'),
                 JSON.stringify({grammar: A.grammar, palette: A.palette, marks, baseline}, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, '..', 'anvers-default.svg'), A.svg(A.defaultSeed) + '\n');
process.stdout.write(`golden.json and anvers-default.svg written for grammar ${A.grammar}\n`);
