// Browser tests, in a real Chromium driven by Playwright (a test-only tool;
// the module itself has no dependency). Run from anvers-identity/ with:
//   node --test test/browser.test.mjs
// To run them in Anvers itself, set ANVERS_CHROMIUM to the browser's
// executable inside the app bundle. With ANVERS_PREVIEWS=1 the previews in
// previews/ are written again. Under CI, or with ANVERS_CHROMIUM set, a
// missing Playwright is an error rather than a skip.
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
const REQUIRED = !!(process.env.CI || process.env.ANVERS_CHROMIUM);
if (!playwright && REQUIRED) {
  throw new Error('Playwright is required here: npm install --no-save --no-package-lock playwright@1.56.1');
}
const skip = playwright ? false : 'Playwright is not installed (npm install --no-save --no-package-lock playwright@1.56.1)';

const VIEWPORTS = [
  {name: 'desktop', width: 1440, height: 900},
  {name: 'laptop', width: 1024, height: 700},
  {name: 'tablet', width: 768, height: 1024},
  {name: 'phone', width: 390, height: 844},
  {name: 'small', width: 320, height: 568},
  {name: 'landscape', width: 568, height: 320},
];
const SCHEMES = ['light', 'dark'];
const GUTTER = 16;
const HOST = '[data-anvers-identity][data-anvers-grammar]';

// Fixed seeds for the layout matrix: the first circle, square and triangle,
// and the widest and tallest marks on the wordmark's baseline, out of 2000.
const LAYOUT_SEEDS = (() => {
  const picked = {};
  let widest = null, tallest = null;
  for (let i = 0; i < 2000; i++) {
    const m = A.describe(`layout-${i}`, {align: 'baseline'});
    if (!picked[m.shape]) picked[m.shape] = m.seed;
    if (!widest || m.box.w > widest.box.w) widest = m;
    if (!tallest || m.box.h > tallest.box.h) tallest = m;
  }
  return [...new Set([...Object.values(picked), widest.seed, tallest.seed])];
})();

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
const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
function ratio(a, b) {
  const lum = c => {
    const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(x => x / 255)
      .map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

let browser, server, base;

test.before(async () => {
  if (!playwright) return;
  const executablePath = process.env.ANVERS_CHROMIUM || undefined;
  browser = await playwright.chromium.launch({executablePath});
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  process.stdout.write(`# browser: ${browser.version()}${executablePath ? ` (${executablePath})` : ''}\n`);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});

// A page that records every console error or warning and uncaught error,
// Content Security Policy and Trusted Types violations included; close()
// fails the test unless exactly the expected problems occurred.
async function open(options, url) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
  page.on('pageerror', e => problems.push(String(e)));
  if (url) await page.goto(url);
  const close = async (expected = 0, where = '') => {
    assert.equal(problems.length, expected, `${where} console: ${JSON.stringify(problems)}`);
    await context.close();
  };
  return {context, page, problems, close};
}

test('layout: the mark covers nothing, on fixed seeds, at six sizes in both schemes', {skip}, async () => {
  assert.ok(LAYOUT_SEEDS.length >= 4);
  for (const seed of LAYOUT_SEEDS) {
    for (const vp of VIEWPORTS) {
      for (const scheme of SCHEMES) {
        const where = `${seed} ${vp.name} ${vp.width}x${vp.height} ${scheme}`;
        const {page, close} = await open({viewport: {width: vp.width, height: vp.height}, colorScheme: scheme},
                                         `${base}/demo/index.html?seed=${seed}`);
        await page.waitForSelector(`${HOST}[data-anvers-seed="${seed}"]`);
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
              const visible = b.b > 0 && b.t < innerHeight;
              return {name: el.id || el.textContent.trim(), ...b, visible,
                      reachable: !visible || (!!hit && (hit === el || el.contains(hit)))};
            }),
          };
        });
        assert.equal(r.paths, 1, `${where}: one shape`);
        assert.ok(r.scroll <= r.inner, `${where}: horizontal scroll`);
        assert.ok(r.shape.l >= r.svg.l - 0.5 && r.shape.r <= r.svg.r + 0.5 &&
                  r.shape.t >= r.svg.t - 0.5 && r.shape.b <= r.svg.b + 0.5, `${where}: shape leaves its box`);
        assert.equal(r.controls.length, 8, `${where}: controls found`);
        for (const c of r.controls) {
          assert.ok(c.reachable, `${where}: ${c.name} is covered`);
          assert.ok(c.l >= GUTTER - 0.5 && c.r <= r.inner - GUTTER + 0.5, `${where}: ${c.name} outside the gutters`);
          for (const p of r.parts) {
            const overlap = Math.min(p.r, c.r) - Math.max(p.l, c.l) > 0 && Math.min(p.b, c.b) - Math.max(p.t, c.t) > 0;
            assert.ok(!overlap, `${where}: the identity overlaps ${c.name}`);
          }
        }
        await close(0, where);
      }
    }
  }
});

