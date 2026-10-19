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
    // A full browser (Anvers itself, or Chromium outside the headless shell)
    // asks every origin for a favicon. The pages declare none, so the harness
    // answers with no content rather than a 404 the console would report.
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
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

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

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
  page.on('console', m => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const where = m.location() && m.location().url;
    problems.push(where ? `${m.text()} (${where})` : m.text());
  });
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
    a.textContent = 'Donaudampfschifffahrtsgesellschaftskapit\u00e4n';
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

test('lockup: one gap for every seed, the word centred and grouped with the mark', {skip}, async () => {
  const gaps = [];
  for (const seed of [...LAYOUT_SEEDS, 'anvers', 'k3f9q2xa']) {
    const {page, close} = await open({viewport: {width: 1440, height: 900}}, `${base}/demo/index.html?seed=${seed}`);
    await page.waitForSelector(`${HOST}[data-anvers-seed="${seed}"]`);
    const r = await page.evaluate(() => {
      const svg = document.querySelector('.home__identity svg').getBoundingClientRect();
      const shape = document.querySelector('.home__identity path').getBoundingClientRect();
      const wordEl = document.querySelector('.anvers-identity__wordmark');
      const word = wordEl.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(wordEl);
      const text = range.getBoundingClientRect();
      const tracking = parseFloat(getComputedStyle(wordEl).letterSpacing);
      const field = document.getElementById('q').getBoundingClientRect();
      return {gap: word.top - shape.bottom, after: field.top - word.bottom,
              offCentre: text.left + (text.width - tracking) / 2 - (svg.left + svg.width / 2)};
    });
    gaps.push(r.gap);
    assert.ok(Math.abs(r.offCentre) < 0.5, `${seed}: word off centre by ${r.offCentre}`);
    assert.ok(r.gap / r.after < 0.6, `${seed}: word ${r.gap.toFixed(1)} from the mark, ${r.after.toFixed(1)} from the search`);
    await close();
  }
  for (const g of gaps) assert.ok(Math.abs(g - gaps[0]) < 1, `gaps ${gaps.map(x => x.toFixed(1))}`);
});

