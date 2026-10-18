# Anvers identity

Anvers is plain Chromium underneath; this folder is its face. The mark is a single geometric shape (a circle, a square or a triangle), coloured at random with one of three restrained primaries, and distorted within fixed bounds. A seed decides all three, so any mark can be drawn again exactly, and the rules stay the same while each mark changes: the identity lies in the grammar more than in any one drawing.

The component is portable and has no dependency. One script draws the mark into a page or writes it as a standalone SVG file, one stylesheet sizes and colours it, and nothing is fetched, stored or evaluated at run time. The engine, the packaging and the installation of Anvers are not here; they live in the local Anvers source, which Codex maintains, and this folder is meant to be reviewed and integrated from there.

## Files

| File | What it does |
|------|--------------|
| `anvers-identity.js` | The generator. A classic script that defines `AnversIdentity` and draws every element marked `data-anvers-identity`; also loads as CommonJS. |
| `anvers-identity.mjs` | The same object as an ES module (over http, https or an extension origin; Chromium does not load modules from `file:` pages). |
| `anvers-identity.css` | Size, colour tokens (light and dark), theme pins, more contrast, the optional motion, reduced motion and forced colours. |
| `anvers-default.svg` | The default seed (`anvers`) as a standalone file: a starting point for an icon. |
| `bin/anvers-mark.js` | Command-line exporter: a seed in, standalone SVG (or its description as JSON) out. |
| `demo/` | A reference Home page around the mark (search field, links, the seed and a button to draw another). It is a preview harness: searches are shown, not sent. |
| `previews/` | Screenshots at desktop and narrow widths in both colour schemes, and a grid of twenty-four seeds covering every shape and colour (`previews/grid.html` draws it live). |
| `test/` | Unit tests (Node only), browser tests (Playwright), the golden marks and the script that rewrites them. |
| `HANDOFF.md` | The handoff to Codex: the ownership split, what to integrate, how to verify on the Mac, what is established and what is not. |

## Integrating it

The simplest integration needs no script of the page's own, which suits a page under a strict Content Security Policy. Link the stylesheet, load `anvers-identity.js` with `defer`, and mark an element. Put the default mark inside it as a static fallback, with the class `anvers-identity`, so that the box has its final size before the script runs and nothing moves when it does:

```html
<span class="anvers-identity" data-anvers-identity data-seed="random" data-wordmark="true">
  <!-- the output of AnversIdentity.svg('anvers', {label: '', size: 160, align: 'baseline'}) -->
  <span class="anvers-identity__wordmark">anvers</span>
</span>
```

`demo/index.html` shows it in place; the fallback there must stay the output of that call, which a unit test checks. Without the wordmark, the fallback is `svg('anvers', {label: '', size: 160})`.

The attributes are:

- `data-seed`: `random` (a new mark on every load, the default), `daily` (one mark per local calendar day), or any text, which is the seed itself.
- `data-shape` and `data-colour`: pin the shape (`circle`, `square`, `triangle`) or the colour (`red`, `yellow`, `blue`); the rest of the seed's mark is unchanged.
- `data-wordmark="true"`: adds the word *anvers* under the mark, set in Futura where the system has it (every Mac does), lowercase and tracked, and stands the shape on a baseline so that the gap between shape and word is the same for every seed.
- `data-label`: the accessible name, `Anvers` by default; an empty value makes the mark decorative.
- `data-align`: `centre` or `baseline`, to override the default above.
- `data-motion="settle"`: the one optional motion (see below); without it the mark is static.

After drawing, the element carries `data-anvers-seed`, `data-anvers-shape`, `data-anvers-colour` and `data-anvers-grammar`, so the page can show, store or report the seed. Which seed policy Anvers should use (a new mark per tab, per day, or one stored per installation) is the integrator's choice; the module stores nothing itself. An element whose attributes are wrong keeps its fallback, and the error goes to the console once.

From a script, the same object offers:

- `render(element, options)` draws into an element and returns the mark's description, with `animated` telling whether the settle motion runs; the options mirror the attributes (`seed`, `shape`, `colour`, `label`, `wordmark`, `align`, `motion`).
- `describe(seed, options)` returns the mark as data, without the DOM: shape, colour, both fills, the distortion applied (including whether the legibility floor stepped in), the path, its box and its area.
- `svg(seed, options)` returns standalone SVG text; besides `shape`, `colour`, `align` and `label` it takes `scheme` (`light` or `dark`), `background` (`none`, `paper` or `ink`) and `size` in pixels. It refuses, rather than writes, a seed or label holding a character XML cannot carry.
- `newSeed()` and `resolveSeed(input)` draw and resolve seeds; `mountAll(scope)` draws every element under `scope` not yet drawn.

The command-line exporter does the same from a terminal. With no seed, or with `random` or `daily`, it resolves one as a page would and reports it on standard error. For instance, a 1024-pixel mark on paper for seed `k3f9q2xa`:

```sh
node bin/anvers-mark.js k3f9q2xa --background paper --size 1024 > mark.svg
```

## The grammar

The seed, after Unicode normalisation and trimming, is hashed (cyrb128) into a small generator (sfc32), which always makes the same twenty-three draws in the same order, whatever the options. That is why pinning a shape or a colour leaves everything else unchanged, and why the same seed draws the same path byte for byte in Node and in Chromium.

1. **Shape**: circle, square or triangle, one third each. The triangle points up.
2. **Colour**: red, yellow or blue, one third each. Light page: red `#c0392b`, yellow `#e0a817`, blue `#1f4e99`; dark page: `#e2594b`, `#ebb935`, `#538ae6` (red and blue at the same lightness).
3. **Distortion**, each part between a floor, so that the distortion always shows, and a ceiling, so that the primitive is always recognisable:
   - rotation between −12° and +12°;
   - an x-shear of 0.06 to 0.18, either way;
   - a stretch that multiplies one axis by a factor and divides the other by it, so that the aspect changes by the factor squared: 1.06 to 1.12 for the square and the triangle (aspect 1.12 to 1.25), 1.06 to 1.20 for the circle (1.12 to 1.44); this and the shear keep the area;
   - for the square and the triangle, each vertex moved by up to a tenth of the shape's radius on each axis. The circle has no vertex to move: its distortion is purely affine, so it becomes an ellipse and stays a clean geometric figure.
4. **Legibility floor**: a polygon that the distortions above happen to leave close to its regular form (every angle within 8° of the regular one and, for the square, sides within 1.2:1) is drawn again with its vertex shifts mirrored and, if that is not enough, with the shear at its ceiling. Both steps are deterministic. In a sweep of twenty thousand seeds per shape, four squares and five triangles remained that close.
5. **Placement**: the outline is scaled to a target area (2,800 for the circle, 2,500 for the square, 2,300 for the triangle, out of the 10,000 of the 100-unit box: a circle or a triangle reads smaller than a square of equal area) and shrunk if it would leave its room. Horizontally it is centred halfway between its bounding box and its centroid. Vertically it is centred the same way inside the safe area (7 to 93), or, with the wordmark, it stands on the baseline at 88.

Circles and squares always reach their target area. A triangle widened or heightened by the distortion may have to be shrunk to stay in its room. Over every combination of the bounds' extremes and midpoints (2.8 million cases for each alignment), no triangle fell below 86 % of its target when centred, or 79 % when standing on the baseline. The tests enumerate the same bounds, more coarsely, and hold 85 % and 78 %.

`GRAMMAR` in the script numbers these rules; this is grammar 2. Grammar 1 was the review draft (commit `3205963`), replaced before any integration. Any change that would redraw an existing seed, palette included, must raise it. The golden test fails until `test/write-golden.js` is run on purpose, which rewrites `test/golden.json` and `anvers-default.svg`; the demo's static fallback is then regenerated from the call shown above.

## Accessibility and behaviour