test('layout: long labels and seeds wrap at 320 pixels instead of overflowing', {skip}, async () => {
  const long = 'averyveryverylongseedwithoutanyspacesatallxyz';
  const {page, close} = await open({viewport: {width: 320, height: 568}}, `${base}/demo/index.html?seed=${long}`);
  await page.waitForSelector(`${HOST}[data-anvers-seed="${long}"]`);
  await page.evaluate(() => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = 'https://example.org/';
    a.textContent = 'Donaudampfschifffahrtsgesellschaftskapitän';
    li.append(a);
    document.querySelector('.home__links ul').append(li);
  });
  const r = await page.evaluate(() => ({
    inner: innerWidth, scroll: document.documentElement.scrollWidth,
    boxes: [...document.querySelectorAll('.home__links a, #seed, #reroll')].map(el => {
      const b = el.getBoundingClientRect(); return [b.left, b.right];
    }),
  }));
  assert.ok(r.scroll <= r.inner, `scroll ${r.scroll}`);
  for (const [l, rr] of r.boxes) assert.ok(l >= 0 && rr <= r.inner, `${l}..${rr}`);
  await close();
});

test('lockup: the gap between shape and wordmark is the same for every seed', {skip}, async () => {
  const gaps = [];
  for (const seed of [...LAYOUT_SEEDS, 'anvers', 'k3f9q2xa']) {
    const {page, close} = await open({viewport: {width: 1440, height: 900}}, `${base}/demo/index.html?seed=${seed}`);
    await page.waitForSelector(`${HOST}[data-anvers-seed="${seed}"]`);
    gaps.push(await page.evaluate(() => {
      const shape = document.querySelector('.home__identity path').getBoundingClientRect();
      const word = document.querySelector('.anvers-identity__wordmark').getBoundingClientRect();
      return word.top - shape.bottom;
    }));
    await close();
  }
  for (const g of gaps) assert.ok(Math.abs(g - gaps[0]) < 1, `gaps ${gaps.map(x => x.toFixed(1))}`);
});

test('without the stylesheet the mark keeps a sane size', {skip}, async () => {
  const {page, close} = await open({viewport: {width: 1440, height: 900}});
  await page.route('**/anvers-identity.css', route => route.abort());
  await page.goto(`${base}/demo/index.html?seed=anvers`);
  await page.waitForSelector(`${HOST}[data-anvers-seed="anvers"]`);
  const size = await page.evaluate(() => document.querySelector('.home__identity svg').getBoundingClientRect().width);
  assert.ok(size <= 160.5, `mark ${size}px`);
  // The aborted stylesheet is the one problem expected here.
  await close(1);
});

