// Unit tests: no dependency beyond Node (18 or later). Run from
// anvers-identity/ with: node --test test/unit.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const A = require('../anvers-identity.js');

const ROOT = path.join(__dirname, '..');
const SWEEP = 6000;
const seeds = Array.from({length: SWEEP}, (_, i) => `sweep-${i}`);

// Points of a path as written: M/L/C coordinates, in order.
function numbers(d) {
  return (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
}
function commands(d) {
  return d.replace(/[^MLCZ]/g, '');
}
// Outline points: polygon vertices, or the circle's curves sampled finely.
function ring(mark) {
  const n = numbers(mark.d);
  const pts = [];
  for (let i = 0; i < n.length; i += 2) pts.push([n[i], n[i + 1]]);
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
function luminance(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('the same seed always gives the same mark, byte for byte', () => {
  for (const seed of ['anvers', 'k3f9q2xa', 'Nadar', '1919', ' padded ']) {
    assert.deepEqual(A.describe(seed), A.describe(seed));
    assert.equal(A.svg(seed), A.svg(seed));
  }
  assert.equal(A.describe(' padded ').seed, 'padded');
  assert.equal(A.describe(1919).d, A.describe('1919').d);
});

test('golden marks: grammar 1 draws these seeds exactly so', () => {
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
  assert.equal(golden.grammar, A.grammar,
    'the grammar changed: regenerate test/golden.json on purpose (see README)');
  for (const [seed, expected] of Object.entries(golden.marks)) {
    const mark = A.describe(seed);
    assert.deepEqual({shape: mark.shape, colour: mark.colour, d: mark.d}, expected, `seed ${seed}`);
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
  const svg = A.svg('anvers');
  assert.equal((svg.match(/<path/g) || []).length, 1, 'exactly one shape');
});

test('distortion stays between its floor and its ceiling', () => {
  const b = A.bounds;
  for (const seed of seeds) {
    const {distortion: t, shape} = A.describe(seed);
    assert.ok(t.rotate >= b.rotate[0] && t.rotate <= b.rotate[1], `rotate ${t.rotate}`);
    assert.ok(Math.abs(t.shear) >= b.shear[0] - 1e-3 && Math.abs(t.shear) <= b.shear[1] + 1e-3, `shear ${t.shear}`);
    const aspect = Math.max(t.stretch, 1 / t.stretch);
    assert.ok(aspect >= b.stretch[0] - 1e-3 && aspect <= b.stretch[1] + 1e-3, `stretch ${t.stretch}`);
    assert.equal(t.jitter.length, shape === 'circle' ? 16 : shape === 'square' ? 8 : 6);
    for (const j of t.jitter) assert.ok(Math.abs(j) <= 1);
  }
});

test('the outline never leaves the safe area, and stays convex', () => {
  for (const seed of seeds) {
    const m = A.describe(seed);
    const pts = ring(m);
    for (const [x, y] of pts) {
      assert.ok(x >= A.safe.min - 0.01 && x <= A.safe.max + 0.01, `${seed}: x ${x}`);
      assert.ok(y >= A.safe.min - 0.01 && y <= A.safe.max + 0.01, `${seed}: y ${y}`);
    }
    assert.ok(convex(pts), `${seed}: not convex`);
  }
});

test('visual weight: the area sits at its target, triangles at most 25% under', () => {
  for (const seed of seeds) {
    const m = A.describe(seed);
    const target = A.targetArea[m.shape];
    assert.ok(m.area <= target * 1.001, `${seed}: area ${m.area}`);
    const floor = m.shape === 'triangle' ? 0.75 : 0.999;
    assert.ok(m.area >= target * floor, `${seed}: ${m.shape} area ${m.area}`);
  }
});

test('triangles keep every angle at 30 degrees or more', () => {
  for (const seed of seeds) {
    const m = A.describe(seed, {shape: 'triangle'});
    const n = numbers(m.d);
    const p = [[n[0], n[1]], [n[2], n[3]], [n[4], n[5]]];
    for (let i = 0; i < 3; i++) {
      const a = p[i], b = p[(i + 1) % 3], c = p[(i + 2) % 3];
      const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - a[0], c[1] - a[1]];
      const cos = (u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v);
      assert.ok(Math.acos(cos) * 180 / Math.PI >= 30, `${seed}: angle`);
    }
  }
});

test('the undistorted start has the same commands, so CSS can interpolate it', () => {
  for (const seed of seeds.slice(0, 1000)) {
    const m = A.describe(seed);
    assert.equal(commands(m.base), commands(m.d));
    assert.equal(numbers(m.base).length, numbers(m.d).length);
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
});

test('restrained primaries: red and blue hold 3:1, yellow is the stated exception', () => {
  const lightGrounds = ['#ffffff', '#f6f4ef', A.grounds.paper];
  const darkGrounds = ['#000000', '#151515', A.grounds.ink, '#1e1e1e'];
  for (const g of lightGrounds) {
    assert.ok(contrast(A.palette.light.red, g) >= 4.5);
    assert.ok(contrast(A.palette.light.blue, g) >= 4.5);
    // A yellow that reaches 3:1 on paper is no longer yellow; the floor keeps
    // it from getting paler unnoticed.
    assert.ok(contrast(A.palette.light.yellow, g) >= 1.85);
  }
  for (const g of darkGrounds) {
    for (const c of A.colours) assert.ok(contrast(A.palette.dark[c], g) >= 4.5, `${c} on ${g}`);
  }
  const css = fs.readFileSync(path.join(ROOT, 'anvers-identity.css'), 'utf8');
  for (const scheme of ['light', 'dark']) {
    for (const c of A.colours) assert.ok(css.includes(A.palette[scheme][c]), `${scheme} ${c} in the CSS`);
  }
});

test('seeds: random, daily and given', () => {
  const fresh = new Set(Array.from({length: 200}, () => A.newSeed()));
  assert.equal(fresh.size, 200);
  for (const s of fresh) assert.match(s, /^[0-9a-hjkmnp-tv-z]{8}$/);
  assert.match(A.resolveSeed('random'), /^[0-9a-z]{8}$/);
  assert.match(A.resolveSeed(undefined), /^[0-9a-z]{8}$/);
  assert.match(A.resolveSeed('   '), /^[0-9a-z]{8}$/);
  assert.equal(A.resolveSeed('daily', new Date(2026, 9, 18, 23, 59)), 'day-2026-10-18');
  assert.equal(A.resolveSeed(' k3f9q2xa '), 'k3f9q2xa');
  assert.equal(A.resolveSeed(42), '42');
  assert.equal(A.describe('').seed, A.defaultSeed);
});

test('svg(): standalone, labelled or decorative, nothing active inside', () => {
  const named = A.svg('anvers');
  assert.match(named, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100"/);
  assert.match(named, /role="img" aria-label="Anvers"/);
  assert.match(named, /<title>Anvers<\/title>/);
  const decorative = A.svg('anvers', {label: ''});
  assert.match(decorative, /aria-hidden="true"/);
  assert.doesNotMatch(decorative, /role=|<title>/);
  assert.match(A.svg('anvers', {label: 'A & <B>'}), /aria-label="A &amp; &lt;B&gt;"/);
  assert.match(A.svg('anvers', {background: 'paper', size: 1024}), /width="1024" height="1024".*<rect width="100" height="100" fill="#f3efe6"\/>/);
  assert.ok(A.svg('anvers', {scheme: 'dark'}).includes(`fill="${A.describe('anvers').fill.dark}"`));
  assert.throws(() => A.svg('anvers', {background: 'plaid'}), RangeError);
  for (const seed of seeds.slice(0, 200)) {
    const text = A.svg(seed);
    assert.doesNotMatch(text, /<script|\son\w+=|href=|url\(|<foreignObject|<style/i);
  }
});

test('the static fallback in the demo is the default seed, drawn by svg()', () => {
  const html = fs.readFileSync(path.join(ROOT, 'demo', 'index.html'), 'utf8');
  assert.ok(html.includes(A.svg(A.defaultSeed, {label: ''})),
    'demo/index.html: regenerate the static mark with bin/anvers-mark.js (see README)');
  const file = fs.readFileSync(path.join(ROOT, 'anvers-default.svg'), 'utf8').trim();
  assert.equal(file, A.svg(A.defaultSeed));
});

test('the module loads as CommonJS, as an ES module and from the command line', async () => {
  const esm = await import(path.join(ROOT, 'anvers-identity.mjs'));
  assert.equal(esm.default.describe('anvers').d, A.describe('anvers').d);
  assert.equal(typeof esm.render, 'function');
  const out = execFileSync(process.execPath, [path.join(ROOT, 'bin', 'anvers-mark.js'), 'anvers'], {encoding: 'utf8'});
  assert.equal(out.trim(), A.svg('anvers'));
  const json = JSON.parse(execFileSync(process.execPath,
    [path.join(ROOT, 'bin', 'anvers-mark.js'), 'anvers', '--json', '--shape', 'circle'], {encoding: 'utf8'}));
  assert.equal(json.shape, 'circle');
});

test('the source stays dependency-free and CSP-safe', () => {
  const src = fs.readFileSync(path.join(ROOT, 'anvers-identity.js'), 'utf8');
  assert.doesNotMatch(src, /\brequire\(|\bimport\s|\beval\(|new Function|innerHTML|outerHTML|insertAdjacentHTML|document\.write|setAttribute\('style'/);
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/);
});
