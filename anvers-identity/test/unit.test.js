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
                             ['/anvers-default.svg', 'anvers-default.svg'], ['/package.json', 'package.json'],
                             ['/anvers-themes.js', 'anvers-themes.js']]) {
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
                      'anvers-themes.js', 'bin/anvers-themes.js',
                      'test/unit.test.js', 'test/browser.test.mjs', 'demo/demo.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), 'latin1'), /[^\x00-\x7F]/, file);
  }
  const src = fs.readFileSync(path.join(ROOT, 'anvers-identity.js'), 'utf8');
  assert.doesNotMatch(src, /\brequire\(|\bimport\s|\beval\(|new Function|innerHTML|outerHTML|insertAdjacentHTML|document\.write|setAttribute\('style'/);
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/);
});

// ---- Browser themes ------------------------------------------------------

const os = require('node:os');
const T = require('../anvers-themes.js');
const THEMES_DIR = path.join(ROOT, 'themes');

// Everything below reads the committed manifests, the files Chromium loads,
// and checks them with this file's own lists and arithmetic rather than the
// module's, so that a fault in the module or the generator cannot pass.

// Chromium's theme colour keys: kOverwritableColorTable in
// chrome/browser/themes/browser_theme_pack.cc (141.0.7390.37).
const CHROMIUM_COLOR_KEYS = new Set([
  'background_tab', 'background_tab_inactive', 'background_tab_incognito',
  'background_tab_incognito_inactive', 'bookmark_text', 'button_background', 'frame',
  'frame_inactive', 'frame_incognito', 'frame_incognito_inactive', 'ntp_background', 'ntp_header',
  'ntp_link', 'ntp_text', 'omnibox_background', 'omnibox_text', 'tab_background_text',
  'tab_background_text_inactive', 'tab_background_text_incognito',
  'tab_background_text_incognito_inactive', 'tab_text', 'toolbar', 'toolbar_button_icon', 'toolbar_text',
]);

// What each text and icon sits on in Chromium 141 (not checked against 158):
// a key; [keys] for a key with a fallback (a background tab is filled with
// background_tab, or else the frame); or {over, under, share} for the fills
// Chromium mixes (a hovered background tab 40% toolbar over the tab fill, a
// selected tab 75%, a hovered selected tab 85%). The new-tab button of an
// unfocused window is the icon colour at 0x6E/255 over the unfocused tab fill.
// The address bar's security chip reuses the address text colour on the
// toolbar colour; '#5f6368' is Chromium's fixed grey globe for a page without
// an icon.
const TAB_FILL = ['background_tab', 'frame'], TAB_FILL_UNFOCUSED = ['background_tab_inactive', 'frame_inactive'];
const THEME_STATES = [
  ['toolbar text', 'toolbar_text', 'toolbar', 4.5],
  ['active tab text', 'tab_text', 'toolbar', 4.5],
  ['bookmark text', 'bookmark_text', 'toolbar', 4.5],
  ['toolbar icons', 'toolbar_button_icon', 'toolbar', 3],
  ['address text', 'omnibox_text', 'omnibox_background', 4.5],
  ['address bar chip text', 'omnibox_text', 'toolbar', 4.5, 'reused'],
  ['globe on the active tab', '#5f6368', 'toolbar', 3],
  ['background tab text', 'tab_background_text', TAB_FILL, 4.5],
  ['globe on a background tab', '#5f6368', TAB_FILL, 3],
  ['globe on a hovered background tab', '#5f6368', {over: 'toolbar', under: TAB_FILL, share: 0.4}, 3],
  ['globe on a selected tab', '#5f6368', {over: 'toolbar', under: TAB_FILL, share: 0.75}, 3],
  ['globe on a hovered selected tab', '#5f6368', {over: 'toolbar', under: TAB_FILL, share: 0.85}, 3],
  ['hovered background tab text', 'tab_background_text', {over: 'toolbar', under: TAB_FILL, share: 0.4}, 4.5],
  ['selected tab text', 'tab_text', {over: 'toolbar', under: TAB_FILL, share: 0.75}, 4.5],
  ['hovered selected tab text', 'tab_background_text', {over: 'toolbar', under: TAB_FILL, share: 0.85}, 4.5],
  ['background tab text, unfocused window', 'tab_background_text_inactive', TAB_FILL_UNFOCUSED, 4.5],
  ['hovered background tab text, unfocused window', 'tab_background_text_inactive', {over: 'toolbar', under: TAB_FILL_UNFOCUSED, share: 0.4}, 4.5],
  ['selected tab text, unfocused window', 'tab_text', {over: 'toolbar', under: TAB_FILL_UNFOCUSED, share: 0.75}, 4.5],
  ['hovered selected tab text, unfocused window', 'tab_background_text_inactive', {over: 'toolbar', under: TAB_FILL_UNFOCUSED, share: 0.85}, 4.5],
  ['new-tab button, unfocused window', {over: 'toolbar_button_icon', under: TAB_FILL_UNFOCUSED, share: 0x6E / 255}, TAB_FILL_UNFOCUSED, 3],
  ['globe on a background tab, unfocused window', '#5f6368', TAB_FILL_UNFOCUSED, 3],
  ['globe on a hovered background tab, unfocused window', '#5f6368', {over: 'toolbar', under: TAB_FILL_UNFOCUSED, share: 0.4}, 3],
  ['globe on a selected tab, unfocused window', '#5f6368', {over: 'toolbar', under: TAB_FILL_UNFOCUSED, share: 0.75}, 3],
  ['globe on a hovered selected tab, unfocused window', '#5f6368', {over: 'toolbar', under: TAB_FILL_UNFOCUSED, share: 0.85}, 3],
];
const fixedColour = ([, fg]) => typeof fg === 'string' && fg.startsWith('#');