test('accessibility: names, landmarks, the whole focus order, sizes, contrast', {skip}, async () => {
  for (const scheme of SCHEMES) {
    const {page, close} = await open({viewport: {width: 1024, height: 768}, colorScheme: scheme},
                                     `${base}/demo/index.html?seed=anvers`);
    await page.waitForSelector(`${HOST}[data-anvers-seed="anvers"]`);
    await page.getByRole('heading', {level: 1, name: 'anvers', exact: true}).waitFor();
    await page.getByRole('search').waitFor();
    await page.getByRole('searchbox', {name: 'Search', exact: true}).waitFor();
    assert.equal(await page.getByRole('navigation', {name: 'Links', exact: true}).getByRole('link').count(), 5);
    // With the wordmark the drawing is hidden from assistive technology...
    assert.equal(await page.locator('.home__identity svg').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.getByRole('img').count(), 0);
    // ...and nothing in the identity takes focus.
    const order = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement.id || document.activeElement.textContent.trim()));
    }
    assert.deepEqual(order, ['q', 'Search', 'Stanford Encyclopedia', 'Project Gutenberg', 'Internet Archive',
                             'Gallica', 'Wikipedia', 'reroll']);
    // Contrast of the search field: border against field and page (3:1),
    // placeholder against field (4.5:1).
    const c = await page.evaluate(() => {
      const q = document.getElementById('q');
      const s = getComputedStyle(q);
      return {border: s.borderTopColor, field: s.backgroundColor,
              page: getComputedStyle(document.body).backgroundColor,
              placeholder: getComputedStyle(q, '::placeholder').color,
              word: parseFloat(getComputedStyle(document.querySelector('.anvers-identity__wordmark')).fontSize)};
    });
    assert.ok(ratio(c.border, c.field) >= 3 && ratio(c.border, c.page) >= 3, `${scheme} border ${JSON.stringify(c)}`);
    assert.ok(ratio(c.placeholder, c.field) >= 4.5, `${scheme} placeholder ${JSON.stringify(c)}`);
    assert.ok(c.word >= 16, `wordmark ${c.word}px`);
    await close();
  }
  // Without the wordmark the drawing carries the name, or none if decorative.
  const {page, close} = await open({}, `${base}/demo/index.html?seed=anvers`);
  await page.waitForSelector(`${HOST}[data-anvers-seed="anvers"]`);
  await page.evaluate(() => {
    const a = document.createElement('span'); a.id = 'named'; document.body.append(a);
    window.AnversIdentity.render(a, {seed: 'x'});
    const b = document.createElement('span'); b.id = 'decorative'; document.body.append(b);
    window.AnversIdentity.render(b, {seed: 'x', label: ''});
  });
  await page.getByRole('img', {name: 'Anvers', exact: true}).waitFor();
  assert.equal(await page.getByRole('img').count(), 1);
  await close();
});

test('wordmark size follows the reader, and phones get a 96-pixel mark', {skip}, async () => {
  const {page, close} = await open({viewport: {width: 320, height: 568}}, `${base}/demo/index.html?seed=anvers`);
  await page.waitForSelector(`${HOST}[data-anvers-seed="anvers"]`);
  const session = await page.context().newCDPSession(page);
  const measure = () => page.evaluate(() => ({
    mark: document.querySelector('.home__identity svg').getBoundingClientRect().width,
    word: parseFloat(getComputedStyle(document.querySelector('.anvers-identity__wordmark')).fontSize),
  }));
  const plain = await measure();
  assert.ok(Math.abs(plain.mark - 96) < 0.5, `mark ${plain.mark}`);
  assert.equal(plain.word, 16);
  await session.send('Page.setFontSizes', {fontSizes: {standard: 24}});
  await page.waitForTimeout(50);
  assert.equal((await measure()).word, 24);
  await close();
});

test('the seed shown is the seed drawn, for a random seed too', {skip}, async () => {
  for (const url of ['/demo/index.html', '/demo/index.html?seed=k3f9q2xa']) {
    const {page, close} = await open({}, base + url);
    await page.waitForSelector(HOST);
    await page.waitForLoadState('load');
    await page.evaluate(() => new Promise(r => setTimeout(r, 50)));
    const r = await page.evaluate(() => ({
      host: document.querySelector('[data-anvers-identity]').dataset.anversSeed,
      shown: document.getElementById('seed').textContent,
      url: new URLSearchParams(location.search).get('seed'),
      d: document.querySelector('.home__identity path').getAttribute('d'),
      node: window.AnversIdentity.describe('anvers').d,
    }));
    assert.equal(r.shown, r.host, url);
    assert.equal(r.url, r.host, url);
    assert.equal(r.d, A.describe(r.host, {align: 'baseline'}).d, url);
    assert.equal(r.node, A.describe('anvers').d);
    if (url.includes('k3f9q2xa')) assert.equal(r.host, 'k3f9q2xa');
    await close(0, url);
  }
});