test('without any stylesheet the mark keeps its own size and the scheme\'s fill', {skip}, async () => {
  const colour = A.describe('anvers').colour;
  for (const scheme of SCHEMES) {
    const {page, close} = await open({viewport: {width: 1440, height: 900}, colorScheme: scheme});
    await page.route('**/*.css', route => route.abort());
    await page.goto(`${base}/demo/index.html?seed=anvers`);
    await page.waitForSelector(`${HOST}[data-anvers-seed="anvers"]`);
    const r = await page.evaluate(() => {
      const svg = document.querySelector('.home__identity svg');
      const b = svg.getBoundingClientRect();
      return {w: b.width, h: b.height, fill: getComputedStyle(svg.querySelector('path')).fill,
              field: document.getElementById('q').getBoundingClientRect().bottom, inner: innerHeight};
    });
    assert.ok(Math.abs(r.w - 160) < 0.5 && Math.abs(r.h - 160) < 0.5, `${scheme}: ${r.w} x ${r.h}`);
    assert.equal(r.fill, rgb(A.palette[scheme][colour]), scheme);
    assert.ok(r.field <= r.inner, `${scheme}: search pushed below the fold`);
    await close(2);   // the two stylesheets refused
  }
  // A bare page: no stylesheet at all, the script alone.
  const bare = await open({viewport: {width: 1440, height: 900}});
  await bare.page.route('**/bare.html', route => route.fulfill({contentType: 'text/html', body:
    '<!doctype html><div data-anvers-identity data-seed="anvers"></div><script src="/anvers-identity.js"></script>'}));
  await bare.page.goto(`${base}/bare.html`);
  await bare.page.waitForSelector('[data-anvers-identity][data-anvers-seed="anvers"]');
  const width = await bare.page.evaluate(() => document.querySelector('svg').getBoundingClientRect().width);
  assert.ok(Math.abs(width - 160) < 0.5, `bare page: ${width}`);
  await bare.close();
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
  await session.send('Page.setFontSizes', {fontSizes: {standard: 16}});
  // 160 at most, 24 % of the smaller side in between.
  for (const [width, height, mark] of [[1440, 900, 160], [1024, 500, 120], [568, 320, 96]]) {
    await page.setViewportSize({width, height});
    await page.waitForTimeout(50);
    const got = (await measure()).mark;
    assert.ok(Math.abs(got - mark) < 0.5, `${width}x${height}: ${got}`);
  }
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

test('auto-mount: an element added before load is drawn, a bad one reported once', {skip}, async () => {
  const {page, close} = await open({});
  await page.route('**/adder.js', route => route.fulfill({contentType: 'text/javascript', body:
    "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('span'); " +
    "s.id = 'late'; s.setAttribute('data-anvers-identity', ''); s.dataset.seed = 'anvers'; document.body.append(s); });"}));
  await page.route('**/slow.png', async route => {
    await new Promise(r => setTimeout(r, 800));
    route.fulfill({contentType: 'image/png', body: PIXEL}).catch(() => {});
  });
  await page.route('**/auto.html', route => route.fulfill({contentType: 'text/html', body:
    '<!doctype html><script src="/anvers-identity.js" defer></script><script src="/adder.js" defer></script>' +
    '<span id="early" data-anvers-identity data-seed="anvers"></span>' +
    '<span id="bad" data-anvers-identity data-shape="hexagon">fallback</span><img src="/slow.png" alt="">'}));
  await page.goto(`${base}/auto.html`);
  await page.waitForTimeout(100);
  const r = await page.evaluate(() => ({
    early: document.getElementById('early').dataset.anversSeed,
    late: document.getElementById('late').dataset.anversSeed,
    bad: document.getElementById('bad').textContent,
  }));
  assert.deepEqual(r, {early: 'anvers', late: 'anvers', bad: 'fallback'});
  await close(1);   // the bad element, reported once
});

test('the module also loads in workers, classic and module', {skip}, async () => {
  const {page, close} = await open({});
  await page.route('**/worker.html', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><title>w</title>'}));
  await page.goto(`${base}/worker.html`);
  const r = await page.evaluate(() => {
    const run = (code, type) => new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}));
      const worker = new Worker(url, type ? {type} : undefined);
      worker.onmessage = e => resolve(e.data);
      worker.onerror = e => reject(new Error(e.message));
    });
    const origin = location.origin;
    return Promise.all([
      run(`importScripts('${origin}/anvers-identity.js'); postMessage(self.AnversIdentity.describe('anvers').d);`),
      run(`import A from '${origin}/anvers-identity.mjs'; postMessage(A.describe('anvers').d);`, 'module'),
    ]);
  });
  assert.deepEqual(r, [A.describe('anvers').d, A.describe('anvers').d]);
  await close();
});

test('loading late, or next to a global `module`, still mounts at once', {skip}, async () => {
  // A page whose load event waits on a slow image; the script is injected
  // after DOMContentLoaded, so it must mount without waiting for load.
  const {page, close} = await open({});
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
  // And the other way round: remove the stylesheet's rule, so that only the
  // script's own check stands between the preference and the motion.
  const alone = await open({reducedMotion: 'reduce'}, `${base}/demo/index.html?seed=anvers-17`);
  await alone.page.waitForSelector(`${HOST}[data-anvers-seed="anvers-17"]`);
  const script = await alone.page.evaluate(() => new Promise(resolve => {
    for (const sheet of document.styleSheets) {
      for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
        const rule = sheet.cssRules[i];
        if (rule.media && rule.media.mediaText.includes('prefers-reduced-motion')) sheet.deleteRule(i);
      }
    }
    const el = document.createElement('span');
    document.querySelector('main').append(el);
    const mark = window.AnversIdentity.render(el, {seed: 'w', motion: 'settle'});
    requestAnimationFrame(() => requestAnimationFrame(() =>
      resolve({animated: mark.animated, animations: document.getAnimations().length,
               inline: el.querySelector('path').style.getPropertyValue('d')})));
  }));
  assert.deepEqual(script, {animated: false, animations: 0, inline: ''});
  await alone.close();
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
  // A settle cancelled while running, or hidden before its first frame,
  // leaves nothing behind.
  const leftovers = await page.evaluate(() => new Promise(resolve => {
    const twoFrames = f => requestAnimationFrame(() => requestAnimationFrame(f));
    const running = document.createElement('span');
    const early = document.createElement('span');
    document.querySelector('main').append(running, early);
    window.AnversIdentity.render(running, {seed: 'y', motion: 'settle'});
    window.AnversIdentity.render(early, {seed: 'z', motion: 'settle'});
    early.style.display = 'none';
    twoFrames(() => {
      const animations = document.getAnimations().length;
      running.style.display = 'none';
      twoFrames(() => resolve({animations,
        running: running.querySelector('path').style.getPropertyValue('d'),
        early: early.querySelector('path').style.getPropertyValue('d')}));
    });
  }));
  assert.deepEqual(leftovers, {animations: 1, running: '', early: ''});
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
  // With the identity script missing, the demo does not offer a button that
  // could not work.
  const missing = await open(size);
  await missing.page.route('**/anvers-identity.js', route => route.abort());
  await missing.page.goto(`${base}/demo/index.html`);
  await missing.page.waitForLoadState('load');
  assert.equal(await missing.page.getByRole('button', {name: 'Draw another'}).count(), 0);
  await missing.close(1);   // the refused script
});

