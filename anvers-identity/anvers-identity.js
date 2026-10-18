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
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else {
    root.AnversIdentity = api;
    api.autoMount(root.document);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const GRAMMAR = 1;
  const DEFAULT_SEED = 'anvers';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // The mark is drawn in a 100 x 100 box; the outline always stays inside
  // SAFE, so the shape can never paint outside its own box.
  const VIEW = 100;
  const SAFE = Object.freeze({min: 7, max: 93});

  const SHAPES = Object.freeze(['circle', 'square', 'triangle']);
  const COLOURS = Object.freeze(['red', 'yellow', 'blue']);

  // Restrained primaries: print-like rather than screen-pure. The dark set is
  // lifted so red and blue keep at least 3:1 against a dark page.
  const PALETTE = Object.freeze({
    light: Object.freeze({red: '#c0392b', yellow: '#e0a817', blue: '#1f4e99'}),
    dark: Object.freeze({red: '#e2594b', yellow: '#ebb935', blue: '#6b95dc'}),
  });
  const GROUNDS = Object.freeze({paper: '#f3efe6', ink: '#161616'});

  // Every distortion has a floor and a ceiling: the floor keeps the mark
  // visibly distorted, the ceiling keeps the primitive recognisable.
  const BOUNDS = Object.freeze({
    rotate: Object.freeze([-12, 12]),     // degrees
    shear: Object.freeze([0.06, 0.18]),   // |k| of an x-shear, either sign
    stretch: Object.freeze([1.06, 1.25]), // aspect factor, either axis
    vertex: 0.10,   // polygon vertex shift per axis, in unit-radius terms
    radial: 0.06,   // circle anchor radius change, in unit-radius terms
    angular: 7,     // circle anchor angle change, degrees
    handle: 0.10,   // circle handle length change, relative
  });

  // Equal areas do not look equal: a circle and a triangle read smaller than
  // a square of the same area, so they get a little more.
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
    if (input === undefined || input === null || input === 'random') return newSeed();
    if (input === 'daily') {
      const day = now instanceof Date ? now : new Date();
      const pad = n => String(n).padStart(2, '0');
      return `day-${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    }
    const seed = String(input).trim();
    return seed === '' ? newSeed() : seed;
  }

  // ---- Geometry ----------------------------------------------------------

  const lerp = (lo, hi, u) => lo + (hi - lo) * u;
  const toRad = deg => deg * Math.PI / 180;
  const round2 = n => Math.round(n * 100) / 100;
  const fmt = n => round2(n).toFixed(2);

  // The draws are taken in a fixed order and always in the same number,
  // whatever the shape, so pinning a shape or colour leaves the rest of the
  // seed's mark unchanged.
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
      stretch: Math.exp((stretchSignU < 0.5 ? -1 : 1) *
                        lerp(Math.log(BOUNDS.stretch[0]), Math.log(BOUNDS.stretch[1]), stretchU)),
      jitter,
    };
  }

  // Unit primitives centred on the origin (y grows downwards, as in SVG).
  // Polygons are lists of vertices; the circle is four cubic curves, given as
  // a closed list [anchor, out-handle, in-handle, anchor, ...].
  function polygon(shape, jitter, distorted) {
    const base = shape === 'square'
      ? [[-1, -1], [1, -1], [1, 1], [-1, 1]]
      : [[0, -1], [Math.cos(toRad(30)), Math.sin(toRad(30))], [-Math.cos(toRad(30)), Math.sin(toRad(30))]];
    if (!distorted) return base;
    return base.map(([x, y], i) => [x + jitter[2 * i] * BOUNDS.vertex,
                                    y + jitter[2 * i + 1] * BOUNDS.vertex]);
  }

  function circle(jitter, distorted) {
    const anchors = [];
    for (let i = 0; i < 4; i++) {
      const radius = distorted ? 1 + jitter[i] * BOUNDS.radial : 1;
      const angle = toRad(i * 90 + (distorted ? jitter[4 + i] * BOUNDS.angular : 0));
      anchors.push({radius, angle,
                    out: distorted ? 1 + jitter[8 + i] * BOUNDS.handle : 1,
                    in: distorted ? 1 + jitter[12 + i] * BOUNDS.handle : 1});
    }
    const points = [];
    for (let i = 0; i < 4; i++) {
      const a = anchors[i], b = anchors[(i + 1) % 4];
      const bAngle = i === 3 ? b.angle + 2 * Math.PI : b.angle;
      const k = 4 / 3 * Math.tan((bAngle - a.angle) / 4);
      const pa = [a.radius * Math.cos(a.angle), a.radius * Math.sin(a.angle)];
      const pb = [b.radius * Math.cos(b.angle), b.radius * Math.sin(b.angle)];
      const ta = [-Math.sin(a.angle), Math.cos(a.angle)];
      const tb = [-Math.sin(b.angle), Math.cos(b.angle)];
      const la = k * a.radius * a.out, lb = k * b.radius * b.in;
      if (i === 0) points.push(pa);
      points.push([pa[0] + la * ta[0], pa[1] + la * ta[1]],
                  [pb[0] - lb * tb[0], pb[1] - lb * tb[1]],
                  pb);
    }
    return points;
  }

  // rotate . shear . stretch; every factor has determinant 1, so the affine
  // part never changes the area, only the proportions.
  function affine(points, d) {
    const c = Math.cos(toRad(d.rotate)), s = Math.sin(toRad(d.rotate));
    return points.map(([x, y]) => {
      const sx = x * d.stretch, sy = y / d.stretch;
      const hx = sx + d.shear * sy;
      return [c * hx - s * sy, s * hx + c * sy];
    });
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

  // Scale to the shape's target area, shrink if it would leave the safe box,
  // centre it between its bounding box and its centroid (the optical centre
  // of a triangle sits between the two), and nudge it back inside if needed.
  function place(shape, points) {
    let m = measure(outline(shape, points));
    let pts = transform(points, Math.sqrt(TARGET_AREA[shape] / m.area), 0, 0);
    m = measure(outline(shape, pts));
    const room = SAFE.max - SAFE.min;
    if (m.box.w > room || m.box.h > room) {
      pts = transform(pts, room / Math.max(m.box.w, m.box.h), 0, 0);
      m = measure(outline(shape, pts));
    }
    const cx = ((m.box.minX + m.box.maxX) / 2 + m.centroid[0]) / 2;
    const cy = ((m.box.minY + m.box.maxY) / 2 + m.centroid[1]) / 2;
    pts = transform(pts, 1, VIEW / 2 - cx, VIEW / 2 - cy);
    m = measure(outline(shape, pts));
    const nudgeX = Math.max(0, SAFE.min - m.box.minX) - Math.max(0, m.box.maxX - SAFE.max);
    const nudgeY = Math.max(0, SAFE.min - m.box.minY) - Math.max(0, m.box.maxY - SAFE.max);
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
  // beyond the seed.
  function describe(seed, options) {
    const opts = options || {};
    const text = String(seed === undefined || seed === null ? DEFAULT_SEED : seed).trim() || DEFAULT_SEED;
    const drawn = draw(text);
    const shape = checkPin('shape', opts.shape, SHAPES) || drawn.shape;
    const colour = checkPin('colour', opts.colour !== undefined ? opts.colour : opts.color, COLOURS) || drawn.colour;
    const unit = shape === 'circle' ? circle(drawn.jitter, true) : polygon(shape, drawn.jitter, true);
    const unitBase = shape === 'circle' ? circle(drawn.jitter, false) : polygon(shape, drawn.jitter, false);
    const final = place(shape, affine(unit, drawn));
    const base = place(shape, unitBase);
    const box = final.measure.box;
    return {
      seed: text,
      grammar: GRAMMAR,
      shape,
      colour,
      fill: {light: PALETTE.light[colour], dark: PALETTE.dark[colour]},
      distortion: {
        rotate: round2(drawn.rotate),
        shear: Math.round(drawn.shear * 1000) / 1000,
        stretch: Math.round(drawn.stretch * 1000) / 1000,
        jitter: drawn.jitter.slice(0, shape === 'circle' ? 16 : shape === 'square' ? 8 : 6)
          .map(j => Math.round(j * 1000) / 1000),
      },
      d: pathData(shape, final.points),
      base: pathData(shape, base.points),
      box: {x: round2(box.minX), y: round2(box.minY), w: round2(box.w), h: round2(box.h)},
      area: round2(final.measure.area),
    };
  }

  // ---- SVG text ----------------------------------------------------------

  const escapeXml = text => String(text).replace(/[&<>"']/g, ch => (
    {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[ch]));

  // The mark as standalone SVG text, for files, icons and a static fallback.
  // options: shape, colour, label ('' for decorative), scheme ('light' or
  // 'dark'), background ('none', 'paper' or 'ink'), size (pixels).
  function svg(seed, options) {
    const opts = options || {};
    const mark = describe(seed, opts);
    const label = opts.label === undefined ? 'Anvers' : String(opts.label);
    const scheme = opts.scheme === 'dark' ? 'dark' : 'light';
    const background = opts.background || 'none';
    if (background !== 'none' && !GROUNDS[background]) {
      throw new RangeError(`AnversIdentity: background must be none, paper or ink; got ${background}`);
    }
    const size = opts.size ? ` width="${Number(opts.size)}" height="${Number(opts.size)}"` : '';
    const a11y = label
      ? ` role="img" aria-label="${escapeXml(label)}"`
      : ' aria-hidden="true"';
    const ground = background === 'none'
      ? ''
      : `<rect width="${VIEW}" height="${VIEW}" fill="${GROUNDS[background]}"/>`;
    const title = label ? `<title>${escapeXml(label)}</title>` : '';
    return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${VIEW} ${VIEW}"${size} class="anvers-mark"` +
      ` focusable="false"${a11y} data-anvers-seed="${escapeXml(mark.seed)}" data-anvers-grammar="${GRAMMAR}">` +
      title + ground +
      `<path class="anvers-mark__shape anvers-mark__shape--${mark.colour}" fill="${mark.fill[scheme]}" d="${mark.d}"/>` +
      '</svg>';
  }

  // ---- DOM ---------------------------------------------------------------

  function reducedMotion(win) {
    try {
      return !win || typeof win.matchMedia !== 'function' ||
        win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return true;
    }
  }

  // The one optional motion: the pure primitive settles into its distortion,
  // once. Never under reduced motion, and only where CSS can interpolate 'd'
  // (Chromium can); everywhere else the mark is simply drawn in place.
  function settle(path, mark, win) {
    if (reducedMotion(win)) return false;
    if (!(win.CSS && typeof win.CSS.supports === 'function' && win.CSS.supports('d', 'path("M 0 0")'))) return false;
    if (typeof win.requestAnimationFrame !== 'function') return false;
    path.style.setProperty('d', `path("${mark.base}")`);
    win.getComputedStyle(path).getPropertyValue('d');
    win.requestAnimationFrame(() => {
      path.style.setProperty('d', `path("${mark.d}")`);
      path.addEventListener('transitionend', () => path.style.removeProperty('d'), {once: true});
    });
    return true;
  }

  // Draws the mark into target, replacing what is there (for instance the
  // static fallback). options: seed ('random', 'daily' or a seed; default
  // 'random'), shape, colour, label ('Anvers'; '' for decorative), wordmark
  // (false), motion ('none' or 'settle'; default 'none').
  function render(target, options) {
    if (!target || !target.ownerDocument || typeof target.replaceChildren !== 'function') {
      throw new TypeError('AnversIdentity.render: a DOM element is required');
    }
    const opts = options || {};
    const doc = target.ownerDocument;
    const win = doc.defaultView;
    const seed = resolveSeed(opts.seed);
    const mark = describe(seed, opts);
    const label = opts.label === undefined ? 'Anvers' : String(opts.label);
    const wordmark = opts.wordmark === true;

    const svgEl = doc.createElementNS(SVG_NS, 'svg');
    svgEl.setAttribute('viewBox', `0 0 ${VIEW} ${VIEW}`);
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
    path.setAttribute('fill', mark.fill.light);
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
    if (el.hasAttribute('data-label')) opts.label = data.label;
    if (data.wordmark !== undefined) opts.wordmark = data.wordmark !== 'false';
    if (data.motion) opts.motion = data.motion;
    return opts;
  }

  // Renders every [data-anvers-identity] element under scope that has not
  // been rendered yet. An element whose attributes are wrong keeps its static
  // fallback and the error is reported on the console.
  function mountAll(scope) {
    const marks = [];
    if (!scope || typeof scope.querySelectorAll !== 'function') return marks;
    scope.querySelectorAll('[data-anvers-identity]').forEach(el => {
      if (el.hasAttribute('data-anvers-seed')) return;
      try {
        marks.push(render(el, optionsFrom(el)));
      } catch (e) {
        if (root.console) root.console.error(e);
      }
    });
    return marks;
  }

  // Mounts once the document is parsed, after any deferred script that sets
  // data attributes first.
  function autoMount(doc) {
    if (!doc || typeof doc.addEventListener !== 'function') return;
    if (doc.readyState === 'complete') {
      mountAll(doc);
      return;
    }
    const run = () => mountAll(doc);
    doc.addEventListener('DOMContentLoaded', run, {once: true});
    if (doc.defaultView) doc.defaultView.addEventListener('load', run, {once: true});
  }

  return Object.freeze({
    version: VERSION,
    grammar: GRAMMAR,
    defaultSeed: DEFAULT_SEED,
    shapes: SHAPES,
    colours: COLOURS,
    palette: PALETTE,
    grounds: GROUNDS,
    bounds: BOUNDS,
    safe: SAFE,
    targetArea: TARGET_AREA,
    newSeed,
    resolveSeed,
    describe,
    svg,
    render,
    mountAll,
    autoMount,
  });
}));
