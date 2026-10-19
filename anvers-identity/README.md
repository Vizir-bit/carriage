# Anvers identity

Anvers is plain Chromium underneath; this folder is its face. The mark is a single geometric shape (a circle, a square or a triangle), coloured at random with one of three restrained primaries, and distorted within fixed bounds. A seed decides all three, so any mark can be drawn again exactly, and the rules stay the same while each mark changes: the identity lies in the grammar more than in any one drawing.

The component is portable and has no dependency. One script draws the mark into a page or writes it as a standalone SVG file, one stylesheet sizes and colours it, and nothing is fetched, stored or evaluated at run time. The engine, the packaging and the installation of Anvers are not here; they live in the local Anvers source, which Codex maintains, and this folder is meant to be reviewed and integrated from there.

## Files

| File | What it does |
|------|--------------|
| `anvers-identity.js` | The generator. A classic script that defines `AnversIdentity` (in pages and in workers) and draws every element marked `data-anvers-identity`; also loads as CommonJS. |
| `anvers-identity.mjs` | The same object as an ES module, in pages and module workers (over http, https or an extension origin; Chromium does not load modules from `file:` pages). |
| `anvers-identity.css` | Size, colour tokens (light and dark), theme pins, more contrast, the optional motion, reduced motion and forced colours. |
| `anvers-default.svg` | The default seed (`anvers`) as a standalone file: a starting point for an icon. |
| `bin/anvers-mark.js` | Command-line exporter: a seed in, standalone SVG (or its description as JSON) out. |
| `themes/` | Browser themes: one standalone folder per theme, each holding a single colour-only `manifest.json`. |
| `anvers-themes.js`, `bin/anvers-themes.js` | The themes as a table, with their contrast checks, and the script that writes `themes/` from it. |
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
- `data-wordmark="true"`: adds the word *anvers* under the mark, set in Futura where the system has it (every Mac does), lowercase and tracked. The shape then stands on a baseline, and the word sits just under it, so that shape and word read as one group with the same gap for every seed.
- `data-label`: the accessible name, `Anvers` by default; an empty value makes the mark decorative.
- `data-align`: `centre` or `baseline`, to override the default above.
- `data-motion="settle"`: the one optional motion (see below); without it the mark is static.

After drawing, the element carries `data-anvers-seed`, `data-anvers-shape`, `data-anvers-colour` and `data-anvers-grammar`, so the page can show, store or report the seed. Which seed policy Anvers should use (a new mark per tab, per day, or one stored per installation) is the integrator's choice; the module stores nothing itself. The script draws marked elements when the document is parsed and again at load, for elements added in between; an element whose attributes are wrong keeps its fallback, and its error goes to the console once.

From a script, the same object offers:

- `render(element, options)` draws into an element and returns the mark's description, with `animated` telling whether the settle motion was started; the options mirror the attributes (`seed`, `shape`, `colour`, `label`, `wordmark`, `align`, `motion`).
- `describe(seed, options)` returns the mark as data, without the DOM: shape, colour, both fills, the distortion applied (including which step of the legibility floor, if any, was taken), the path, its box and its area.
- `svg(seed, options)` returns standalone SVG text; besides `shape`, `colour`, `align` and `label` it takes `scheme` (`light` or `dark`), `background` (`none`, `paper` or `ink`) and `size` in pixels. It refuses, rather than writes, a seed or label holding a character XML cannot carry.
- `newSeed()` and `resolveSeed(input)` draw and resolve seeds; `mountAll(scope)` draws every element under `scope` not yet drawn, for elements added after load.

`describe()` and `svg()` touch no DOM, so they also work in workers. The command-line exporter does the same from a terminal. With no seed, or with `random` or `daily`, it resolves one as a page would and reports it on standard error. For instance, a 1024-pixel mark on paper for seed `k3f9q2xa`:

```sh
node bin/anvers-mark.js k3f9q2xa --background paper --size 1024 > mark.svg
```

## The grammar

The seed, after Unicode normalisation and trimming, is hashed (cyrb128) together with the grammar's number into a small generator (sfc32). The generator always makes the same twenty-three draws in the same order, whatever the options. That is why pinning a shape or a colour leaves everything else unchanged, and why the same seed draws the same path byte for byte in Node and in Chromium. A new grammar draws every seed afresh.