test('declarative attributes, and one bad element does not stop the others', {skip}, async () => {
  const {page, close} = await open({}, `${base}/demo/index.html?seed=anvers`);
  await page.waitForSelector(`${HOST}[data-anvers-seed="anvers"]`);
  const r = await page.evaluate(() => {
    const bad = document.createElement('span');
    bad.setAttribute('data-anvers-identity', '');
    bad.dataset.shape = 'hexagon';
    bad.textContent = 'fallback';
    const good = document.createElement('span');
    good.setAttribute('data-anvers-identity', '');
    Object.assign(good.dataset, {seed: 'k3f9q2xa', shape: 'circle', colour: 'blue', wordmark: 'false'});
    good.setAttribute('data-label', '');
    document.body.append(bad, good);
    const marks = window.AnversIdentity.mountAll(document);
    const svg = good.querySelector('svg');
    return {count: marks.length, bad: bad.textContent, badSeed: bad.hasAttribute('data-anvers-seed'),
            shape: good.dataset.anversShape, colour: good.dataset.anversColour,
            hidden: svg.getAttribute('aria-hidden'), role: svg.getAttribute('role'),
            word: !!good.querySelector('.anvers-identity__wordmark'),
            d: svg.querySelector('path').getAttribute('d')};
  });
  assert.equal(r.count, 1);
  assert.equal(r.bad, 'fallback');
  assert.equal(r.badSeed, false);
  assert.deepEqual([r.shape, r.colour, r.hidden, r.role, r.word], ['circle', 'blue', 'true', null, false]);
  assert.equal(r.d, A.describe('k3f9q2xa', {shape: 'circle'}).d);
  await close(1);
});

test('loading late, or next to a global `module`, still mounts at once', {skip}, async () => {
  // A page whose load event waits on a slow image; the script is injected
  // after DOMContentLoaded, so it must mount without waiting for load.
  const {page, close} = await open({});
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  await page.route('**/slow.png', async route => {
    await new Promise(r => setTimeout(r, 2500));
    route.fulfill({contentType: 'image/png', body: PIXEL}).catch(() => {});
  });
  await page.route('**/late.html', route => route.fulfill({contentType: 'text/html', body:
    '<!doctype html><link rel="stylesheet" href="/anvers-identity.css">' +
    '<span id="m" data-anvers-identity data-seed="anvers"></span><img src="/slow.png" alt="">'}));
  await page.goto(`${base}/late.html`, {waitUntil: 'domcontentloaded'});
  const started = Date.now();
  await page.addScriptTag({url: '/anvers-identity.js'});
  await page.waitForSelector('#m[data-anvers-seed="anvers"]', {timeout: 1500});
  assert.ok(Date.now() - started < 1500);
  await close();
  const shim = await open({});
  await shim.page.route('**/shim.html', route => route.fulfill({contentType: 'text/html', body:
    '<!doctype html><script>var module = {exports: {}};</script>' +
    '<span id="m" data-anvers-identity data-seed="anvers"></span><script src="/anvers-identity.js"></script>'}));
  await shim.page.goto(`${base}/shim.html`);
  await shim.page.waitForSelector('#m[data-anvers-seed="anvers"]');
  assert.equal(await shim.page.evaluate(() => typeof window.AnversIdentity.render), 'function');
  await shim.close();
});

test('the page is static by default', {skip}, async () => {
  const {page, close} = await open({reducedMotion: 'no-preference'}, `${base}/demo/index.html?seed=anvers-17`);
  await page.waitForSelector(`${HOST}[data-anvers-seed="anvers-17"]`);
  const r = await page.evaluate(() => ({animations: document.getAnimations().length,
    motion: document.querySelector('[data-anvers-identity]').dataset.anversMotion}));
  assert.deepEqual(r, {animations: 0, motion: 'none'});
  await close();
});

