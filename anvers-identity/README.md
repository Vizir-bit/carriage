# Anvers identity

Anvers is plain Chromium underneath; this folder is its face. The mark is a single geometric shape (a circle, a square or a triangle), coloured at random with one of three restrained primaries, and distorted within fixed bounds. A seed decides all three, so any mark can be drawn again exactly, and the rules stay the same while each mark changes: the identity lies in the grammar more than in any one drawing.

The component is portable and has no dependency. One script draws the mark into a page or writes it as a standalone SVG file, one stylesheet sizes and colours it, and nothing is fetched, stored or evaluated at run time. The engine, the packaging and the installation of Anvers are not here; they live in the local Anvers source, which Codex maintains, and this folder is meant to be reviewed and integrated from there.

## Files

| File | What it does |
|------|--------------|
| `anvers-identity.js` | The generator. A classic script that defines `AnversIdentity` and draws every element marked `data-anvers-identity`; also loads as CommonJS. |
| `anvers-identity.mjs` | The same object as an ES module. |
| `anvers-identity.css` | Size, colour tokens (light and dark), theme pins, the optional motion, reduced motion and forced colours. |
| `anvers-default.svg` | The default seed (`anvers`) as a standalone file: a static fallback, or a starting point for an icon. |
| `bin/anvers-mark.js` | Command-line exporter: a seed in, standalone SVG (or its description as JSON) out. |
| `demo/` | A reference Home page around the mark (search field, links, the seed and a button to draw another). It is a preview harness: searches are shown, not sent. |
| `previews/` | Screenshots at desktop and narrow widths in both colour schemes, and a grid of twenty-four seeds (`previews/grid.html` draws it live). |
| `test/` | Unit tests (Node only), browser tests (Playwright), the golden marks and the script that rewrites them. |

## Integrating it

The simplest integration needs no script of the page's own, which suits a page under a strict Content Security Policy. Link the stylesheet, load `anvers-identity.js` with `defer`, and mark an element:

```html
<span data-anvers-identity data-seed="random" data-wordmark="true"></span>
```

The element can hold a static fallback, which the script replaces: the demo puts the default mark there (the output of `svg('anvers', {label: ''})`), with the class `anvers-identity` on the element so that the box has its final size before the script runs and nothing moves when it does.

The attributes are:

- `data-seed`: `random` (a new mark on every load, the default), `daily` (one mark per local calendar day), or any text, which is the seed itself.
- `data-shape` and `data-colour`: pin the shape (`circle`, `square`, `triangle`) or the colour (`red`, `yellow`, `blue`); the rest of the seed's mark is unchanged.
- `data-wordmark="true"`: adds the word *anvers* under the mark, set in Futura where the system has it (every Mac does), lowercase and tracked.
- `data-label`: the accessible name, `Anvers` by default; an empty value makes the mark decorative.
- `data-motion="settle"`: the one optional motion (see below).

After drawing, the element carries `data-anvers-seed`, `data-anvers-shape`, `data-anvers-colour` and `data-anvers-grammar`, so the page can show, store or report the seed. Which seed policy Anvers should use (a new mark per tab, per day, or one stored per installation) is the integrator's choice; the module stores nothing itself.

From a script, the same object offers:

- `render(element, options)` draws into an element and returns the mark's description; the options mirror the attributes (`seed`, `shape`, `colour`, `label`, `wordmark`, `motion`).
- `describe(seed, options)` returns the mark as data, without the DOM: shape, colour, both fills, the distortion drawn, the path, its box and its area.
- `svg(seed, options)` returns standalone SVG text; besides the options above it takes `scheme` (`light` or `dark`), `background` (`none`, `paper` or `ink`) and `size` in pixels.
- `newSeed()` and `resolveSeed(input)` draw and resolve seeds; `mountAll(scope)` draws every unmarked element under `scope`.

The command-line exporter does the same from a terminal; with no seed it draws a new one and reports it on standard error. For instance, a 1024-pixel mark on paper for seed `k3f9q2xa`:

```sh
node bin/anvers-mark.js k3f9q2xa --background paper --size 1024 > mark.svg
```

## The grammar

The seed is hashed (cyrb128) into a small generator (sfc32), which always makes the same twenty-three draws in the same order, whatever the options. That is why pinning a shape or a colour leaves everything else unchanged, and why the same seed draws the same path byte for byte in Node and in Chromium.

