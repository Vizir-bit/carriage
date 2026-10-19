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

Beyond the page, Anvers's colours reach the browser itself (frame, tabs, toolbar, address bar and bookmark text) through Chromium themes. A theme is data, not code, so Chromium stays unmodified. Each folder under `themes/` holds one `manifest.json` with colours only: no images, no tints, and no `ntp_*` or incognito key. Statements below are graded as in `HANDOFF.md`: established (checked, with the means named), inferred, or reported.

| Folder | Role | Frame | Unfocused frame | Toolbar and active tab | Toolbar text | Icons | Text on the frame |
|--------|------|-------|-----------------|------------------------|--------------|-------|-------------------|
| `anvers-bauhaus` | default | `#f2c319` | `#111111` | `#1d4f9e` | `#f4f1ea` | `#f4f1ea` | `#111111`, or `#f4f1ea` unfocused |
| `anvers-bauhaus-ink` | alternative | ink | ink | paper | ink | red | white |
| `anvers-bauhaus-yellow` | alternative | ink | ink | yellow | ink | blue | white |
| `anvers-reference-0.5.0` | reference | `#1d4f9e` | `#111111` | `#f4f1ea` | `#111111` | Chromium's own | Chromium's own |

In every theme the address field is white with dark text.

- **The default.** It is the theme Codex installed, version 0.5.4, less its four `ntp_*` keys, and all its values are reported by Codex on the pull request on 19 October 2026. Codex first gave 0.5.2's exact values: a blue frame over a yellow toolbar. Following Nadar's direction, 0.5.4 reverses the two colours: the frame and background tabs are yellow, `[242, 195, 25]`, with ink text, `[17, 17, 17]`; the toolbar and the active tab are blue, `[29, 79, 158]`, with paper text and icons, `[244, 241, 234]`. The address field stays white, and the unfocused frame ink. Inferred, not confirmed: keys Codex did not report as changed keep their 0.5.2 values, namely the unfocused background-tab text `#f4f1ea`, the address text `#111111` and `button_background` `#f2c319`. The default's yellow and blue are close to the identity's (`#e0a817`, `#1f4e99`), not equal to them. Besides the keys in the table, it sets `background_tab` and `background_tab_inactive` equal to its frames.
- **The alternatives.** They recombine the identity's own colours (red `#c0392b`, yellow `#e0a817`, blue `#1f4e99`, paper `#f3efe6`, ink `#161616`) and white.
- **The reference.** It is the 0.5.0 theme as Codex reported it, without its `ntp_*` keys. It sets only the reported keys, and Chromium derives the rest.

### What Chromium does with a theme

- **The New Tab page.** Established in Chromium 141 by the browser test: when a theme sets no `ntp_background`, Chromium's own New Tab page takes the theme's toolbar colour. Under the default the stock page turns blue, under the alternatives paper or yellow. Anvers replaces that page with its own homepage; Codex reported that page on Chromium's New Tab routes. Codex also reported, on 19 October 2026, that it kept its paper ground, `rgb(244, 241, 234)`, under the default of commit `3b36004`, the theme where that run stopped. The browser test checks Chromium's own page where it finds it. Where the page has been replaced, the test checks instead that the homepage keeps the colours it has with no theme, and stays free of console and page errors. Inferred from `browser_theme_pack.cc`, which maps `ntp_background` to the New Tab page colour: only that key would hold the stock page's colour, and the themes leave it to Codex.
- **Private windows.** Established in Chromium 141, two ways. Its source says so (`browser_frame.cc`: "Do not return any custom theme if this is an incognito browser"), and a window measured under every theme kept Chromium's own dark frame, `#1f2020`, in a headed run under a virtual display during review. So the themes set no incognito key. Inferred for Chromium 158, from the same exclusion in Chromium's current source.
- **What the contrast is computed on.** `anvers-themes.js` computes every text and icon against what it sits on, in seventeen states. Established in Chromium 141, by its source and by pixels measured in a headed window during review:
  - text and icons on the toolbar and the active tab, which share its colour;
  - the address text on the white field;
  - the address bar's security chip ("Not secure"), which Chromium draws in the address text colour on the toolbar colour;
  - background tab text on the frame (or on `background_tab`, where set);
  - a hovered background tab, which Chromium fills with 40% toolbar over that fill, and keeps its text;
  - a selected tab, filled with 75% toolbar;
  - a hovered selected tab, filled with 85% toolbar, which keeps the background-tab text and close button;
  - the same four tab states in an unfocused window;
  - the new-tab button of an unfocused window, which Chromium draws in the icon colour at 43% opacity;
  - Chromium's fixed grey globe, `#5f6368`, for a page without an icon, on the active tab and on a background tab.

  These fills and colours are not checked against Chromium 158.

**Contrast and limitations.** Text needs 4.5:1 and icons 3:1, by WCAG's formula, computed by the generator and, independently, by the unit tests. A theme may name a failing state as a limitation only if Chromium derives that state (a mixed fill, a colour reused on another fill, or the fixed globe), and only where no colour for that text or icon could hold it together with the same element's primary states, the theme's other colours staying as they are. The generator and the tests each search the colour space to check that rule. They refuse an unnamed failure, a limitation a colour could hold, and a named limitation that in fact holds.

- **Default.** Three limitations, each imposed by its blue toolbar:
  - the address bar's security chip, 2.40:1. Chromium reuses the address text colour for the chip on the toolbar; dark text on the white field cannot also read on blue.
  - the grey globe on the active tab, 1.30:1;
  - a hovered selected tab, 2.91:1. The ink text of yellow background tabs stays on a fill that is 85% blue.

  Every unfocused state passes, the new-tab button included at 3.93:1. The narrowest passes are the selected tab, 4.90:1, and the grey globe on a background tab, 3.63:1. Under 0.5.2's blue frame and yellow toolbar the default had five limitations, among them a hovered background tab at 3.84:1, which no text colour could have held.

