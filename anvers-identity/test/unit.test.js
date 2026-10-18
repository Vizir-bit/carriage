// Unit tests: no dependency beyond Node (18 or later). Run from
// anvers-identity/ with: node --test test/unit.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');

const A = require('../anvers-identity.js');
const G = A._geometry;

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'anvers-mark.js');
const SWEEP = 6000;
const seeds = Array.from({length: SWEEP}, (_, i) => `sweep-${i}`);

// The contract, written out here so that a change to the module's own
// constants cannot pass unnoticed.
const SAFE = {min: 7, max: 93};
const BASELINE = 88;
const BOUNDS = {
  rotate: [-12, 12],
  shear: [0.06, 0.18],
  stretch: {circle: [1.06, 1.20], square: [1.06, 1.12], triangle: [1.06, 1.12]},
  vertex: 0.10,
};
// Worst triangle area, as a share of its target, over the bounds' extremes
// and midpoints (README); the tests hold these floors with a small margin.
const TRIANGLE_FLOOR = {centre: 0.85, baseline: 0.78};

// Points of a path as written: M/L/C coordinates, in order.
function numbers(d) {
  return (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
}
function commands(d) {
  return d.replace(/[^MLCZ]/g, '');
}
function points(d) {
  const n = numbers(d), pts = [];
  for (let i = 0; i < n.length; i += 2) pts.push([n[i], n[i + 1]]);
  return pts;
}
// Outline points: polygon vertices, or the circle's curves sampled finely.
function ring(mark) {
  const pts = points(mark.d);
  if (mark.shape !== 'circle') return pts;
  const out = [];
  for (let i = 0; i + 3 < pts.length; i += 3) {
    for (let j = 0; j < 64; j++) {
      const t = j / 64, u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      out.push([0, 1].map(k => w[0] * pts[i][k] + w[1] * pts[i + 1][k] + w[2] * pts[i + 2][k] + w[3] * pts[i + 3][k]));
    }
  }
  return out;
}
function convex(pts) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-6) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
function inside(pts, maxY) {
  return pts.every(([x, y]) => x >= SAFE.min - 0.01 && x <= SAFE.max + 0.01 &&
                               y >= SAFE.min - 0.01 && y <= maxY + 0.01);
}
function luminance(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function cli(args, options) {
  return spawnSync(process.execPath, [CLI, ...args], {encoding: 'utf8', ...options});
}

test('the contract: bounds, safe area and baseline are the documented ones', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(A.bounds)), BOUNDS);
  assert.deepEqual({...A.safe}, SAFE);
  assert.equal(A.baseline, BASELINE);
});

test('the same seed always gives the same mark, byte for byte', () => {
  for (const seed of ['anvers', 'k3f9q2xa', 'Nadar', '1919', ' padded ']) {
    assert.deepEqual(A.describe(seed), A.describe(seed));
    assert.equal(A.svg(seed), A.svg(seed));
  }
  assert.equal(A.describe(' padded ').seed, 'padded');
  assert.equal(A.describe(1919).d, A.describe('1919').d);
  // The same visible text draws the same mark, however it is encoded.
  const nfc = 'Bauhaus caf\u00e9', nfd = 'Bauhaus cafe\u0301';
  assert.notEqual(nfc, nfd);
  assert.equal(A.describe(nfd).d, A.describe(nfc).d);
  assert.equal(A.resolveSeed(nfd), nfc);
});

test('golden marks and palette: this grammar draws these seeds exactly so', () => {
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
  const why = 'the grammar changed: raise GRAMMAR and regenerate test/golden.json on purpose (see README)';
  assert.equal(golden.grammar, A.grammar, why);
  assert.deepEqual(JSON.parse(JSON.stringify(A.palette)), golden.palette, why);
  for (const [seed, expected] of Object.entries(golden.marks)) {
    const mark = A.describe(seed);
    assert.deepEqual({shape: mark.shape, colour: mark.colour, floor: mark.distortion.floor, d: mark.d}, expected,
                     `seed ${seed}: ${why}`);
  }
  for (const [seed, d] of Object.entries(golden.baseline)) {
    assert.equal(A.describe(seed, {align: 'baseline'}).d, d, `seed ${seed} on the baseline: ${why}`);
  }
});

