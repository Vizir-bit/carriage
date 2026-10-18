/*
 * Anvers identity: one geometric shape, coloured at random from three
 * restrained primaries and distorted within fixed bounds.
 *
 * Dependency-free. It loads as a classic script (it sets
 * globalThis.AnversIdentity and mounts every [data-anvers-identity] element),
 * as a CommonJS module (Node tests, the command-line exporter) and, through
 * anvers-identity.mjs, as an ES module. The DOM is built with createElementNS
 * and textContent only, so it runs under a strict Content Security Policy
 * with Trusted Types enforced.
 *
 * The same seed always gives the same mark: same shape, colour and outline,
 * byte for byte, for a given GRAMMAR. Change GRAMMAR whenever a change to this
 * file would redraw an existing seed differently.
 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  const commonjs = typeof module === 'object' && module && module.exports;
  if (commonjs) module.exports = api;
  // Everywhere but plain CommonJS (pages, workers, a page that happens to
  // define a global `module`), publish the global; in a page, draw the marks.
  if (root && (!commonjs || root.document) && !root.AnversIdentity) root.AnversIdentity = api;
  if (root && root.document) api.autoMount(root.document);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const VERSION = '3.0.0';
  // Grammars 1 and 2 were review drafts of 18 October 2026 (commits 3205963
  // and db116fb), replaced before any integration.
  const GRAMMAR = 3;
  const DEFAULT_SEED = 'anvers';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // The mark is drawn in a 100 x 100 box; the outline always stays inside
  // SAFE, so the shape can never paint outside its own box. With the
  // wordmark, the shape stands on BASELINE instead of being centred, so the
  // gap between shape and word is the same for every seed.
  const VIEW = 100;
  const SAFE = Object.freeze({min: 7, max: 93});
  const BASELINE = 88;
  const MARK_SIZE = 160;

  const SHAPES = Object.freeze(['circle', 'square', 'triangle']);
  const COLOURS = Object.freeze(['red', 'yellow', 'blue']);
  const ALIGNS = Object.freeze(['centre', 'baseline']);

  // Restrained primaries: print-like rather than screen-pure. The dark set is
  // lifted to keep at least 4.5:1 against a dark page, red and blue at the
  // same lightness.
  const PALETTE = Object.freeze({
    light: Object.freeze({red: '#c0392b', yellow: '#e0a817', blue: '#1f4e99'}),
    dark: Object.freeze({red: '#e2594b', yellow: '#ebb935', blue: '#538ae6'}),
  });
  const GROUNDS = Object.freeze({paper: '#f3efe6', ink: '#161616'});

  // Every distortion has a floor and a ceiling: the floor keeps the mark
  // visibly distorted, the ceiling keeps the primitive recognisable. The
  // stretch multiplies one axis and divides the other, so the aspect changes
  // by its square: 1.12 to 1.25 for polygons, 1.12 to 1.44 for the circle,
  // whose only distortion is affine (it becomes an ellipse).
  const BOUNDS = Object.freeze({
    rotate: Object.freeze([-12, 12]),     // degrees
    shear: Object.freeze([0.06, 0.18]),   // |k| of an x-shear, either sign
    stretch: Object.freeze({              // per-axis factor, either axis
      circle: Object.freeze([1.06, 1.20]),
      square: Object.freeze([1.06, 1.12]),
      triangle: Object.freeze([1.06, 1.12]),
    }),
    vertex: 0.10,   // polygon vertex shift per axis, in unit-radius terms
  });

  // A polygon too close to its regular form after distortion is redrawn with
  // its vertex shifts mirrored and, if it is still too regular, with the
  // shear at its ceiling (deterministic, no extra draw). Too regular: every
  // angle within `angle` degrees of the regular one and, for the square,
  // sides within `sides` of each other, or every corner within `right`
  // degrees of a right angle (a plain rectangle reads as another shape).
  const FLOOR = Object.freeze({
    triangle: Object.freeze({angle: 8}),
    square: Object.freeze({angle: 8, sides: 1.2, right: 5}),
  });

  // Equal areas do not look equal: a circle reads smaller than a square of
  // the same area, so it gets more; a triangle spreads wider and taller
  // (median box about 72 x 67 against 58 x 56 for the square), so it gets
  // less.
  const TARGET_AREA = Object.freeze({circle: 2800, square: 2500, triangle: 2300});

  const SAMPLES_PER_CURVE = 48;
  const SEED_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

  // ---- Seeded randomness -------------------------------------------------

  // cyrb128 string hash and the sfc32 generator (both public domain).
  function hash128(text) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < text.length; i++) {
      const k = text.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }

  function sfc32(seedWords) {
    let [a, b, c, d] = seedWords;
    return function next() {
      a |= 0; b |= 0; c |= 0; d |= 0;
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  // Seeds are compared as text after Unicode normalisation (NFC) and
  // trimming, so the same visible text always draws the same mark.
  const clean = value => String(value).normalize('NFC').trim();

  // A fresh seed: eight characters of Crockford's base-32 alphabet, from the
  // platform's cryptographic generator when there is one.
  function newSeed() {
    const bytes = new Uint8Array(8);
    const cryptoApi = root && root.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      cryptoApi.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let seed = '';
    for (let i = 0; i < bytes.length; i++) seed += SEED_ALPHABET[bytes[i] & 31];
    return seed;
  }

  // 'random' (or nothing) draws a new seed, 'daily' gives one seed per local
  // calendar day, anything else is the seed itself.
  function resolveSeed(input, now) {
    const seed = input === undefined || input === null ? '' : clean(input);
    if (seed === '' || seed === 'random') return newSeed();
    if (seed === 'daily') {
      const day = now instanceof Date ? now : new Date();
      const pad = n => String(n).padStart(2, '0');
      return `day-${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    }
    return seed;
  }

  // ---- Geometry ----------------------------------------------------------

  const lerp = (lo, hi, u) => lo + (hi - lo) * u;
  const toRad = deg => deg * Math.PI / 180;
  const round2 = n => Math.round(n * 100) / 100;
  const fmt = n => round2(n).toFixed(2);

  // The draws are taken in a fixed order and always in the same number,
  // whatever the shape, so pinning a shape or colour leaves the rest of the
  // seed's mark unchanged. The stretch range depends on the shape, so it is
  // kept as a fraction and a sign until the shape is known.
  function draw(seed) {
    const next = sfc32(hash128(`anvers/${GRAMMAR}/${seed}`));
    const shapeU = next(), colourU = next();
    const rotateU = next(), shearU = next(), shearSignU = next();
    const stretchU = next(), stretchSignU = next();
    const jitter = [];
    for (let i = 0; i < 16; i++) jitter.push(next() * 2 - 1);
    return {
      shape: SHAPES[Math.min(SHAPES.length - 1, Math.floor(shapeU * SHAPES.length))],
      colour: COLOURS[Math.min(COLOURS.length - 1, Math.floor(colourU * COLOURS.length))],
      rotate: lerp(BOUNDS.rotate[0], BOUNDS.rotate[1], rotateU),
      shear: (shearSignU < 0.5 ? -1 : 1) * lerp(BOUNDS.shear[0], BOUNDS.shear[1], shearU),
      stretchU,
      stretchSign: stretchSignU < 0.5 ? -1 : 1,
      jitter,
    };
  }

  function stretchFor(shape, drawn) {
    const [lo, hi] = BOUNDS.stretch[shape];
    return Math.exp(drawn.stretchSign * lerp(Math.log(lo), Math.log(hi), drawn.stretchU));
  }

  // Unit primitives centred on the origin (y grows downwards, as in SVG).
  // Polygons are lists of vertices; the circle is four cubic curves, given as
  // a closed list [anchor, out-handle, in-handle, anchor, ...].
  function polygon(shape, jitter) {
    const base = shape === 'square'
      ? [[-1, -1], [1, -1], [1, 1], [-1, 1]]
      : [[0, -1], [Math.cos(toRad(30)), Math.sin(toRad(30))], [-Math.cos(toRad(30)), Math.sin(toRad(30))]];
    if (!jitter) return base;
    return base.map(([x, y], i) => [x + jitter[2 * i] * BOUNDS.vertex,
                                    y + jitter[2 * i + 1] * BOUNDS.vertex]);
  }

  function circle() {
    const k = 4 / 3 * Math.tan(Math.PI / 8);
    const points = [[1, 0]];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, b = a + Math.PI / 2;
      const pa = [Math.cos(a), Math.sin(a)], pb = [Math.cos(b), Math.sin(b)];
      points.push([pa[0] - k * pa[1], pa[1] + k * pa[0]],
                  [pb[0] + k * pb[1], pb[1] - k * pb[0]],
                  [Math.round(pb[0] * 1e12) / 1e12, Math.round(pb[1] * 1e12) / 1e12]);
    }
    return points;
  }

  // rotate . shear . stretch; every factor has determinant 1, so the affine
  // part never changes the area, only the proportions.
  function affine(points, t) {
    const c = Math.cos(toRad(t.rotate)), s = Math.sin(toRad(t.rotate));
    return points.map(([x, y]) => {
      const sx = x * t.stretch, sy = y / t.stretch;
      const hx = sx + t.shear * sy;
      return [c * hx - s * sy, s * hx + c * sy];
    });
  }

  function angles(points) {
    return points.map((p, i) => {
      const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
      const u = [a[0] - p[0], a[1] - p[1]], v = [b[0] - p[0], b[1] - p[1]];
      const cos = (u[0] * v[0] + u[1] * v[1]) / Math.hypot(u[0], u[1]) / Math.hypot(v[0], v[1]);
      return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    });
  }

  // Whether a distorted polygon still looks like its regular form.
  function tooRegular(shape, points) {
    const floor = FLOOR[shape];
    if (!floor) return false;
    const regular = shape === 'square' ? 90 : 60;
    const offAngle = Math.max(...angles(points).map(a => Math.abs(a - regular)));
    if (shape === 'triangle') return offAngle < floor.angle;
    const sides = points.map((p, i) => {
      const q = points[(i + 1) % points.length];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    });
    return offAngle < floor.right || (offAngle < floor.angle && Math.max(...sides) / Math.min(...sides) < floor.sides);
  }

  // The distorted unit outline for a shape and a set of draws, with the
  // legibility floor applied. Returns the points and what was applied.
  function distort(shape, drawn) {
    const t = {rotate: drawn.rotate, shear: drawn.shear, stretch: stretchFor(shape, drawn)};
    if (shape === 'circle') return {points: affine(circle(), t), t, jitter: [], floor: 'none'};
    const count = shape === 'square' ? 8 : 6;
    let jitter = drawn.jitter.slice(0, count);
    let points = affine(polygon(shape, jitter), t);
    let floor = 'none';
    if (tooRegular(shape, points)) {
      jitter = jitter.map(j => -j);
      points = affine(polygon(shape, jitter), t);
      floor = 'mirrored';
      if (tooRegular(shape, points)) {
        t.shear = Math.sign(t.shear) * BOUNDS.shear[1];
        points = affine(polygon(shape, jitter), t);
        floor = 'sheared';
      }
    }
    return {points, t, jitter, floor};
  }

  function cubicPoint(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0],
            a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]];
  }

  // The outline as a closed list of points: the vertices of a polygon, or a
  // fine sampling of the circle's curves.
  function outline(shape, points) {
    if (shape !== 'circle') return points.slice();
    const out = [];
    for (let i = 0; i + 3 < points.length; i += 3) {
      for (let j = 0; j < SAMPLES_PER_CURVE; j++) {
        out.push(cubicPoint(points[i], points[i + 1], points[i + 2], points[i + 3], j / SAMPLES_PER_CURVE));
      }
    }
    return out;
  }

  function measure(ring) {
    let area2 = 0, cx = 0, cy = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
      const cross = x0 * y1 - x1 * y0;
      area2 += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
      minX = Math.min(minX, x0); maxX = Math.max(maxX, x0);
      minY = Math.min(minY, y0); maxY = Math.max(maxY, y0);
    }
    const area = area2 / 2;
    return {area: Math.abs(area), centroid: [cx / (6 * area), cy / (6 * area)],
            box: {minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY}};
  }

  const transform = (points, scale, dx, dy) => points.map(([x, y]) => [x * scale + dx, y * scale + dy]);

  // Scale to the shape's target area and shrink if it would leave the room
  // it has. Horizontally, centre it halfway between its bounding box and its
  // centroid (the optical centre of a triangle sits between the two).
  // Vertically, do the same, or stand it on the baseline.
  function place(shape, points, align) {
    const baseline = align === 'baseline';
    const roomW = SAFE.max - SAFE.min;
    const roomH = (baseline ? BASELINE : SAFE.max) - SAFE.min;
    let m = measure(outline(shape, points));
    let pts = transform(points, Math.sqrt(TARGET_AREA[shape] / m.area), 0, 0);
    m = measure(outline(shape, pts));
    if (m.box.w > roomW || m.box.h > roomH) {
      pts = transform(pts, Math.min(roomW / m.box.w, roomH / m.box.h), 0, 0);
      m = measure(outline(shape, pts));
    }
    const cx = ((m.box.minX + m.box.maxX) / 2 + m.centroid[0]) / 2;
    const cy = ((m.box.minY + m.box.maxY) / 2 + m.centroid[1]) / 2;
    pts = transform(pts, 1, VIEW / 2 - cx, baseline ? BASELINE - m.box.maxY : VIEW / 2 - cy);
    m = measure(outline(shape, pts));
    const nudgeX = Math.max(0, SAFE.min - m.box.minX) - Math.max(0, m.box.maxX - SAFE.max);
    const nudgeY = baseline ? 0 : Math.max(0, SAFE.min - m.box.minY) - Math.max(0, m.box.maxY - SAFE.max);
    if (nudgeX || nudgeY) {
      pts = transform(pts, 1, nudgeX, nudgeY);
      m = measure(outline(shape, pts));
    }
    return {points: pts, measure: m};
  }

  function pathData(shape, points) {
    const p = ([x, y]) => `${fmt(x)} ${fmt(y)}`;
    if (shape !== 'circle') {
      return `M ${p(points[0])} ` + points.slice(1).map(q => `L ${p(q)}`).join(' ') + ' Z';
    }
    let d = `M ${p(points[0])}`;
    for (let i = 1; i + 2 < points.length; i += 3) {
      d += ` C ${p(points[i])} ${p(points[i + 1])} ${p(points[i + 2])}`;
    }
    return d + ' Z';
  }

  function checkPin(name, value, allowed) {
    if (value === undefined || value === null || value === '') return null;
    if (allowed.indexOf(value) === -1) {
      throw new RangeError(`AnversIdentity: ${name} must be one of ${allowed.join(', ')}; got ${value}`);
    }
    return value;
  }

  // The whole mark for a seed, as data. Pure: no DOM, no clock, no randomness
  // beyond the seed. options: shape, colour, align ('centre' or 'baseline').
  function describe(seed, options) {
    const opts = options || {};
    const text = clean(seed === undefined || seed === null ? DEFAULT_SEED : seed) || DEFAULT_SEED;
    const drawn = draw(text);
    const shape = checkPin('shape', opts.shape, SHAPES) || drawn.shape;
    const colour = checkPin('colour', opts.colour !== undefined ? opts.colour : opts.color, COLOURS) || drawn.colour;
    const align = checkPin('align', opts.align, ALIGNS) || 'centre';
    const distorted = distort(shape, drawn);
    const final = place(shape, distorted.points, align);
    const base = place(shape, shape === 'circle' ? circle() : polygon(shape, null), align);
    const box = final.measure.box;
    return {
      seed: text,
      grammar: GRAMMAR,
      shape,
      colour,
      align,
      fill: {light: PALETTE.light[colour], dark: PALETTE.dark[colour]},
      distortion: {
        rotate: round2(distorted.t.rotate),
        shear: Math.round(distorted.t.shear * 1000) / 1000,
        stretch: Math.round(distorted.t.stretch * 1000) / 1000,
        jitter: distorted.jitter.map(j => Math.round(j * 1000) / 1000),
        floor: distorted.floor,
      },
      d: pathData(shape, final.points),
      base: pathData(shape, base.points),
      box: {x: round2(box.minX), y: round2(box.minY), w: round2(box.w), h: round2(box.h)},
      area: round2(final.measure.area),
    };
  }

  // ---- SVG text ----------------------------------------------------------

  // Characters XML 1.0 cannot carry at all: C0 controls other than tab, line
  // feed and carriage return, U+FFFE, U+FFFF and unpaired surrogates.
  const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  const ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
                   '\t': '&#9;', '\n': '&#10;', '\r': '&#13;'};
  function escapeXml(text, what) {
    const value = String(text);
    if (XML_INVALID.test(value)) {
      throw new RangeError(`AnversIdentity: the ${what} holds a character SVG cannot carry`);
    }
    return value.replace(/[&<>"'\t\n\r]/g, ch => ESCAPES[ch]);
  }

  // The mark as standalone SVG text, for files, icons and a static fallback.
  // options: shape, colour, align, label ('' for decorative), scheme ('light'
  // or 'dark'), background ('none', 'paper' or 'ink'), size (pixels).
  function svg(seed, options) {
    const opts = options || {};
    const mark = describe(seed, opts);
    const label = opts.label === undefined ? 'Anvers' : String(opts.label);
    const scheme = opts.scheme === 'dark' ? 'dark' : 'light';
    const background = opts.background === undefined || opts.background === null || opts.background === ''
      ? 'none' : opts.background;
    if (background !== 'none' && !Object.prototype.hasOwnProperty.call(GROUNDS, background)) {
      throw new RangeError(`AnversIdentity: background must be none, paper or ink; got ${background}`);
    }
    let size = '';
    if (opts.size !== undefined && opts.size !== null && opts.size !== '') {
      const n = Number(opts.size);
      if (!Number.isFinite(n) || n <= 0) throw new RangeError(`AnversIdentity: size must be a positive number; got ${opts.size}`);
      size = ` width="${n}" height="${n}"`;
    }
    const a11y = label ? ` role="img" aria-label="${escapeXml(label, 'label')}"` : ' aria-hidden="true"';
    const ground = background === 'none'
      ? ''
      : `<rect width="${VIEW}" height="${VIEW}" fill="${GROUNDS[background]}"/>`;
    return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${VIEW} ${VIEW}"${size} class="anvers-mark"` +
      ` focusable="false"${a11y} data-anvers-seed="${escapeXml(mark.seed, 'seed')}" data-anvers-grammar="${GRAMMAR}">` +
      ground +
      `<path class="anvers-mark__shape anvers-mark__shape--${mark.colour}" fill="${mark.fill[scheme]}" d="${mark.d}"/>` +
      '</svg>';
  }

  // ---- DOM ---------------------------------------------------------------

  function matches(win, query) {
    try {
      return !!(win && typeof win.matchMedia === 'function' && win.matchMedia(query).matches);
    } catch (e) {
      return false;
    }
  }

  // Fails safe: if the preference cannot be read, motion is treated as
  // unwanted.
  function reducedMotion(win) {
    try {
      return !win || typeof win.matchMedia !== 'function' ||
        win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return true;
    }
  }

  // Whether the computed transition really animates 'd': the duration is
  // read at the index of the last entry naming 'd' (or 'all'), the list of
  // durations repeating as CSS repeats it.
  function transitionsD(style) {
    const props = String(style.transitionProperty).split(',').map(p => p.trim());
    const durations = String(style.transitionDuration).split(',').map(t => parseFloat(t) || 0);
    let index = -1;
    props.forEach((p, i) => { if (p === 'd' || p === 'all') index = i; });
    return index >= 0 && durations.length > 0 && durations[index % durations.length] > 0;
  }

  // The one optional motion: the pure primitive settles into its distortion,
  // once. Never under reduced motion (checked here and, independently, by the
  // stylesheet), and only where a 'd' transition will really run; everywhere
  // else the mark is simply drawn in place, with nothing left behind.
  function settle(path, mark, win) {
    if (reducedMotion(win)) return false;
    if (!(win.CSS && typeof win.CSS.supports === 'function' && win.CSS.supports('d', 'path("M 0 0")'))) return false;
    if (typeof win.requestAnimationFrame !== 'function' || !path.isConnected) return false;
    path.style.setProperty('d', `path("${mark.base}")`);
    const style = win.getComputedStyle(path);
    style.getPropertyValue('d');
    const runs = transitionsD(style) && path.getClientRects().length > 0;
    if (!runs) {
      path.style.removeProperty('d');
      return false;
    }
    win.requestAnimationFrame(() => {
      path.style.setProperty('d', `path("${mark.d}")`);
      const clear = () => path.style.removeProperty('d');
      path.addEventListener('transitionend', clear, {once: true});
      path.addEventListener('transitioncancel', clear, {once: true});
      if (typeof path.getAnimations === 'function' && path.getAnimations().length === 0) clear();
    });
    return true;
  }

  // Draws the mark into target, replacing what is there (for instance the
  // static fallback), and returns its description with `animated` added.
  // options: seed ('random', 'daily' or a seed; default 'random'), shape,
  // colour, label ('Anvers'; '' for decorative), wordmark (false), align
  // ('baseline' with the wordmark, else 'centre'), motion ('none' or
  // 'settle'; default 'none').
  function render(target, options) {
    if (!target || !target.ownerDocument || typeof target.replaceChildren !== 'function') {
      throw new TypeError('AnversIdentity.render: a DOM element is required');
    }
    const opts = options || {};
    const doc = target.ownerDocument;
    const win = doc.defaultView;
    const wordmark = opts.wordmark === true;
    const seed = resolveSeed(opts.seed);
    const mark = describe(seed, {shape: opts.shape, colour: opts.colour !== undefined ? opts.colour : opts.color,
                                 align: opts.align || (wordmark ? 'baseline' : 'centre')});
    const label = opts.label === undefined ? 'Anvers' : String(opts.label);

    const svgEl = doc.createElementNS(SVG_NS, 'svg');
    svgEl.setAttribute('viewBox', `0 0 ${VIEW} ${VIEW}`);
    // A fallback size: the stylesheet overrides it, and without the
    // stylesheet the mark still cannot fill the page.
    svgEl.setAttribute('width', String(MARK_SIZE));
    svgEl.setAttribute('height', String(MARK_SIZE));
    svgEl.setAttribute('class', 'anvers-mark');
    svgEl.setAttribute('focusable', 'false');
    // With the wordmark the name is spoken from the text, so the drawing is
    // left out of the accessibility tree; without it the drawing carries the
    // name, unless the caller asked for a decorative mark.
    if (label && !wordmark) {
      svgEl.setAttribute('role', 'img');
      svgEl.setAttribute('aria-label', label);
    } else {
      svgEl.setAttribute('aria-hidden', 'true');
    }
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', `anvers-mark__shape anvers-mark__shape--${mark.colour}`);
    path.setAttribute('fill', matches(win, '(prefers-color-scheme: dark)') ? mark.fill.dark : mark.fill.light);
    path.setAttribute('d', mark.d);
    svgEl.appendChild(path);

    const children = [svgEl];
    if (wordmark) {
      const word = doc.createElement('span');
      word.className = 'anvers-identity__wordmark';
      word.textContent = 'anvers';
      children.push(word);
    }

    target.classList.add('anvers-identity');
    target.setAttribute('data-anvers-seed', mark.seed);
    target.setAttribute('data-anvers-shape', mark.shape);
    target.setAttribute('data-anvers-colour', mark.colour);
    target.setAttribute('data-anvers-grammar', String(GRAMMAR));
    const motion = opts.motion === 'settle' ? 'settle' : 'none';
    target.setAttribute('data-anvers-motion', motion);
    target.replaceChildren(...children);
    mark.animated = motion === 'settle' ? settle(path, mark, win) : false;
    return mark;
  }

  function optionsFrom(el) {
    const data = el.dataset || {};
    const opts = {};
    if (data.seed !== undefined) opts.seed = data.seed;
    if (data.shape) opts.shape = data.shape;
    if (data.colour || data.color) opts.colour = data.colour || data.color;
    if (data.align) opts.align = data.align;
    if (el.hasAttribute('data-label')) opts.label = data.label;
    if (data.wordmark !== undefined) opts.wordmark = data.wordmark !== 'false';
    if (data.motion) opts.motion = data.motion;
    return opts;
  }

  // Renders every [data-anvers-identity] element under scope that has not
  // been rendered yet. An element whose attributes are wrong keeps its static
  // fallback and the error is reported on the console; elements in `skip`
  // (a WeakSet) are left alone, and failures are added to it.
  function mountAll(scope, skip) {
    const marks = [];
    if (!scope || typeof scope.querySelectorAll !== 'function') return marks;
    if (!skip || typeof skip.has !== 'function') skip = null;
    scope.querySelectorAll('[data-anvers-identity]').forEach(el => {
      if (el.hasAttribute('data-anvers-seed') || (skip && skip.has(el))) return;
      try {
        marks.push(render(el, optionsFrom(el)));
      } catch (e) {
        if (skip) skip.add(el);
        if (root.console) root.console.error(e);
      }
    });
    return marks;
  }

  // Mounts when the document is parsed, after any deferred script that sets
  // data attributes first (at once if the script arrives later than that),
  // and again at load for elements added in between; each failing element is
  // reported once.
  function autoMount(doc) {
    if (!doc || typeof doc.addEventListener !== 'function') return;
    const failed = typeof WeakSet === 'function' ? new WeakSet() : null;
    const run = () => mountAll(doc, failed);
    const win = doc.defaultView;
    const perf = win && win.performance;
    const nav = perf && typeof perf.getEntriesByType === 'function' ? perf.getEntriesByType('navigation')[0] : null;
    if (doc.readyState === 'complete') {
      run();
      return;
    }
    // DOMContentLoaded already under way or over: a listener added now would
    // not be called.
    if (nav && nav.domContentLoadedEventStart > 0) run();
    else doc.addEventListener('DOMContentLoaded', run, {once: true});
    if (win) win.addEventListener('load', run, {once: true});
  }

  const api = {
    version: VERSION,
    grammar: GRAMMAR,
    defaultSeed: DEFAULT_SEED,
    shapes: SHAPES,
    colours: COLOURS,
    aligns: ALIGNS,
    palette: PALETTE,
    grounds: GROUNDS,
    bounds: BOUNDS,
    floor: FLOOR,
    safe: SAFE,
    baseline: BASELINE,
    targetArea: TARGET_AREA,
    newSeed,
    resolveSeed,
    describe,
    svg,
    render,
    mountAll,
    autoMount,
  };
  // The geometry, for the tests that check the bounds themselves rather than
  // a sample of seeds. Not part of the interface.
  Object.defineProperty(api, '_geometry', {
    value: Object.freeze({draw, stretchFor, distort, place, measure, outline, angles, tooRegular}),
  });
  return Object.freeze(api);
}));
