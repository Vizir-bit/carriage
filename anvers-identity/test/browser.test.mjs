// Browser tests, in a real Chromium driven by Playwright (a test-only tool;
// the module itself has no dependency). Run from anvers-identity/ with:
//   node --test test/browser.test.mjs
// To run them in Anvers itself, set ANVERS_CHROMIUM to the browser's
// executable inside the app bundle. With ANVERS_PREVIEWS=1 the previews in
// previews/ are written again.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = require('../anvers-identity.js');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    try {
      return require(path.join(execFileSync('npm', ['root', '-g'], {encoding: 'utf8'}).trim(), 'playwright'));
    } catch (e2) {
      return null;
    }
  }
}
const playwright = loadPlaywright();

const VIEWPORTS = [
  {name: 'desktop', width: 1440, height: 900},
  {name: 'laptop', width: 1024, height: 700},
  {name: 'tablet', width: 768, height: 1024},
  {name: 'phone', width: 390, height: 844},
  {name: 'small', width: 320, height: 568},
];
const SCHEMES = ['light', 'dark'];
const GUTTER = 16;

const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png'};

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Numbers of a path, as drawn or as serialised by getComputedStyle.
const numbersOf = d => (String(d).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
function sameOutline(a, b) {
  const x = numbersOf(a), y = numbersOf(b);
  return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 0.006);
}

let browser, server, base;

test.before(async () => {
  if (!playwright) return;
  const executablePath = process.env.ANVERS_CHROMIUM || undefined;
  browser = await playwright.chromium.launch({executablePath});
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});

// A page that records every console error or warning and uncaught error,
// Content Security Policy and Trusted Types violations included.
async function open(options, url) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
  page.on('pageerror', e => problems.push(String(e)));
  await page.goto(url);
  return {context, page, problems};
}

const skip = playwright ? false : 'Playwright is not installed (npm install --no-save playwright)';

test('layout: the mark covers nothing, at five widths in both schemes', {skip}, async () => {
  for (const vp of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      const where = `${vp.name} ${vp.width}x${vp.height} ${scheme}`;
      const {context, page, problems} = await open(
        {viewport: {width: vp.width, height: vp.height}, colorScheme: scheme},
        `${base}/demo/index.html?motion=none`);
      await page.waitForSelector('[data-anvers-identity][data-anvers-seed]');
      const r = await page.evaluate(() => {
        const box = el => { const b = el.getBoundingClientRect(); return {l: b.left, r: b.right, t: b.top, b: b.bottom}; };
        const controls = [...document.querySelectorAll('#q, .home__search button, .home__links a, #reroll')];
        const identity = document.querySelector('[data-anvers-identity]');
        const svg = identity.querySelector('svg');
        return {
          inner: innerWidth,
          scroll: document.documentElement.scrollWidth,
          svg: box(svg),
          shape: box(svg.querySelector('path')),
          paths: svg.querySelectorAll('path').length,
          parts: [...identity.children].map(box),
          controls: controls.map(el => {
            const b = box(el);
            const hit = document.elementFromPoint((b.l + b.r) / 2, (b.t + b.b) / 2);
            return {name: el.id || el.textContent.trim(), ...b, reachable: !!hit && (hit === el || el.contains(hit))};
          }),
        };
      });
      assert.deepEqual(problems, [], `${where}: console`);
      assert.equal(r.paths, 1, `${where}: one shape`);
      assert.ok(r.scroll <= r.inner, `${where}: horizontal scroll`);
      assert.ok(r.shape.l >= r.svg.l - 0.5 && r.shape.r <= r.svg.r + 0.5 &&
                r.shape.t >= r.svg.t - 0.5 && r.shape.b <= r.svg.b + 0.5, `${where}: shape leaves its box`);
      assert.ok(r.controls.length >= 7, `${where}: controls found`);
      for (const c of r.controls) {
        assert.ok(c.reachable, `${where}: ${c.name} is covered`);
        assert.ok(c.l >= GUTTER - 0.5 && c.r <= r.inner - GUTTER + 0.5, `${where}: ${c.name} outside the gutters`);
        for (const p of r.parts) {
          const overlap = Math.min(p.r, c.r) - Math.max(p.l, c.l) > 0 && Math.min(p.b, c.b) - Math.max(p.t, c.t) > 0;
          assert.ok(!overlap, `${where}: the identity overlaps ${c.name}`);
        }
      }
      await context.close();
    }
  }
});