test('different seeds give different marks', () => {
  const outlines = new Set(seeds.slice(0, 2000).map(s => A.describe(s).d));
  assert.equal(outlines.size, 2000);
});

test('one shape and one colour, from the fixed sets, in even shares', () => {
  const shapes = {}, colours = {};
  for (const seed of seeds) {
    const m = A.describe(seed);
    assert.ok(A.shapes.includes(m.shape));
    assert.ok(A.colours.includes(m.colour));
    assert.equal(m.fill.light, A.palette.light[m.colour]);
    assert.equal(m.fill.dark, A.palette.dark[m.colour]);
    shapes[m.shape] = (shapes[m.shape] || 0) + 1;
    colours[m.colour] = (colours[m.colour] || 0) + 1;
  }
  for (const count of [...Object.values(shapes), ...Object.values(colours)]) {
    assert.ok(Math.abs(count / SWEEP - 1 / 3) < 0.03, `share ${count / SWEEP}`);
  }
  assert.equal((A.svg('anvers').match(/<path/g) || []).length, 1, 'exactly one shape');
});

test('drawn distortion stays between its floor and its ceiling', () => {
  for (const seed of seeds) {
    const {distortion: t, shape} = A.describe(seed);
    assert.ok(t.rotate >= BOUNDS.rotate[0] && t.rotate <= BOUNDS.rotate[1], `rotate ${t.rotate}`);
    assert.ok(Math.abs(t.shear) >= BOUNDS.shear[0] - 1e-3 && Math.abs(t.shear) <= BOUNDS.shear[1] + 1e-3, `shear ${t.shear}`);
    // The per-axis factor: one axis is multiplied by it and the other divided.
    const factor = Math.max(t.stretch, 1 / t.stretch);
    const [lo, hi] = BOUNDS.stretch[shape];
    assert.ok(factor >= lo - 1e-3 && factor <= hi + 1e-3, `${shape} stretch ${t.stretch}`);
    assert.equal(t.jitter.length, shape === 'circle' ? 0 : shape === 'square' ? 8 : 6);
    for (const j of t.jitter) assert.ok(Math.abs(j) <= 1);
  }
});

test('the bounds themselves: every extreme stays in its room, convex, at weight', () => {
  // Every combination of the bounds' extremes and midpoints (vertex shifts at
  // -1, 0 and +1 for the triangle, -1 and +1 for the square), through the
  // module's own geometry, with the legibility floor applied.
  const R = [-12, -6, 0, 6, 12], K = [-0.18, -0.12, -0.06, 0.06, 0.12, 0.18], U = [0, 0.5, 1], S = [-1, 1];
  const worst = {centre: Infinity, baseline: Infinity};
  let minAngle = 180, cases = 0;
  const check = (shape, jitter) => {
    for (const rotate of R) for (const shear of K) for (const stretchU of U) for (const stretchSign of S) {
      const distorted = G.distort(shape, {rotate, shear, stretchU, stretchSign, jitter});
      if (shape !== 'circle') assert.ok(convex(distorted.points), `${shape} not convex`);
      if (shape === 'triangle') minAngle = Math.min(minAngle, ...G.angles(distorted.points));
      for (const align of A.aligns) {
        const placed = G.place(shape, distorted.points, align);
        const box = placed.measure.box;
        const maxY = align === 'baseline' ? BASELINE : SAFE.max;
        assert.ok(box.minX >= SAFE.min - 1e-9 && box.maxX <= SAFE.max + 1e-9 &&
                  box.minY >= SAFE.min - 1e-9 && box.maxY <= maxY + 1e-9, `${shape} ${align} leaves its room`);
        if (align === 'baseline') assert.ok(Math.abs(box.maxY - BASELINE) < 1e-9, `${shape} off the baseline`);
        const share = placed.measure.area / A.targetArea[shape];
        assert.ok(share <= 1 + 1e-9);
        if (shape === 'triangle') worst[align] = Math.min(worst[align], share);
        else assert.ok(share > 1 - 1e-9, `${shape} ${align} under its target: ${share}`);
        cases++;
      }
    }
  };
  check('circle', new Array(16).fill(0));
  const walk = (shape, count, values, jitter, i) => {
    if (i === count) return check(shape, jitter.slice());
    for (const v of values) { jitter[i] = v; walk(shape, count, values, jitter, i + 1); }
  };
  walk('square', 8, [-1, 1], new Array(16).fill(0), 0);
  walk('triangle', 6, [-1, 0, 1], new Array(16).fill(0), 0);
  assert.ok(cases > 300000);
  assert.ok(worst.centre >= TRIANGLE_FLOOR.centre, `triangle at ${worst.centre} of its target`);
  assert.ok(worst.baseline >= TRIANGLE_FLOOR.baseline, `triangle on the baseline at ${worst.baseline}`);
  assert.ok(minAngle >= 30, `triangle angle ${minAngle}`);
});