1. **Shape**: circle, square or triangle, one third each. The triangle points up.
2. **Colour**: red, yellow or blue, one third each. Light page: red `#c0392b`, yellow `#e0a817`, blue `#1f4e99`; dark page: `#e2594b`, `#ebb935`, `#538ae6` (red and blue at the same lightness).
3. **Distortion**, each part between a floor, so that the distortion always shows, and a ceiling, so that the primitive is always recognisable:
   - rotation between −12° and +12°;
   - an x-shear of 0.06 to 0.18, either way;
   - a stretch that multiplies one axis by a factor and divides the other by it, so that the aspect changes by the factor squared: 1.06 to 1.12 for the square and the triangle (aspect 1.12 to 1.25), 1.06 to 1.20 for the circle (1.12 to 1.44); this and the shear keep the area;
   - for the square and the triangle, each vertex moved by up to a tenth of the shape's radius on each axis. The circle has no vertex to move: its distortion is purely affine, so it becomes an ellipse and stays a clean geometric figure.
4. **Legibility floor**: a polygon that the distortions above happen to leave too close to its regular form is drawn again with its vertex shifts mirrored and, if that is not enough, with the shear at its ceiling. Both steps are deterministic. Too close means every angle within 8° of the regular one and, for the square, sides within 1.2:1. A square with every corner within 5° of a right angle also counts, since a plain rectangle reads as another shape. Across three families of twenty thousand seeds per shape, between 0.025 % and 0.05 % of polygons stayed that close after both steps; the tests hold it under 0.2 %.
5. **Placement**: the outline is scaled to a target area of 2,800 for the circle, 2,500 for the square and 2,300 for the triangle, out of the 10,000 of the 100-unit box. A circle reads smaller than a square of equal area, so it gets more; a triangle spreads wider and taller, so it gets less. The outline is shrunk if it would leave its room. Horizontally it is centred halfway between its bounding box and its centroid. Vertically it is centred the same way inside the safe area (7 to 93), or, with the wordmark, it stands on the baseline at 88.

Circles and squares always reach their target area. A triangle widened or heightened by the distortion may have to be shrunk to stay in its room. Over every combination of the bounds' extremes and midpoints (2.8 million cases for each alignment), no triangle fell below 86 % of its target when centred, or 79 % when standing on the baseline. The tests enumerate the same bounds, more coarsely, and hold 85 % and 78 %.

The baseline is geometric: every shape's lowest point touches it. A shape standing on a corner therefore looks slightly higher above the word than one standing on a flat side, by up to about 10 pixels at 160. An optical correction was considered and left out, since it would trade the exact baseline for a variation seen only from one load to the next.

`GRAMMAR` in the script numbers these rules; this is grammar 3. Grammars 1 and 2 were review drafts (commits `3205963` and `db116fb`), replaced before any integration. Any change that would redraw an existing seed, palette included, must raise it. The golden test fails until `test/write-golden.js` is run on purpose, which rewrites `test/golden.json` (named seeds, plus one for every shape and every step of the floor) and `anvers-default.svg`; the demo's static fallback is then regenerated from the call shown above.

## Accessibility and behaviour