test('accessibility: names, landmarks, focus order', {skip}, async () => {
  const {context, page, problems} = await open({viewport: {width: 1024, height: 768}},
                                               `${base}/demo/index.html?motion=none`);
  await page.waitForSelector('[data-anvers-seed]');
  await page.getByRole('heading', {level: 1, name: 'anvers'}).waitFor();
  await page.getByRole('search').waitFor();
  await page.getByRole('searchbox', {name: 'Search'}).waitFor();
  assert.equal(await page.getByRole('navigation', {name: 'Links'}).getByRole('link').count(), 5);
  // With the wordmark the drawing is hidden from assistive technology...
  assert.equal(await page.locator('.home__identity svg').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.getByRole('img').count(), 0);
  // ...and nothing in the identity takes focus: the first stop is the search.
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'q');
  // Without the wordmark the drawing carries the name, or none if decorative.
  await page.evaluate(() => {
    const a = document.createElement('span'); a.id = 'named'; document.body.append(a);
    window.AnversIdentity.render(a, {seed: 'x'});
    const b = document.createElement('span'); b.id = 'decorative'; document.body.append(b);
    window.AnversIdentity.render(b, {seed: 'x', label: ''});
  });
  await page.getByRole('img', {name: 'Anvers'}).waitFor();
  assert.equal(await page.getByRole('img').count(), 1);
  assert.deepEqual(problems, []);
  await context.close();
});

test('the browser draws what Node draws, and what the seed says', {skip}, async () => {
  const {context, page} = await open({}, `${base}/demo/index.html?seed=k3f9q2xa&motion=none`);
  await page.waitForSelector('[data-anvers-seed="k3f9q2xa"]');
  const r = await page.evaluate(() => ({
    d: document.querySelector('.home__identity path').getAttribute('d'),
    describe: window.AnversIdentity.describe('anvers').d,
    shown: document.getElementById('seed').textContent,
    url: location.search,
  }));
  assert.equal(r.d, A.describe('k3f9q2xa').d);
  assert.equal(r.describe, A.describe('anvers').d);
  assert.equal(r.shown, 'k3f9q2xa');
  assert.match(r.url, /seed=k3f9q2xa/);
  await context.close();
});

test('reduced motion: the mark is drawn in place, nothing animates', {skip}, async () => {
  const {context, page, problems} = await open({reducedMotion: 'reduce'}, `${base}/demo/index.html?seed=anvers-17`);
  await page.waitForSelector('[data-anvers-seed]');
  const r = await page.evaluate(() => {
    const path = document.querySelector('.home__identity path');
    return {animations: document.getAnimations().length, d: getComputedStyle(path).d,
            final: path.getAttribute('d'), inline: path.style.getPropertyValue('d'),
            motion: document.querySelector('[data-anvers-identity]').dataset.anversMotion};
  });
  assert.equal(r.motion, 'settle', 'the page asked for motion');
  assert.equal(r.animations, 0);
  assert.equal(r.inline, '');
  assert.ok(sameOutline(r.d, r.final), `${r.d} vs ${r.final}`);
  assert.deepEqual(problems, []);
  await context.close();
});

test('motion, when allowed: one settle from the primitive, then still', {skip}, async () => {
  const {context, page, problems} = await open({reducedMotion: 'no-preference'},
                                               `${base}/demo/index.html?seed=anvers-17`);
  await page.waitForSelector('[data-anvers-seed]');
  const during = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() =>
    resolve(document.getAnimations().map(a => a.transitionProperty))))));
  assert.deepEqual(during, ['d']);
  await page.waitForTimeout(1300);
  const after = await page.evaluate(() => {
    const path = document.querySelector('.home__identity path');
    return {animations: document.getAnimations().length, inline: path.style.getPropertyValue('d'),
            d: getComputedStyle(path).d, final: path.getAttribute('d')};
  });
  assert.equal(after.animations, 0);
  assert.equal(after.inline, '');
  assert.ok(sameOutline(after.d, after.final));
  assert.deepEqual(problems, []);
  await context.close();
});

test('without JavaScript the static default stands, in the same box', {skip}, async () => {
  const size = {viewport: {width: 1440, height: 900}};
  const off = await open({...size, javaScriptEnabled: false}, `${base}/demo/index.html`);
  const staticBox = await off.page.evaluate(() => {
    const b = document.querySelector('.home__identity svg').getBoundingClientRect();
    return {x: b.x, y: b.y, w: b.width, h: b.height,
            d: document.querySelector('.home__identity path').getAttribute('d')};
  });
  await off.page.getByRole('heading', {level: 1, name: 'anvers'}).waitFor();
  assert.equal(staticBox.d, A.describe(A.defaultSeed).d);
  await off.context.close();
  const on = await open(size, `${base}/demo/index.html?motion=none`);
  await on.page.waitForSelector('[data-anvers-seed]');
  const liveBox = await on.page.evaluate(() => {
    const b = document.querySelector('.home__identity svg').getBoundingClientRect();
    return {x: b.x, y: b.y, w: b.width, h: b.height};
  });
  for (const k of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(staticBox[k] - liveBox[k]) < 0.5, `layout shift in ${k}`);
  await on.context.close();
});