function readManifest(folder) {
  return JSON.parse(fs.readFileSync(path.join(THEMES_DIR, folder, 'manifest.json'), 'utf8'));
}
// The colours a committed manifest gives Chromium, as lower-case hex.
function shipped(folder) {
  const colors = {};
  for (const [key, value] of Object.entries(readManifest(folder).theme.colors)) {
    colors[key] = '#' + value.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  return colors;
}
function colourOf(colors, spec) {
  if (typeof spec === 'string') return spec.startsWith('#') ? spec : colors[spec];
  if (Array.isArray(spec)) return spec.map(k => colors[k]).find(Boolean);
  const over = colourOf(colors, spec.over), under = colourOf(colors, spec.under);
  if (!over || !under) return undefined;
  const a = [1, 3, 5].map(i => parseInt(over.slice(i, i + 2), 16));
  const b = [1, 3, 5].map(i => parseInt(under.slice(i, i + 2), 16));
  return '#' + a.map((v, i) => Math.round(spec.share * v + (1 - spec.share) * b[i]).toString(16).padStart(2, '0')).join('');
}
// [state, ratio, min] for every state the colours determine.
function statesOf(colors) {
  return THEME_STATES.map(([state, fg, bg, min]) => [state, colourOf(colors, fg), colourOf(colors, bg), min])
    .filter(([, fg, bg]) => fg && bg).map(([state, fg, bg, min]) => [state, contrast(fg, bg), min]);
}
const shippedStates = folder => statesOf(shipped(folder));
// Whether no colour for a derived state's foreground key (one Chromium mixes,
// or reuses on another fill) holds that state and the key's primary states
// together, the other colours staying as they are: then the state is
// accepted as the composition's, not the theme's choice of that colour. The
// search tries all 16,777,216 colours a manifest can hold. A primary state
// never qualifies.
const unmixed = spec => typeof spec === 'string' || Array.isArray(spec);
const primary = ([, fg, bg, , use]) => unmixed(fg) && unmixed(bg) && use !== 'reused';
function noColourHolds(colors, state) {
  const row = THEME_STATES.find(s => s[0] === state);
  const fg = row[1];
  if (primary(row)) return false;
  const key = unmixed(fg) ? fg : fg.over;
  const relevant = THEME_STATES.filter(s => s[0] === state || (s[1] === key && primary(s)))
    .filter(([, , bg]) => colourOf(colors, bg));
  // For each row: what a value of each channel adds to the foreground's
  // relative luminance, and the luminances the foreground must stay outside.
  const decode = v => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const checks = relevant.map(([, f, k, min]) => {
    const bgLum = luminance(colourOf(colors, k));
    const base = unmixed(f) ? null : colourOf(colors, f.under);
    const part = (channel, weight) => {
      const out = new Float64Array(256);
      for (let v = 0; v < 256; v++) {
        const value = base ? Math.round(f.share * v + (1 - f.share) * parseInt(base.slice(1 + 2 * channel, 3 + 2 * channel), 16)) : v;
        out[v] = weight * decode(value);
      }
      return out;
    };
    return [part(0, 0.2126), part(1, 0.7152), part(2, 0.0722), (bgLum + 0.05) / min - 0.05, min * (bgLum + 0.05) - 0.05];
  });
  for (let colour = 0; colour < 1 << 24; colour++) {
    const r = colour >> 16, g = (colour >> 8) & 255, b = colour & 255;
    if (checks.every(([pr, pg, pb, darkest, lightest]) => {
      const y = pr[r] + pg[g] + pb[b];
      return y <= darkest || y >= lightest;
    })) return false;
  }
  return true;
}
function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anvers-themes-'));
  try { return fn(dir); } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

test('themes: the committed folders are exactly what the generator writes', () => {
  const folders = fs.readdirSync(THEMES_DIR, {withFileTypes: true}).filter(d => d.isDirectory()).map(d => d.name).sort();
  assert.deepEqual(folders, T.THEMES.map(t => t.folder).sort());
  for (const folder of folders) assert.deepEqual(fs.readdirSync(path.join(THEMES_DIR, folder)), ['manifest.json'], folder);
  withTempDir(dir => {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'bin', 'anvers-themes.js'), dir], {encoding: 'utf8'});
    assert.match(out, /4 themes written/);
    assert.doesNotMatch(out, /FAIL/);
    assert.deepEqual(fs.readdirSync(dir).sort(), folders);
    for (const folder of folders) {
      assert.deepEqual(fs.readdirSync(path.join(dir, folder)), ['manifest.json'], folder);
      assert.equal(fs.readFileSync(path.join(dir, folder, 'manifest.json'), 'utf8'),
                   fs.readFileSync(path.join(THEMES_DIR, folder, 'manifest.json'), 'utf8'),
                   `${folder}: regenerate with node bin/anvers-themes.js`);
    }
  });
});