test('reduced motion: the mark is drawn in place, by the script and by the stylesheet', {skip}, async () => {
  const {page, close} = await open({reducedMotion: 'reduce'}, `${base}/demo/index.html?seed=anvers-17&motion=settle`);
  await page.waitForSelector(`${HOST}[data-anvers-seed="anvers-17"]`);
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
  // Hide the preference from the script: the stylesheet alone must still
  // stop the motion.
  const css = await page.evaluate(() => new Promise(resolve => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = q => (q.includes('reduced-motion') ? {matches: false, media: q} : real(q));
    const el = document.createElement('span');
    document.querySelector('main').append(el);
    const mark = window.AnversIdentity.render(el, {seed: 'x', motion: 'settle'});
    requestAnimationFrame(() => requestAnimationFrame(() =>
      resolve({animated: mark.animated, animations: document.getAnimations().length,
               inline: el.querySelector('path').style.getPropertyValue('d')})));
  }));
  assert.deepEqual(css, {animated: false, animations: 0, inline: ''});
  await close();
});

test('motion, when asked for and allowed: one settle from the primitive, then still', {skip}, async () => {
  const {page, close} = await open({reducedMotion: 'no-preference'},
                                   `${base}/demo/index.html?seed=anvers-17&motion=settle`);
  await page.waitForSelector(`${HOST}[data-anvers-seed="anvers-17"]`);
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
  // Where no transition can run, nothing is claimed and nothing is left.
  const cases = await page.evaluate(() => {
    const out = {};
    const hidden = document.createElement('div'); hidden.style.display = 'none';
    const inHidden = document.createElement('span'); hidden.append(inHidden); document.body.append(hidden);
    const m1 = window.AnversIdentity.render(inHidden, {seed: 'x', motion: 'settle'});
    out.hidden = [m1.animated, inHidden.querySelector('path').style.getPropertyValue('d')];
    const loose = document.createElement('span');
    const m2 = window.AnversIdentity.render(loose, {seed: 'x', motion: 'settle'});
    out.detached = [m2.animated, loose.querySelector('path').style.getPropertyValue('d')];
    return out;
  });
  assert.deepEqual(cases, {hidden: [false, ''], detached: [false, '']});
  await close();
});

test('without JavaScript the static default stands, in the same box', {skip}, async () => {
  const size = {viewport: {width: 1440, height: 900}};
  const off = await open({...size, javaScriptEnabled: false}, `${base}/demo/index.html`);
  const staticBox = await off.page.evaluate(() => {
    const b = document.querySelector('.home__identity svg').getBoundingClientRect();
    return {x: b.x, y: b.y, w: b.width, h: b.height,
            d: document.querySelector('.home__identity path').getAttribute('d')};
  });
  await off.page.getByRole('heading', {level: 1, name: 'anvers', exact: true}).waitFor();
  assert.equal(staticBox.d, A.describe(A.defaultSeed, {align: 'baseline'}).d);
  // The button that only a script can make work is not offered.
  assert.equal(await off.page.getByRole('button', {name: 'Draw another'}).count(), 0);
  await off.close();
  const on = await open(size, `${base}/demo/index.html?seed=k3f9q2xa`);
  await on.page.waitForSelector(`${HOST}[data-anvers-seed="k3f9q2xa"]`);
  const liveBox = await on.page.evaluate(() => {
    const b = document.querySelector('.home__identity svg').getBoundingClientRect();
    return {x: b.x, y: b.y, w: b.width, h: b.height};
  });
  for (const k of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(staticBox[k] - liveBox[k]) < 0.5, `layout shift in ${k}`);
  await on.page.getByRole('button', {name: 'Draw another'}).waitFor();
  await on.close();
});