- **Ink alternative.** Four limitations:
  - the globe on a background tab, 2.99:1;
  - a hovered selected tab, 1.57:1, focused or not;
  - the unfocused new-tab button, 1.53:1.

  A hovered background tab passes at 5.18:1.
- **Yellow alternative.** Five limitations:
  - the globe on the active tab, 2.82:1, and on a background tab, 2.99:1;
  - a hovered selected tab, 2.83:1;
  - the unfocused new-tab button, 1.33:1.

  Its selected tabs pass at 5.27:1.
- **Reference.** Only the nine states built from reported keys are computed: the globe on a background tab fails at 1.30:1, the rest pass. For the states Chromium derives, the 0.5.0 values were measured in a headed window during review: a hovered background tab at 3.26:1, a hovered selected tab at about 1.43:1, and the unfocused new-tab button at 1.51:1.

**Not modelled: colours Chromium chooses itself.** No theme key sets these colours, and the model does not compute them:
- the bookmark-bar folder icon;
- the download and profile buttons, whose idle colour Chromium tunes to about 3:1 against the toolbar, so that hovering or pressing them takes them lower;
- the shortcut labels of Chromium's own New Tab page, which stay black;
- the address bar's dropdown.

Established for the reference in Chromium 141, by measurement in a headed window during review:
- the folder icon, 6.31:1;
- the download button, 5.77:1 idle, 4.97:1 hovered, 4.40:1 pressed;
- the profile button, 5.75:1 idle, 4.96:1 hovered;
- the New Tab labels, 18.62:1.

On the yellow toolbar of earlier versions, the download and profile buttons fell to about 2.4 to 2.7:1 when hovered or pressed. Not yet measured for the default and the alternatives in their present colours.

`node bin/anvers-themes.js` rewrites the folders from `anvers-themes.js`. It prints every state with its contrast and the reason for each limitation, and writes nothing if any check fails. With no argument it writes into this folder's `themes/`.

**Loading.** To use a theme, Chromium loads its folder with `--load-extension`; installing it stays with Codex.

- **The compiled pack.** Established in Chromium 141 by the browser test: Chromium writes a compiled `Cached Theme.pak` into the folder it loads. Load a copy, therefore; Codex reports that its packaging does. `themes/.gitignore` keeps that file out of the repository.
- **The identifier.** The manifests carry no `key`, so Chromium derives a theme's identifier from its folder's path. Established in Chromium 141 by a four-launch experiment during review: a copy moved to a new path was installed as a new theme, and the old entry stayed in the profile. A stable path for the runtime copy, or a `key` added in packaging, keeps one identifier; that choice is Codex's.

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
- **Themes:** they read the committed manifests, the files Chromium loads, and check them with their own lists and arithmetic. Every key must be one of Chromium's theme colours (written out from its source), with no `ntp_*` or incognito key, and every value a valid colour. The table must match the files key for key, and the files must be exactly what the generator writes, by default into `themes/`. The generator must refuse a failing theme, and a limitation that holds or that a colour could hold, and then write nothing. Every text and icon must hold its contrast in each of the seventeen states, except where the theme names a limitation and the tests' own search finds no colour that could hold it. Every theme's colours are pinned: the default to Codex's theme 0.5.4 as reported, the alternatives to their compositions, the reference to Codex's reported 0.5.0 values.

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
- every theme folder, loaded into a full Chromium (never the headless shell, which has no extensions) through `--load-extension` alone, with Playwright's default `--disable-extensions` dropped, since under it Chromium skips that switch. The profile must record the folder as the active theme, and Chromium must have compiled its theme pack. The page a new tab opens must show no console or page error. If that page is Chromium's own, it must take the theme's toolbar colour; if it has been replaced, as in Anvers, it must keep the colours it has with no theme. After a restart without the switch, the theme must still be active and the page unchanged. The test cannot tell which switch installed a theme: given through `--disable-extensions-except` instead, it would still pass.

Any console error, including a Content Security Policy or Trusted Types violation, fails them. The browser version is printed first.

With `ANVERS_CHROMIUM` set to the browser executable inside an app bundle, they run in that browser instead, which is the way to check this component inside Anvers itself; with it (or under CI) a missing Playwright is an error, not a skip, and the repository's workflow also fails if any test but the previews is skipped. With `ANVERS_PREVIEWS=1` they also rewrite the screenshots in `previews/`.

## What has been checked, and where

Established: both test files pass in Playwright's Chromium 141 on Linux, and the repository's workflow for this folder runs them on GitHub's Ubuntu runner for every change. Each of twenty deliberate faults in the component, one per gap that two rounds of review found, makes them fail. So do all but one of the faults two rounds of review tried on the themes: among them a broken manifest, a key dropped or misspelt, colours swapped in the generator, a contrast state removed, the generator's refusal disabled, Playwright's extension switch left in place, and the committed folder loaded in place of a copy. The exception is giving the theme through `--disable-extensions-except` in place of `--load-extension`, which the theme test cannot tell apart. Reported by Codex on 19 October 2026: in the installed Anvers (Chromium 158), the theme test's installation checks passed for the default of commit `3b36004`. That run then stopped, because the homepage rightly kept its own colours where the test of that commit expected the toolbar colour. For the themes' window states, see "What Chromium does with a theme". Not established: behaviour on macOS, and inside the installed Anvers for everything else. Codex reported Chromium 158.0.8111.0 for Anvers 0.4.0 and 0.5.0; the browser tests can check it through `ANVERS_CHROMIUM`. The previews were taken on Linux, without Futura, so the wordmark there is set in a fallback sans-serif; on a Mac it will be Futura.