test('themes: by default the generator writes into its own themes folder', () => {
  withTempDir(dir => {
    fs.mkdirSync(path.join(dir, 'bin'));
    for (const file of ['anvers-identity.js', 'anvers-themes.js', 'bin/anvers-themes.js']) {
      fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
    }
    execFileSync(process.execPath, [path.join(dir, 'bin', 'anvers-themes.js')], {cwd: os.tmpdir(), encoding: 'utf8'});
    for (const theme of T.THEMES) {
      assert.equal(fs.readFileSync(path.join(dir, 'themes', theme.folder, 'manifest.json'), 'utf8'),
                   fs.readFileSync(path.join(THEMES_DIR, theme.folder, 'manifest.json'), 'utf8'), theme.folder);
    }
  });
});

test('themes: the generator refuses a failing theme, or a limitation that is not one, and writes nothing', () => {
  withTempDir(dir => {
    // A copy of the module whose ink theme has yellow icons on its paper toolbar.
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.copyFileSync(path.join(ROOT, 'anvers-identity.js'), path.join(dir, 'anvers-identity.js'));
    fs.copyFileSync(path.join(ROOT, 'bin', 'anvers-themes.js'), path.join(dir, 'bin', 'anvers-themes.js'));
    const src = fs.readFileSync(path.join(ROOT, 'anvers-themes.js'), 'utf8');
    const broken = src.replace('toolbar: PAPER, text: INK, icons: LIGHT.red', 'toolbar: PAPER, text: INK, icons: LIGHT.yellow');
    assert.notEqual(broken, src);
    fs.writeFileSync(path.join(dir, 'anvers-themes.js'), broken);
    const target = path.join(dir, 'out');
    const run = spawnSync(process.execPath, [path.join(dir, 'bin', 'anvers-themes.js'), target], {encoding: 'utf8'});
    assert.equal(run.status, 1);
    assert.match(run.stdout, /FAIL toolbar icons: #e0a817 on #f3efe6, 1\.\d\d:1/);
    assert.match(run.stderr, /nothing written/);
    assert.equal(fs.existsSync(target), false);
    // A limitation named for a state that holds; and one named for a hovered
    // tab whose grey text fails where white would hold.
    const ink = "    colors: bauhaus({frame: INK, inactive: INK, toolbar: PAPER, text: INK, icons: LIGHT.red}),\n    limitations: {";
    for (const [edits, said] of [
      [[[ink, ink + "\n      'toolbar text': LIGHT_ON_LIGHT,"]], /FAIL toolbar text: [^\n]*\n\s+named as a limitation, but it holds/],
      [[[ink, ink + "\n      'hovered background tab text': LIGHT_ON_LIGHT,"],
        ['    tab_background_text: WHITE,\n', "    tab_background_text: '#d0d0d0',\n"]],
       /FAIL hovered background tab text: #d0d0d0 [^\n]*\n\s+named as a limitation, but a colour could hold it/],
    ]) {
      let changed = src;
      for (const [from, to] of edits) {
        assert.equal(changed.split(from).length, 2, from);
        changed = changed.replace(from, to);
      }
      fs.writeFileSync(path.join(dir, 'anvers-themes.js'), changed);
      const again = spawnSync(process.execPath, [path.join(dir, 'bin', 'anvers-themes.js'), target], {encoding: 'utf8'});
      assert.equal(again.status, 1, String(said));
      assert.match(again.stdout, said);
      assert.equal(fs.existsSync(target), false);
    }
  });
});

test('themes: colour-only manifests, Chromium keys only, nothing Chromium ignores', () => {
  for (const theme of T.THEMES) {
    const m = readManifest(theme.folder);
    assert.deepEqual(Object.keys(m), ['manifest_version', 'name', 'version', 'description', 'theme']);
    assert.equal(m.manifest_version, 3);
    assert.match(m.version, /^\d+\.\d+\.\d+$/);
    assert.deepEqual(Object.keys(m.theme), ['colors'], 'no images, tints or properties');
    for (const [key, value] of Object.entries(m.theme.colors)) {
      assert.ok(CHROMIUM_COLOR_KEYS.has(key), `${theme.folder}: ${key} is not a Chromium theme colour`);
      assert.ok(!key.startsWith('ntp_'), `${theme.folder}: ${key} is a New Tab page key`);
      // Chromium 141 does not theme private windows (browser_frame.cc).
      assert.ok(!key.includes('incognito'), `${theme.folder}: ${key} is never painted`);
      assert.ok(Array.isArray(value) && value.length === 3 &&
                value.every(v => Number.isInteger(v) && v >= 0 && v <= 255), `${theme.folder}: ${key}`);
    }
    // The table and the file Chromium loads agree, key for key.
    assert.deepEqual(shipped(theme.folder), theme.colors, theme.folder);
  }
  for (const key of T.KEYS) assert.ok(CHROMIUM_COLOR_KEYS.has(key), key);
});

test('themes: every text holds 4.5:1 and every icon 3:1 in each modelled state, bar imposed limitations', () => {
  for (const theme of T.THEMES) {
    const rows = shippedStates(theme.folder);
    const failing = rows.filter(([, ratio, min]) => ratio < min).map(([state]) => state);
    if (theme.role === 'reference') {
      // Only the reported keys are set; Chromium derives the rest.
      assert.equal(rows.length, 16, theme.folder);
    } else {
      assert.equal(rows.length, THEME_STATES.length, `${theme.folder}: every state is determined`);
    }
    // A failure is allowed only where the theme names it as a limitation,
    // with its reason, and no colour could hold that state; or where the
    // foreground is a colour Chromium fixes, which no theme names. A named
    // limitation that passes is stale.
    const fixed = new Set(THEME_STATES.filter(fixedColour).map(([state]) => state));
    assert.deepEqual(failing.filter(state => !fixed.has(state)).sort(), Object.keys(theme.limitations).sort(), theme.folder);
    for (const [state, reason] of Object.entries(theme.limitations)) {
      assert.ok(!fixed.has(state), `${theme.folder}: ${state} is Chromium's, not named`);
      assert.ok(noColourHolds(shipped(theme.folder), state), `${theme.folder}: ${state} is the theme's to fix`);
      assert.ok(typeof reason === 'string' && reason.length > 20, `${theme.folder}: ${state} needs its reason`);
    }
    // The generator reports the same states, with the same verdicts.
    const reported = T.check(theme);
    assert.deepEqual(reported.map(r => r.state), rows.map(([state]) => state), theme.folder);
    for (const [i, [state, ratio, min]] of rows.entries()) {
      assert.equal(reported[i].ratio, Math.round(ratio * 100) / 100, `${theme.folder}: ${state}`);
      assert.equal(reported[i].status, ratio >= min ? 'ok' : fixed.has(state) ? 'fixed' : 'limitation', `${theme.folder}: ${state}`);
    }
  }
  // The search tells a limitation from a choice: under 0.5.2's blue frame and
  // yellow toolbar no text colour holds a hovered background tab, while under
  // the identity's own blue and yellow white text does.
  const blue052 = {...shipped('anvers-bauhaus'), frame: '#1d4f9e', background_tab: '#1d4f9e', tab_background_text: '#f4f1ea',
    toolbar: '#f2c319', toolbar_text: '#111111', tab_text: '#111111', bookmark_text: '#111111', toolbar_button_icon: '#b32218'};
  assert.equal(noColourHolds(blue052, 'hovered background tab text'), true);
  const ownColours = {...blue052, frame: '#1f4e99', background_tab: '#1f4e99', toolbar: '#e0a817'};
  assert.equal(noColourHolds(ownColours, 'hovered background tab text'), false);
  assert.equal(noColourHolds(shipped('anvers-bauhaus'), 'toolbar icons'), false, 'a primary state is never a limitation');
  assert.equal(noColourHolds(shipped('anvers-bauhaus'), 'address text'), false, 'a primary state is never a limitation');
  // The chip: dark text on the white field cannot also read on a dark
  // toolbar, but on a light one it can.
  assert.equal(noColourHolds(shipped('anvers-bauhaus'), 'address bar chip text'), true);
  assert.equal(noColourHolds(shipped('anvers-bauhaus-ink'), 'address bar chip text'), false);
});

test('themes: the search for a holding colour is exhaustive, in the module and here', () => {
  // A review's case: on a near-black toolbar, only colours with a luminance
  // between 0.18326 and 0.18333 hold both the chip and the address text,
  // #0079d2 among them; a coarse grid misses every one.
  const narrow = {
    frame: '#000000', frame_inactive: '#000000', toolbar: '#00070e', toolbar_text: '#ffffff',
    toolbar_button_icon: '#ffffff', tab_text: '#ffffff', tab_background_text: '#ffffff',
    tab_background_text_inactive: '#ffffff', bookmark_text: '#ffffff', omnibox_background: '#ffffff', omnibox_text: '#111111',
  };
  const held = statesOf({...narrow, omnibox_text: '#0079d2'});
  for (const state of ['address text', 'address bar chip text']) {
    const [, ratio, min] = held.find(([name]) => name === state);
    assert.ok(ratio >= min, state);
  }
  assert.equal(noColourHolds(narrow, 'address bar chip text'), false);
  assert.equal(T.imposed({colors: narrow, limitations: {}}, 'address bar chip text'), false);
  // A mixed foreground: under the default's blue toolbar, light icons hold
  // the dimmed new-tab button of an unfocused window as well as the toolbar.
  const greyIcons = {...shipped('anvers-bauhaus'), toolbar_button_icon: '#405060'};
  assert.equal(noColourHolds(greyIcons, 'new-tab button, unfocused window'), false);
  assert.equal(T.imposed({colors: greyIcons, limitations: {}}, 'new-tab button, unfocused window'), false);
  // And where nothing holds, both say so.
  assert.equal(T.imposed(T.THEMES[0], 'hovered selected tab text'), true);
  assert.equal(noColourHolds(shipped('anvers-bauhaus'), 'hovered selected tab text'), true);
});

test('themes: the default is Codex\'s theme 0.5.4, without ntp_* keys; the reference is 0.5.0', () => {
  const defaults = T.THEMES.filter(t => t.role === 'default');
  assert.equal(defaults.length, 1);
  // Codex's report of the installed 0.5.4 theme.colors, on the pull request
  // (19 October 2026), less ntp_background, ntp_text, ntp_link and ntp_header.
  assert.deepEqual(shipped(defaults[0].folder), {
    frame: '#f2c319', frame_inactive: '#111111', background_tab: '#f2c319', background_tab_inactive: '#111111',
    toolbar: '#1d4f9e', toolbar_text: '#f4f1ea', toolbar_button_icon: '#f4f1ea', button_background: '#1d4f9e',
    tab_text: '#f4f1ea', tab_background_text: '#111111', tab_background_text_inactive: '#f4f1ea',
    bookmark_text: '#f4f1ea', omnibox_background: '#ffffff', omnibox_text: '#111111',
  });
  // The alternatives recombine the identity's colours, and white: an ink
  // frame under a paper toolbar with red icons, and under a yellow toolbar
  // with blue icons; white text on the frame, ink on the toolbar.
  const {red, yellow, blue} = A.palette.light, {paper, ink} = A.grounds;
  const alternative = (toolbar, icons) => ({
    frame: ink, frame_inactive: ink, toolbar, toolbar_text: ink, toolbar_button_icon: icons, tab_text: ink,
    tab_background_text: '#ffffff', tab_background_text_inactive: '#ffffff', bookmark_text: ink,
    omnibox_background: '#ffffff', omnibox_text: ink,
  });
  assert.deepEqual(shipped('anvers-bauhaus-ink'), alternative(paper, red));
  assert.deepEqual(shipped('anvers-bauhaus-yellow'), alternative(yellow, blue));
  assert.deepEqual(T.THEMES.map(t => t.role), ['default', 'alternative', 'alternative', 'reference']);
  const ref = T.THEMES.find(t => t.role === 'reference');
  assert.deepEqual(shipped(ref.folder), {
    frame: '#1d4f9e', frame_inactive: '#111111', toolbar: '#f4f1ea', toolbar_text: '#111111',
    tab_text: '#111111', bookmark_text: '#111111', omnibox_background: '#ffffff', omnibox_text: '#111111',
  });
});