test('the outline never leaves the safe area, stays convex, and keeps its weight', () => {
  for (const seed of seeds) {
    for (const align of A.aligns) {
      const m = A.describe(seed, {align});
      const pts = ring(m);
      assert.ok(inside(pts, align === 'baseline' ? BASELINE : SAFE.max), `${seed} ${align}: outside`);
      assert.ok(convex(pts), `${seed}: not convex`);
      const target = A.targetArea[m.shape];
      assert.ok(m.area <= target * 1.001, `${seed}: area ${m.area}`);
      const floor = m.shape === 'triangle' ? TRIANGLE_FLOOR[align] : 0.999;
      assert.ok(m.area >= target * floor, `${seed}: ${m.shape} area ${m.area}`);
    }
  }
});

test('the legibility floor: almost no polygon stays close to its regular form', () => {
  let regular = 0, total = 0;
  for (const seed of seeds) {
    for (const shape of ['square', 'triangle']) {
      const m = A.describe(seed, {shape});
      total++;
      if (G.tooRegular(shape, points(m.d))) regular++;
      if (shape === 'triangle') {
        for (const angle of G.angles(points(m.d))) assert.ok(angle >= 30, `${seed}: angle ${angle}`);
      }
    }
  }
  assert.ok(regular / total < 0.002, `${regular} of ${total} still regular`);
  // The floor is applied deterministically: a seed that needs it, and what
  // it took, are part of the seed's description; the second step puts the
  // shear exactly at its ceiling.
  for (const shape of ['square', 'triangle']) {
    const floors = new Set();
    for (const seed of seeds.slice(0, 3000)) {
      const t = A.describe(seed, {shape}).distortion;
      floors.add(t.floor);
      if (t.floor === 'sheared') assert.equal(Math.abs(t.shear), BOUNDS.shear[1], `${seed} ${shape}`);
    }
    assert.deepEqual([...floors].sort(), ['mirrored', 'none', 'sheared'], shape);
  }
  // A plain rectangle counts as too regular, whatever its sides.
  assert.equal(G.tooRegular('square', [[0, 0], [30, 0], [30, 20], [0, 20]]), true);
  assert.equal(G.tooRegular('square', [[0, 0], [30, 0], [36, 20], [6, 20]]), false);
});

test('the undistorted start has the same commands, and stands where the mark stands', () => {
  for (const seed of seeds.slice(0, 1000)) {
    for (const align of A.aligns) {
      const m = A.describe(seed, {align});
      assert.equal(commands(m.base), commands(m.d));
      assert.equal(numbers(m.base).length, numbers(m.d).length);
      const outlineOfBase = ring({shape: m.shape, d: m.base});
      const xs = outlineOfBase.map(p => p[0]), ys = outlineOfBase.map(p => p[1]);
      if (align === 'baseline') assert.ok(Math.abs(Math.max(...ys) - BASELINE) < 0.02, `${seed} base off the baseline`);
      if (m.shape !== 'triangle') {
        assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 50) < 0.02, `${seed} base not centred`);
        if (align === 'centre') assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 50) < 0.02, `${seed}`);
      }
    }
  }
  assert.match(A.describe('x', {shape: 'circle'}).d, /^M [\d.]+ [\d.]+( C( [\d.]+){6}){4} Z$/);
  assert.match(A.describe('x', {shape: 'square'}).d, /^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+){3} Z$/);
  assert.match(A.describe('x', {shape: 'triangle'}).d, /^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+){2} Z$/);
});