test('every colour, in both schemes, under theme pins, more contrast and forced colours', {skip}, async () => {
  const fills = async (options, setup) => {
    const {page, close} = await open(options, `${base}/demo/index.html?seed=anvers`);
    await page.waitForSelector(`${HOST}[data-anvers-seed="anvers"]`);
    const out = await page.evaluate(setup => {
      if (setup === 'root-light' || setup === 'nested') document.documentElement.dataset.anversTheme = 'light';
      if (setup === 'root-dark') document.documentElement.dataset.anversTheme = 'dark';
      const result = {};
      for (const colour of window.AnversIdentity.colours) {
        const el = document.createElement('span');
        if (setup === 'element-light') el.dataset.anversTheme = 'light';
        if (setup === 'element-dark' || setup === 'nested') el.dataset.anversTheme = 'dark';
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
  for (const where of ['root', 'element']) {
    assert.deepEqual(await fills({colorScheme: 'dark', contrast: 'more'}, `${where}-light`), expect('light', true),
                     `${where} light pin, more contrast`);
    assert.deepEqual(await fills({colorScheme: 'light', contrast: 'more'}, `${where}-dark`), expect('dark', true),
                     `${where} dark pin, more contrast`);
  }
  // Pins are not nested: where a dark pin applies, it wins, with or without
  // more contrast.
  assert.deepEqual(await fills({colorScheme: 'light'}, 'nested'), expect('dark'));
  assert.deepEqual(await fills({colorScheme: 'light', contrast: 'more'}, 'nested'), expect('dark', true));
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

test('themes: full Chromium loads every theme folder and makes it the active theme', {skip}, async () => {
  // Themes need a full browser (the headless shell has no extensions), so
  // this test always uses one: Anvers itself when ANVERS_CHROMIUM is set,
  // otherwise Playwright's full Chromium build.
  const os = await import('node:os');
  const {THEMES} = require('../anvers-themes.js');
  const executablePath = process.env.ANVERS_CHROMIUM || playwright.chromium.executablePath();
  for (const theme of THEMES) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'anvers-theme-'));
    // Chromium writes a compiled theme pack into an unpacked theme's folder,
    // so a copy is loaded, never the committed folder.
    const dir = path.join(work, theme.folder);
    fs.mkdirSync(dir);
    fs.copyFileSync(path.join(ROOT, 'themes', theme.folder, 'manifest.json'), path.join(dir, 'manifest.json'));
    const profile = path.join(work, 'profile');
    try {
      const context = await playwright.chromium.launchPersistentContext(profile, {
        executablePath, headless: true,
        args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
      });
      try {
        const page = await context.newPage();
        await page.goto('about:blank');
        // The theme is installed asynchronously; wait until Chromium has
        // written the compiled pack, then close so that the preferences are
        // flushed.
        for (let i = 0; i < 50 && !fs.existsSync(path.join(dir, 'Cached Theme.pak')); i++) await page.waitForTimeout(100);
      } finally {
        await context.close();
      }
      const prefs = JSON.parse(fs.readFileSync(path.join(profile, 'Default', 'Preferences'), 'utf8'));
      const active = prefs.extensions && prefs.extensions.theme;
      assert.ok(active && /^[a-p]{32}$/.test(active.id), `${theme.folder}: no active theme recorded`);
      assert.equal(fs.realpathSync(active.pack), fs.realpathSync(dir), `${theme.folder}: another theme is active`);
      assert.ok(fs.existsSync(path.join(dir, 'Cached Theme.pak')), `${theme.folder}: Chromium compiled no theme pack`);
    } finally {
      fs.rmSync(work, {recursive: true, force: true});
    }
  }
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