- **Name**: with the wordmark, the word is the name and the drawing is hidden from assistive technology; without it, the drawing is an image named *Anvers*; with an empty label it is decorative. Standalone SVG carries one name only (no duplicate title).
- **Nothing in the way**: the mark stays in the normal flow, in a square box of fixed size, and the outline never leaves that box, so it can neither cover nor push the search field and links. Nothing in it takes focus. Without the stylesheet the mark still has a 160-pixel size of its own.
- **Size**: the mark is 96 to 160 pixels (24 % of the viewport's smaller side in between); the wordmark is in proportion but never smaller than the reader's own text size, so it follows zoom and the browser's font setting.
- **Contrast**: red and blue keep at least 4.5:1 against light and dark pages, and yellow against dark ones. Yellow on a light page is about 2:1; a yellow that reached 3:1 there would be ochre, so this is a deliberate exception for a brand mark, and a test keeps it from getting paler. When the system asks for more contrast, that yellow does turn ochre (3.6:1 on paper).
- **Motion**: the mark is static by default. With `settle`, the pure primitive eases into its distortion once, in 0.9 seconds, and then never moves again. It does not happen under reduced motion (checked by the script and, independently, by the stylesheet), nor where a transition cannot run (a hidden or detached element, a page without the stylesheet); there the mark is simply drawn in place and nothing is left behind.
- **Forced colours**: the shape takes the system's text colour.
- **Without JavaScript**: the static fallback stands, in the same box.

## Tests

The unit tests need only Node (version 18 or later) and take about four seconds. From this folder:

```sh
node --test test/unit.test.js
```

They pin the documented bounds, safe area, baseline and palette, and check determinism (Unicode forms included) against golden marks. They enumerate the bounds' extremes through the module's own geometry: room, convexity, weight and the triangle's smallest angle. Over six thousand seeds they check the safe area, area, convexity and the legibility floor. They also check the shares of shapes and colours, pinning, contrast, that the stylesheet carries the same palette in every block, seed resolution (`daily` in a time zone where local and UTC dates differ), the SVG output (hostile and awkward seeds, invalid characters, bad options), the static files, both module formats, the command line including the example above, and that the source stays free of dependencies and of anything a strict policy would refuse.

The browser tests use Playwright, a test-only tool; install it first:

```sh
npm install --no-save --no-package-lock playwright@1.56.1
npx playwright install chromium
node --test test/browser.test.mjs
```

They load the demo on fixed seeds (the first circle, square and triangle, and the widest and tallest marks) at six sizes from 1440 × 900 down to 320 × 568 and 568 × 320, in both colour schemes. They check that the mark covers no control and that every control is reachable and inside the 16-pixel gutters. They also check:

- long labels and seeds at 320 pixels, the constant lockup gap, and the size without the stylesheet;
- the accessible names, the landmarks and the whole focus order, the search field's contrast, and the wordmark's size under a larger font setting;
- that the seed shown is the seed drawn, the declarative attributes, and an element with a wrong attribute;
- loading late and next to a global `module`;
- the static default, reduced motion (with the script's check hidden, to test the stylesheet alone) and the settle motion with its failure cases;
- the fallback without JavaScript, with no layout shift;
- every colour under both schemes, theme pins, more contrast and forced colours;
- the demo's controls, `file:` pages and the ES module entry.

Any console error, including a Content Security Policy or Trusted Types violation, fails them. The browser version is printed first.

With `ANVERS_CHROMIUM` set to the browser executable inside an app bundle, they run in that browser instead, which is the way to check this component inside Anvers itself; with it (or under CI) a missing Playwright is an error, not a skip. With `ANVERS_PREVIEWS=1` they also rewrite the screenshots in `previews/`.

## What has been checked, and where

Established: both test files pass in Playwright's Chromium 141 on Linux, and the repository's workflow for this folder runs them on GitHub's Ubuntu runner for every change. Not established: behaviour on macOS and inside Anvers 0.4.0 (Chromium 158), which the browser tests can check through `ANVERS_CHROMIUM`. The previews were taken on Linux, without Futura, so the wordmark there is set in a fallback sans-serif; on a Mac it will be Futura.