test('schemes, theme pins and forced colours reach the fill', {skip}, async () => {
  const fillOf = async (options, setup) => {
    const {context, page} = await open(options, `${base}/demo/index.html?seed=anvers-02&motion=none`);
    await page.waitForSelector('[data-anvers-seed]');
    if (setup) await page.evaluate(setup);
    const fill = await page.evaluate(() => getComputedStyle(document.querySelector('.home__identity path')).fill);
    await context.close();
    return fill;
  };
  const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  const colour = A.describe('anvers-02').colour;
  assert.equal(await fillOf({colorScheme: 'light'}), rgb(A.palette.light[colour]));
  assert.equal(await fillOf({colorScheme: 'dark'}), rgb(A.palette.dark[colour]));
  assert.equal(await fillOf({colorScheme: 'dark'}, () => { document.documentElement.dataset.anversTheme = 'light'; }),
               rgb(A.palette.light[colour]));
  assert.equal(await fillOf({colorScheme: 'light'}, () => { document.documentElement.dataset.anversTheme = 'dark'; }),
               rgb(A.palette.dark[colour]));
  const forced = await fillOf({forcedColors: 'active'});
  assert.ok(![rgb(A.palette.light[colour]), rgb(A.palette.dark[colour])].includes(forced), `forced colours: ${forced}`);
});

test('functional harness: another seed, search stays on the page', {skip}, async () => {
  const {context, page, problems} = await open({}, `${base}/demo/index.html?seed=anvers&motion=none`);
  await page.waitForSelector('[data-anvers-seed="anvers"]');
  await page.click('#reroll');
  const seed = await page.getAttribute('[data-anvers-identity]', 'data-anvers-seed');
  assert.notEqual(seed, 'anvers');
  assert.equal(await page.textContent('#seed'), seed);
  await page.fill('#q', 'Hauriou');
  await page.keyboard.press('Enter');
  await page.getByRole('status').filter({hasText: 'Hauriou'}).waitFor();
  assert.match(page.url(), /\/demo\/index\.html\?seed=/);
  assert.deepEqual(problems, []);
  await context.close();
});

test('file: pages and the ES module entry work too', {skip}, async () => {
  const {context, page, problems} = await open({}, pathToFileURL(path.join(ROOT, 'demo', 'index.html')).href);
  await page.waitForSelector('[data-anvers-seed]');
  assert.deepEqual(problems, []);
  await context.close();
  const grid = await open({}, `${base}/previews/grid.html`);
  await grid.page.waitForSelector('#grid li:nth-child(24) [data-anvers-seed]');
  const d = await grid.page.evaluate(async () => (await import('/anvers-identity.mjs')).default.describe('anvers').d);
  assert.equal(d, A.describe('anvers').d);
  assert.deepEqual(grid.problems, []);
  await grid.context.close();
});

test('previews', {skip: skip || (process.env.ANVERS_PREVIEWS ? false : 'set ANVERS_PREVIEWS=1 to write them')}, async () => {
  const shots = [
    ['home-desktop-light', '/demo/index.html?seed=anvers-17&motion=none', 1440, 900, 'light'],
    ['home-desktop-dark', '/demo/index.html?seed=anvers-17&motion=none', 1440, 900, 'dark'],
    ['home-narrow-light', '/demo/index.html?seed=anvers-17&motion=none', 390, 844, 'light'],
    ['home-narrow-dark', '/demo/index.html?seed=anvers-17&motion=none', 390, 844, 'dark'],
    ['grid-light', '/previews/grid.html', 1180, 720, 'light'],
    ['grid-dark', '/previews/grid.html', 1180, 720, 'dark'],
  ];
  for (const [name, url, width, height, colorScheme] of shots) {
    const {context, page} = await open({viewport: {width, height}, colorScheme}, base + url);
    await page.waitForSelector('[data-anvers-seed]');
    await page.waitForTimeout(150);
    await page.screenshot({path: path.join(ROOT, 'previews', `${name}.png`), fullPage: true});
    await context.close();
  }
});