test('pinning a shape or a colour leaves the rest of the seed unchanged', () => {
  for (const seed of seeds.slice(0, 300)) {
    const free = A.describe(seed);
    const pinned = A.describe(seed, {colour: 'blue'});
    assert.equal(pinned.colour, 'blue');
    assert.equal(pinned.d, free.d);
    assert.equal(pinned.shape, free.shape);
    const other = A.describe(seed, {shape: 'triangle'});
    assert.equal(other.colour, free.colour);
    assert.equal(other.distortion.rotate, free.distortion.rotate);
    assert.equal(A.describe(seed, {color: 'red'}).colour, 'red');
  }
  assert.throws(() => A.describe('x', {shape: 'hexagon'}), RangeError);
  assert.throws(() => A.describe('x', {colour: 'green'}), RangeError);
  assert.throws(() => A.describe('x', {align: 'top'}), RangeError);
});

test('restrained primaries: red and blue hold 4.5:1, yellow is the stated exception', () => {
  const lightGrounds = ['#ffffff', '#f6f4ef', A.grounds.paper];
  const darkGrounds = ['#000000', '#151515', A.grounds.ink, '#1e1e1e'];
  for (const g of lightGrounds) {
    assert.ok(contrast(A.palette.light.red, g) >= 4.5);
    assert.ok(contrast(A.palette.light.blue, g) >= 4.5);
    // A yellow that reaches 3:1 on paper is no longer yellow; the floor keeps
    // it from getting paler unnoticed, and the more-contrast ochre passes.
    assert.ok(contrast(A.palette.light.yellow, g) >= 1.85);
    assert.ok(contrast('#a87700', g) >= 3);
  }
  // As stated in the stylesheet and the README.
  assert.equal(contrast('#a87700', A.grounds.paper).toFixed(2), '3.45');
  assert.equal(contrast('#a87700', '#f6f4ef').toFixed(1), '3.6');
  for (const g of darkGrounds) {
    for (const c of A.colours) assert.ok(contrast(A.palette.dark[c], g) >= 4.5, `${c} on ${g}`);
  }
});

