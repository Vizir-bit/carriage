#!/usr/bin/env node
// Writes an Anvers mark as standalone SVG (or its description as JSON) to
// standard output. Without a seed it draws a new one and reports it on
// standard error, so any mark can be drawn again.
//
//   node bin/anvers-mark.js [seed|random|daily] [--shape circle|square|triangle]
//     [--colour red|yellow|blue] [--align centre|baseline] [--scheme light|dark]
//     [--background none|paper|ink] [--size PIXELS] [--label TEXT] [--json]
//
// 'random' and 'daily' are resolved as a page resolves them, and the seed
// drawn is then reported on standard error.
'use strict';

const AnversIdentity = require('../anvers-identity.js');

function parse(argv) {
  const opts = {};
  let seed;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') { opts.json = true; continue; }
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    const m = /^--(shape|colour|color|align|scheme|background|size|label)(?:=(.*))?$/.exec(arg);
    if (m) {
      const value = m[2] !== undefined ? m[2] : argv[++i];
      if (value === undefined) throw new Error(`--${m[1]} needs a value`);
      opts[m[1] === 'color' ? 'colour' : m[1]] = value;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    if (seed !== undefined) throw new Error('only one seed may be given');
    seed = arg;
  }
  return {seed, opts};
}

function main() {
  let parsed;
  try {
    parsed = parse(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`anvers-mark: ${e.message}\n`);
    process.exit(2);
  }
  const {seed: given, opts} = parsed;
  if (opts.help) {
    process.stdout.write('usage: anvers-mark [seed|random|daily] [--shape S] [--colour C] [--align A] ' +
      '[--scheme light|dark] [--background none|paper|ink] [--size N] [--label TEXT] [--json]\n');
    return;
  }
  const seed = AnversIdentity.resolveSeed(given);
  if (given === undefined || seed !== given) process.stderr.write(`seed ${seed}\n`);
  try {
    const out = opts.json
      ? JSON.stringify(AnversIdentity.describe(seed, opts), null, 2)
      : AnversIdentity.svg(seed, opts);
    process.stdout.write(out + '\n');
  } catch (e) {
    process.stderr.write(`anvers-mark: ${e.message}\n`);
    process.exit(2);
  }
}

main();