1. **Shape**: circle, square or triangle, one third each. The triangle points up.
2. **Colour**: red, yellow or blue, one third each. Light page: red `#c0392b`, yellow `#e0a817`, blue `#1f4e99`; dark page: `#e2594b`, `#ebb935`, `#6b95dc`.
3. **Distortion**, each part between a floor, so that the distortion always shows, and a ceiling, so that the primitive is always recognisable:
   - rotation between −12° and +12°;
   - an x-shear of 0.06 to 0.18, either way;
   - a stretch of 1.06 to 1.25 along one axis and its inverse along the other (this and the shear keep the area);
   - for the square and the triangle, each vertex moved by up to a tenth of the shape's radius on each axis;
   - for the circle, built from four curves, each anchor's radius changed by up to 6 %, its angle by up to 7°, and each handle's length by up to 10 %.
4. **Placement**: the outline is scaled to a target area (2,800 for the circle, 2,500 for the square, 2,300 for the triangle, out of the 10,000 of the 100-unit box: a circle or a triangle reads smaller than a square of equal area), shrunk if it would leave the safe area (7 to 93 on both axes), and centred halfway between its bounding box and its centroid.

Circles and squares always reach their target area. A triangle widened by the distortion may have to be shrunk to stay in the safe area: in a sweep of twenty thousand seeds, 96 % of triangles stayed within 10 % of their target and none fell more than 25 % below it (the tests hold that floor).

`GRAMMAR` in the script numbers these rules. Any change that would redraw an existing seed differently must raise it; the golden test fails until `test/write-golden.js` is run on purpose, which rewrites `test/golden.json` and `anvers-default.svg`.

## Accessibility and behaviour

- **Name**: with the wordmark, the word is the name and the drawing is hidden from assistive technology; without it, the drawing is an image named *Anvers*; with an empty label it is decorative.
- **Nothing in the way**: the mark stays in the normal flow, in a square box of fixed size, and the outline never leaves that box, so it can neither cover nor push the search field and links. Nothing in it takes focus.
- **Contrast**: red and blue keep at least 4.5:1 against light and dark pages, and yellow against dark ones. Yellow on a light page is about 2:1; a yellow that reached 3:1 there would be ochre, so this is a deliberate exception for a brand mark, and a test keeps it from getting paler.
- **Motion**: the mark is static by default. With `settle`, the pure primitive eases into its distortion once, in 0.9 seconds, and then never moves again. It does not happen under reduced motion (checked both in the script and in the stylesheet), nor where CSS cannot interpolate a path; there the mark is simply drawn in place.
- **Forced colours**: the shape takes the system's text colour.
- **Without JavaScript**: the static fallback stands, in the same box.

## Tests

The unit tests need only Node (version 18 or later) and take about two seconds. From this folder:

```sh
node --test test/unit.test.js
```

They check determinism and the golden marks, the bounds and the safe area over six thousand seeds, convexity, the minimum angle of triangles, the area, even shares of shapes and colours, pinning, the palette's contrast, seed resolution, the SVG output, that the demo's static fallback matches the default seed, the three ways of loading the module, and that the source stays free of dependencies and of anything a strict policy would refuse.

The browser tests use Playwright, a test-only tool. They load the demo at five widths from 1440 down to 320 pixels in both colour schemes and check that the mark covers no control and that every control is reachable and inside the 16-pixel gutters; then the accessible names, the landmarks and the focus order; the agreement between Node and the browser; reduced motion and the settle motion; the fallback without JavaScript and the absence of layout shift; colour schemes, theme pins and forced colours; the demo's controls; loading from a file and as an ES module. Any console error, including a Content Security Policy or Trusted Types violation, fails them.

```sh
node --test test/browser.test.mjs
```

With `ANVERS_CHROMIUM` set to the browser executable inside an app bundle, they run in that browser instead, which is the way to check this component inside Anvers itself. With `ANVERS_PREVIEWS=1` they also rewrite the screenshots in `previews/`.

## What has been checked, and where

Established: both test files pass in Playwright's Chromium on Linux. Not established: behaviour on macOS and inside Anvers 0.4.0 (Chromium 158), which the browser tests can check through `ANVERS_CHROMIUM`. The previews were taken on Linux, without Futura, so the wordmark there is set in a fallback sans-serif; on a Mac it will be Futura.