test('the stylesheet carries the same palette in every block', () => {
  const css = fs.readFileSync(path.join(ROOT, 'anvers-identity.css'), 'utf8');
  const tokens = body => Object.fromEntries([...body.matchAll(/--anvers-(red|yellow|blue):\s*(#[0-9a-f]{6})/g)]
    .map(m => [m[1], m[2]]));
  const block = (name, pattern) => {
    const m = pattern.exec(css);
    assert.ok(m, `${name} block not found`);
    return tokens(m[1]);
  };
  const pin = scheme => new RegExp(`\\[data-anvers-theme="${scheme}"\\] \\.anvers-identity,\\s*` +
    `\\.anvers-identity\\[data-anvers-theme="${scheme}"\\] \\{([^}]*)\\}`);
  assert.deepEqual(block('light default', /^\.anvers-identity \{([^}]*)\}/m), {...A.palette.light});
  assert.deepEqual(block('dark default', /@media \(prefers-color-scheme: dark\) \{\s*\.anvers-identity \{([^}]*)\}/),
                   {...A.palette.dark});
  assert.deepEqual(block('light pin', pin('light')), {...A.palette.light});
  assert.deepEqual(block('dark pin', pin('dark')), {...A.palette.dark});
  // Under prefers-contrast, only the light yellow changes.
  const more = [...css.matchAll(/--anvers-(red|yellow|blue):\s*(#[0-9a-f]{6})/g)].map(m => m[2])
    .filter(hex => ![...Object.values(A.palette.light), ...Object.values(A.palette.dark)].includes(hex));
  assert.deepEqual(more, ['#a87700', '#a87700']);
});

test('seeds: random, daily and given', () => {
  const fresh = new Set(Array.from({length: 400}, () => A.newSeed()));
  assert.equal(fresh.size, 400);
  for (const s of fresh) assert.match(s, /^[0-9a-hjkmnp-tv-z]{8}$/);
  // All 32 symbols are used (a missing one, by chance, has odds near 1e-43).
  assert.equal(new Set([...fresh].join('')).size, 32);
  assert.match(A.resolveSeed('random'), /^[0-9a-z]{8}$/);
  assert.match(A.resolveSeed(undefined), /^[0-9a-z]{8}$/);
  assert.match(A.resolveSeed('   '), /^[0-9a-z]{8}$/);
  assert.equal(A.resolveSeed(' k3f9q2xa '), 'k3f9q2xa');
  // Keywords are recognised after trimming, like seeds.
  assert.match(A.resolveSeed(' random '), /^[0-9a-z]{8}$/);
  assert.match(A.resolveSeed('daily\n'), /^day-\d{4}-\d\d-\d\d$/);
  assert.equal(A.resolveSeed(42), '42');
  assert.equal(A.describe('').seed, A.defaultSeed);
});

test('daily follows the local calendar, not UTC', () => {
  // In Los Angeles, 23:59 on 18 October is already 19 October in UTC.
  const out = execFileSync(process.execPath, ['-e', `
    const A = require(${JSON.stringify(path.join(ROOT, 'anvers-identity.js'))});
    process.stdout.write(A.resolveSeed('daily', new Date(2026, 9, 18, 23, 59)) + ' ' +
                         new Date(2026, 9, 18, 23, 59).toISOString().slice(0, 10));
  `], {encoding: 'utf8', env: {...process.env, TZ: 'America/Los_Angeles'}});
  assert.equal(out, 'day-2026-10-18 2026-10-19');
});

test('svg(): standalone, one accessible name or none, nothing active inside', () => {
  const named = A.svg('anvers');
  assert.match(named, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100"/);
  assert.match(named, /role="img" aria-label="Anvers"/);
  assert.doesNotMatch(named, /<title>/, 'one naming source only');
  const decorative = A.svg('anvers', {label: ''});
  assert.match(decorative, /aria-hidden="true"/);
  assert.doesNotMatch(decorative, /role=|aria-label/);
  assert.match(A.svg('anvers', {label: 'A & <B>'}), /aria-label="A &amp; &lt;B&gt;"/);
  assert.match(A.svg('anvers', {background: 'paper', size: 1024}), /width="1024" height="1024".*<rect width="100" height="100" fill="#f3efe6"\/>/);
  assert.ok(A.svg('anvers', {scheme: 'dark'}).includes(`fill="${A.describe('anvers').fill.dark}"`));
  // Absent options, however written, mean the default.
  for (const empty of [undefined, null, '']) {
    assert.equal(A.svg('anvers', {background: empty, size: empty}), A.svg('anvers'));
  }
  for (const bad of ['plaid', 'toString', 'constructor', '__proto__']) {
    assert.throws(() => A.svg('anvers', {background: bad}), RangeError, bad);
  }
  for (const bad of ['abc', -5, 0, Infinity]) assert.throws(() => A.svg('anvers', {size: bad}), RangeError, String(bad));
  for (const seed of seeds.slice(0, 200)) {
    assert.doesNotMatch(A.svg(seed), /<script|\son\w+=|href=|url\(|<foreignObject|<style/i);
  }
});

test('svg(): hostile or awkward seeds stay inert and round-trip', () => {
  const hostile = A.svg('x" onload="alert(1)');
  assert.doesNotMatch(hostile, /\son\w+="alert/);
  assert.ok(hostile.includes('data-anvers-seed="x&quot; onload=&quot;alert(1)"'));
  assert.doesNotMatch(A.svg('<script>&'), /<script/);
  // Whitespace inside a seed survives as character references, so the seed
  // read back from the file draws the same mark.
  const lines = A.svg('a\tb\nc');
  assert.ok(lines.includes('data-anvers-seed="a&#9;b&#10;c"'));
  // Characters XML cannot carry are refused rather than written.
  for (const bad of ['a\u0001b', 'a\uFFFEb', 'a\uFFFFb', 'a\uD800b', 'a\uDC00']) {
    assert.throws(() => A.svg(bad), RangeError, JSON.stringify(bad));
    assert.throws(() => A.svg('anvers', {label: bad}), RangeError, JSON.stringify(bad));
  }
  assert.doesNotThrow(() => A.svg('emoji \uD83D\uDFE6'));
  assert.doesNotThrow(() => A.svg('na\u00efve \u00bfqu\u00e9? \u00be'));
});

test('the static files are the default seed, drawn by svg()', () => {
  const html = fs.readFileSync(path.join(ROOT, 'demo', 'index.html'), 'utf8');
  assert.ok(html.includes(A.svg(A.defaultSeed, {label: '', size: 160, align: 'baseline'})),
    'demo/index.html: regenerate the static mark (see README)');
  const file = fs.readFileSync(path.join(ROOT, 'anvers-default.svg'), 'utf8').trim();
  assert.equal(file, A.svg(A.defaultSeed));
});

test('the module loads as CommonJS, as an ES module, and through its exports map', async () => {
  const esm = await import(path.join(ROOT, 'anvers-identity.mjs'));
  assert.equal(esm.default.describe('anvers').d, A.describe('anvers').d);
  assert.equal(typeof esm.render, 'function');
  // Resolution by the package's own name goes through "exports".
  for (const [sub, file] of [['', 'anvers-identity.js'], ['/anvers-identity.js', 'anvers-identity.js'],
                             ['/anvers-identity.mjs', 'anvers-identity.mjs'], ['/anvers-identity.css', 'anvers-identity.css'],
                             ['/anvers-default.svg', 'anvers-default.svg'], ['/package.json', 'package.json']]) {
    assert.equal(require.resolve(`anvers-identity${sub}`), path.join(ROOT, file), sub || '.');
  }
  const named = await import('anvers-identity');
  assert.equal(named.default, esm.default);
});

test('the command line: seeds, options, the README example, errors', () => {
  assert.equal(cli(['anvers']).stdout.trim(), A.svg('anvers'));
  const readme = cli(['k3f9q2xa', '--background', 'paper', '--size', '1024']);
  assert.equal(readme.status, 0);
  assert.equal(readme.stdout.trim(), A.svg('k3f9q2xa', {background: 'paper', size: 1024}));
  assert.equal(cli(['anvers', '--align=baseline', '--colour', 'red', '--scheme', 'dark']).stdout.trim(),
               A.svg('anvers', {align: 'baseline', colour: 'red', scheme: 'dark'}));
  const json = JSON.parse(cli(['anvers', '--json', '--shape', 'circle']).stdout);
  assert.equal(json.shape, 'circle');
  // Without a seed, or with 'random' or 'daily', the seed drawn is reported
  // and the output is that seed's mark.
  for (const args of [[], ['random'], ['daily']]) {
    const run = cli(args);
    const seed = /^seed (\S+)$/m.exec(run.stderr)[1];
    assert.equal(run.stdout.trim(), A.svg(seed), args.join(' '));
  }
  assert.match(cli(['daily']).stderr, /^seed day-\d{4}-\d\d-\d\d$/m);
  for (const args of [['anvers', '--size', 'abc'], ['anvers', '--background', 'toString'],
                      ['anvers', '--shape', 'hexagon'], ['anvers', '--bogus'], ['a', 'b']]) {
    const run = cli(args);
    assert.equal(run.status, 2, args.join(' '));
    assert.equal(run.stdout, '');
  }
  const mode = fs.statSync(CLI).mode;
  assert.ok(mode & 0o111, 'bin/anvers-mark.js is executable');
});

test('the source stays dependency-free, CSP-safe and ASCII', () => {
  // ASCII only, so that the script means the same on a page in any encoding.
  for (const file of ['anvers-identity.js', 'anvers-identity.mjs', 'anvers-identity.css', 'bin/anvers-mark.js',
                      'test/unit.test.js', 'test/browser.test.mjs', 'demo/demo.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), 'latin1'), /[^\x00-\x7F]/, file);
  }
  const src = fs.readFileSync(path.join(ROOT, 'anvers-identity.js'), 'utf8');
  assert.doesNotMatch(src, /\brequire\(|\bimport\s|\beval\(|new Function|innerHTML|outerHTML|insertAdjacentHTML|document\.write|setAttribute\('style'/);
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/);
});