test('every colour, in both schemes, under theme pins, more contrast and forced colours', {skip}, async () => {
  const fills = async (options, setup) => {
    const {page, close} = await open(options, `${base}/demo/index.html?seed=anvers`);
    await page.waitForSelector(`${HOST}[data-anvers-seed="anvers"]`);
    const out = await page.evaluate(setup => {
      if (setup === 'root-light') document.documentElement.dataset.anversTheme = 'light';
      if (setup === 'root-dark') document.documentElement.dataset.anversTheme = 'dark';
      const result = {};
      for (const colour of window.AnversIdentity.colours) {
        const el = document.createElement('span');
        if (setup === 'element-light') el.dataset.anversTheme = 'light';
        if (setup === 'element-dark') el.dataset.anversTheme = 'dark';
        document.querySelector('main').append(el);
        window.AnversIdentity.render(el, {seed: 'x', colour});
        result[colour] = getComputedStyle(el.querySelector('path')).fill;
      }
      return result;
    }, setup);
    await close();
    return out;
  };
  const expect = (scheme, more) => Object.fromEntries(A.colours.map(c =>
    [c, rgb(more && scheme === 'light' && c === 'yellow' ? '#a87700' : A.palette[scheme][c])]));
  assert.deepEqual(await fills({colorScheme: 'light'}), expect('light'));
  assert.deepEqual(await fills({colorScheme: 'dark'}), expect('dark'));
  for (const where of ['root', 'element']) {
    assert.deepEqual(await fills({colorScheme: 'dark'}, `${where}-light`), expect('light'), `${where} light pin`);
    assert.deepEqual(await fills({colorScheme: 'light'}, `${where}-dark`), expect('dark'), `${where} dark pin`);
  }
  assert.deepEqual(await fills({colorScheme: 'light', contrast: 'more'}), expect('light', true));
  assert.deepEqual(await fills({colorScheme: 'dark', contrast: 'more'}), expect('dark', true));
  assert.deepEqual(await fills({colorScheme: 'dark', contrast: 'more'}, 'root-light'), expect('light', true));
  const forced = await fills({forcedColors: 'active'});
  for (const c of A.colours) assert.ok(!Object.values(expect('light')).includes(forced[c]), `forced ${forced[c]}`);
});

test('functional harness: another seed, search stays on the page', {skip}, async () => {
  const {page, close} = await open({}, `${base}/demo/index.html?seed=anvers`);
  await page.waitForSelector(`${HOST}[data-anvers-seed="anvers"]`);
  await page.click('#reroll');
  const seed = await page.getAttribute('[data-anvers-identity]', 'data-anvers-seed');
  assert.notEqual(seed, 'anvers');
  assert.equal(await page.textContent('#seed'), seed);
  await page.fill('#q', 'Hauriou');
  await page.keyboard.press('Enter');
  await page.getByRole('status').filter({hasText: 'Hauriou'}).waitFor();
  assert.match(page.url(), /\/demo\/index\.html\?seed=/);
  await close();
});

test('file: pages load the classic script; the ES module entry loads over http', {skip}, async () => {
  const file = await open({}, pathToFileURL(path.join(ROOT, 'demo', 'index.html')).href);
  await file.page.waitForSelector(HOST);
  await file.close();
  const grid = await open({}, `${base}/previews/grid.html`);
  await grid.page.waitForSelector('#grid li:nth-child(24) [data-anvers-grammar]');
  const d = await grid.page.evaluate(async () => (await import('/anvers-identity.mjs')).default.describe('anvers').d);
  assert.equal(d, A.describe('anvers').d);
  await grid.close();
});

test('previews', {skip: skip || (process.env.ANVERS_PREVIEWS ? false : 'set ANVERS_PREVIEWS=1 to write them')}, async () => {
  const shots = [
    ['home-desktop-light', '/demo/index.html?seed=anvers', 1440, 900, 'light'],
    ['home-desktop-dark', '/demo/index.html?seed=anvers', 1440, 900, 'dark'],
    ['home-narrow-light', '/demo/index.html?seed=anvers', 390, 844, 'light'],
    ['home-narrow-dark', '/demo/index.html?seed=anvers', 390, 844, 'dark'],
    ['grid-light', '/previews/grid.html', 1180, 720, 'light'],
    ['grid-dark', '/previews/grid.html', 1180, 720, 'dark'],
  ];
  for (const [name, url, width, height, colorScheme] of shots) {
    const {page, close} = await open({viewport: {width, height}, colorScheme}, base + url);
    await page.waitForSelector('[data-anvers-grammar]:not(svg)');
    await page.waitForTimeout(150);
    await page.screenshot({path: path.join(ROOT, 'previews', `${name}.png`), fullPage: true});
    await close();
  }
});