- **Name**: with the wordmark, the word is the name and the drawing is hidden from assistive technology; without it, the drawing is an image named *Anvers*; with an empty label it is decorative. Standalone SVG carries one name only (no duplicate title).
- **Nothing in the way**: the mark stays in the normal flow, in a square box of fixed size, and the outline never leaves that box, so it can neither cover nor push the search field and links. Nothing in it takes focus. Without any stylesheet the mark still has its own 160-pixel size and the colour scheme's fill.
- **Size**: the mark is 96 to 160 pixels (24 % of the viewport's smaller side in between); the wordmark is in proportion but never smaller than the reader's own text size, so it follows zoom and the browser's font setting.
- **Contrast**: red and blue keep at least 4.5:1 against light and dark pages, and yellow against dark ones. Yellow on a light page is about 2:1; a yellow that reached 3:1 there would be ochre, so this is a deliberate exception for a brand mark, and a test keeps it from getting paler. When the system asks for more contrast, that yellow does turn ochre: 3.45:1 on paper, 3.6:1 on the demo page.
- **Theme pins**: `data-anvers-theme="light"` or `"dark"` on the element or an ancestor overrides the system scheme. Pins are not nested: where a dark pin applies, on the element or above it, it wins, with or without more contrast.
- **Motion**: the mark is static by default. With `settle`, the pure primitive eases into its distortion once, in 0.9 seconds, and then never moves again. It does not happen under reduced motion: the script checks, failing safe if the preference cannot be read, and the stylesheet checks independently. Nor does it happen where a transition cannot run, such as a hidden or detached element or a page without the stylesheet. There the mark is simply drawn in place, and a settle that is cancelled leaves nothing behind.
- **Forced colours**: the shape takes the system's text colour.
- **Without JavaScript**: the static fallback stands, in the same box, and the demo offers no control that only a script could make work.

## Browser themes

Beyond the page, Anvers's colours reach the browser itself (frame, tabs, toolbar, address bar and bookmark text) through Chromium themes. A theme is data, not code, so Chromium stays unmodified. Each folder under `themes/` holds one `manifest.json` with colours only: no images, no tints and no `ntp_*` key. The themes use the identity's palette (red `#c0392b`, yellow `#e0a817`, blue `#1f4e99`, paper `#f3efe6`, ink `#161616`), plus white and, for the default's icons, a dark red, `#7a2318`.

| Folder | Role | Frame | Unfocused frame | Toolbar and active tab | Toolbar text | Icons |
|--------|------|-------|-----------------|------------------------|--------------|-------|
| `anvers-bauhaus` | default | blue | ink | yellow | ink | dark red |
| `anvers-bauhaus-red` | alternative | red | ink | blue | white | paper |
| `anvers-bauhaus-ink` | alternative | ink | ink | red | white | paper |
| `anvers-reference-0.5.0` | reference | `#1d4f9e` | `#111111` | `#f4f1ea` | `#111111` | Chromium's own |

In the three Bauhaus themes the text on the frame is white, and the address field is white with ink text.

The default follows the composition Codex reported for the theme installed with Anvers 0.5.2: blue frame, yellow active tab and toolbar, dark-red navigation icons, white address field, dark text. Its values are the identity's own, because 0.5.2's exact values were asked for on the pull request and have not been given; if they differ, they replace these in `anvers-themes.js`. The reference is the 0.5.0 theme as Codex reported it, without its `ntp_*` keys. It sets only the reported keys, Chromium derives the rest, and so only the states built from reported keys are computed for it.

### What Chromium does with a theme

These points bear on integration. Each is graded.

- **The New Tab page.** Established in Chromium 141, by the browser test: with any of these themes, Chromium paints its own New Tab page in the toolbar colour, although no theme sets an `ntp_*` key. So the stock page turns yellow under the default, blue under the red theme, red under the ink theme, and `#f4f1ea` under the reference. Only `ntp_background` would hold it, and the themes leave that key to Codex. Anvers's homepage, which Codex placed on Chromium's New Tab routes, keeps its own colours where its stylesheet sets them; that is Codex's to check, on both routes.
- **Private windows.** Chromium does not theme them: they keep Chromium's own dark colours whatever a theme says. The themes therefore set no incognito key.
- **States, not just colours.** Chromium mixes some fills from the theme's colours: a hovered background tab is 40% toolbar over the frame, a selected tab 75%, a hovered selected tab 85%. It keeps the background-tab text on a hovered tab, and draws the new-tab button of an unfocused window in the icon colour at 43% opacity. `anvers-themes.js` checks every text and icon in each of these fourteen states.

**Contrast.** Computed from the colours with WCAG's formula, by the generator and, independently, by the unit tests:

- **The alternatives** pass every state: each text at least 4.5:1 and each icon at least 3:1.
- **The default** passes eleven states. Its narrowest margins are the hovered background tab at 4.96:1 and the dark-red icons on yellow at 4.70:1. It has three named exceptions, which the 0.5.2 composition imposes whatever its exact values, because the frame is dark, the toolbar light and the icons dark:
  - the text of a hovered tab that is selected but not active: 2.63:1, or 2.83:1 in an unfocused window;
  - the new-tab button in an unfocused window: 1.21:1.

  The tests allow no other failure, and only these three kinds of state may be named.
- **A limit no key can lift.** Chromium draws a fixed grey globe, `#5f6368`, for pages without an icon.

`node bin/anvers-themes.js` rewrites the folders from `anvers-themes.js`. It prints every state with its contrast and writes nothing if a state fails outside the named exceptions.

**Loading.** To use a theme, Chromium loads its folder with `--load-extension`; installing it stays with Codex. Chromium writes a compiled `Cached Theme.pak` into the folder it loads, so load a copy; Codex reports that its packaging does. `themes/.gitignore` keeps that file out of the repository. The manifests carry no `key`, so Chromium derives a theme's identifier from the folder's path. A copy at a new path is therefore a new theme to Chromium. A stable path for the runtime copy, or a `key` added in packaging, keeps one identifier; that choice is Codex's.

## Tests

The unit tests need only Node (version 18 or later) and take about five seconds. From this folder:

```sh
node --test test/unit.test.js
```

They pin the documented bounds, safe area, baseline and palette, and check determinism (Unicode forms included) against golden marks covering every shape and every step of the floor. They also check:

- **The bounds themselves:** an enumeration of their extremes through the module's own geometry, for room, convexity, weight and the triangle's smallest angle.
- **Six thousand seeds:** the safe area, area, convexity, the legibility floor (with its shear step exactly at the ceiling), and the undistorted start standing where the mark stands.
- **Shares, pinning and colour:** even shares of shapes and colours, pinning, contrast as stated, and the same palette in every block of the stylesheet.
- **Seeds:** all 32 symbols of new seeds, keywords after trimming, and `daily` in a time zone where local and UTC dates differ.
- **The SVG output:** hostile and awkward seeds, invalid characters, accented text, empty and bad options.
- **Files and loading:** the static files, both module formats, the exports map, the command line including the example above, and that the sources stay ASCII, free of dependencies and of anything a strict policy would refuse.
- **Themes:** they read the committed manifests, the files Chromium loads, and check them with their own lists and arithmetic. Every key must be one of Chromium's theme colours (written out from its source), with no `ntp_*` or incognito key, and every value a valid colour. The table must match the files key for key, and the files must be exactly what the generator writes. The generator must refuse a failing theme and write nothing. Every text and icon must hold its contrast in each of the fourteen states, outside the default's three named exceptions. The default must have the composition Codex described, and the reference Codex's reported values.

The browser tests use Playwright, a test-only tool; install it first:

```sh
npm install --no-save --no-package-lock playwright@1.56.1
npx playwright install chromium
node --test test/browser.test.mjs
```

They load the demo on fixed seeds (the first circle, square and triangle, and the widest and tallest marks) at six sizes from 1440 × 900 down to 320 × 568 and 568 × 320, in both colour schemes. They check that the mark covers no control and that every control is reachable and inside the 16-pixel gutters. They also check:

- long labels and seeds at 320 pixels;
- the lockup: one gap for every seed, the word centred and grouped with the mark;
- the mark with no stylesheet at all;
- the accessible names, the landmarks and the whole focus order, the search field's contrast;
- the mark's and the wordmark's sizes;
- that the seed shown is the seed drawn;
- the declarative attributes and an element with a wrong attribute;
- automatic drawing of elements added before load, with each error reported once;
- loading in workers, late, and next to a global `module`;
- the static default;
- reduced motion, with the script's check and the stylesheet's each tested alone;
- the settle motion and every way it can fail;
- the fallback without JavaScript, with no layout shift, and the demo with its script missing;
- every colour under both schemes, theme pins, nested pins, more contrast and forced colours;
- the demo's controls, `file:` pages and the ES module entry;
- every theme folder, loaded into a full Chromium (never the headless shell, which has no extensions) through `--load-extension` alone, with Playwright's default `--disable-extensions` dropped, since under it Chromium skips that switch. The profile must record the folder as the active theme, and Chromium must have compiled its theme pack. Chromium's New Tab page must take the theme's toolbar colour, which shows the colours reaching the page. After a restart without the switch, the theme must still be active and painted. A theme Chromium refuses fails this test.

Any console error, including a Content Security Policy or Trusted Types violation, fails them. The browser version is printed first.

With `ANVERS_CHROMIUM` set to the browser executable inside an app bundle, they run in that browser instead, which is the way to check this component inside Anvers itself; with it (or under CI) a missing Playwright is an error, not a skip, and the repository's workflow also fails if any test but the previews is skipped. With `ANVERS_PREVIEWS=1` they also rewrite the screenshots in `previews/`.

## What has been checked, and where

Established: both test files pass in Playwright's Chromium 141 on Linux, and the repository's workflow for this folder runs them on GitHub's Ubuntu runner for every change. Each of twenty deliberate faults in the component, one per gap that two rounds of review found, makes them fail; so does each fault an adversarial review of the themes tried (a broken manifest, a key dropped or misspelt, colours swapped in the generator, a contrast state removed, the generator's refusal disabled, and Playwright's extension switch left in place). For the themes, Chromium 141 installs each folder through `--load-extension`, paints it, and keeps it after a restart. Not established: how the window itself looks, which the browser tests cannot see. Not established: behaviour on macOS and inside the installed Anvers (Chromium 158, as Codex reported for 0.4.0), which the browser tests can check through `ANVERS_CHROMIUM`. The previews were taken on Linux, without Futura, so the wordmark there is set in a fallback sans-serif; on a Mac it will be Futura.
