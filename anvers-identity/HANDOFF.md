# Handoff to Codex: Anvers identity component

Written by Claude, 18 October 2026, in reply to Codex's message relaying Nadar's instruction to collaborate. Statements are graded: **established** (checked here, with the means named), **inferred** (reasoned from something stated, not checked), **reported** (said by Codex, not checked by me).

## The split, as acknowledged

Reported by Codex on 18 October, and accepted. The Anvers source is local on Nadar's Mac, not in the GitHub `Vizir-bit/Anvers` repository (which holds hygiene scripts). Anvers 0.4.0 is installed: plain Chromium 158.0.8111.0, revision 1721445, a universal package, bundle identifier `app.anvers.browser`, with Firefox kept in reserve. Codex owns local packaging and installation, startup reliability and the Apple timeout. Claude owns the identity component on its cloud branch.

Established: in this work I downloaded no Chromium build, built no engine, and changed neither the hygiene scripts nor the `Vizir-bit/Anvers` repository. Everything is in `anvers-identity/` in `Vizir-bit/carriage`, plus one test workflow, `.github/workflows/anvers-identity.yml`, which runs only when that folder changes. The local paths Codex named are not reachable from my cloud container, and I did not try to reach them.

## Where to review

Repository `Vizir-bit/carriage`, branch `essex/festive-allen-0wrl8b`, draft pull request 2. Review the branch's latest commit; the exact hash is given in the pull request and in Claude's reply. The component is at grammar 3. Grammars 1 and 2 (commits `3205963` and `db116fb`) were review drafts and are superseded: each went through an adversarial review whose confirmed findings the next commit addresses.

## What to integrate

Three files carry the component: `anvers-identity.js`, `anvers-identity.css` and, for the static fallback, the markup described in the README under "Integrating it". The README gives the attributes, the API and the grammar. Two decisions are Codex's:

1. **Seed policy.** `random` (a new mark each load, the module's default), `daily`, or one seed stored per installation; the module stores nothing.
2. **Which page.** The component goes on Anvers's own Home page; `demo/` is a harness showing it next to a search field and links, not a page to ship.

Established: the script needs no inline script, no `eval` and no network, and builds its DOM without HTML strings, so it works under `script-src 'self'` with Trusted Types required (the demo enforces both). It works from `file:` pages as a classic script with `defer`. The ES module entry needs an http, https or extension origin.

## How to verify on the Mac

The unit tests need only Node. Run them from the folder with `node --test test/unit.test.js`.

The browser tests need Playwright (`npm install --no-save --no-package-lock playwright@1.56.1`). They can drive Anvers itself: set `ANVERS_CHROMIUM` to the executable inside the bundle and run `node --test test/browser.test.mjs`. Inferred: for a plain Chromium bundle that executable is `Contents/MacOS/Chromium` inside the app, unless packaging renamed it. The suite prints the browser version first, so a run in Anvers is distinguishable from a run in Playwright's own Chromium. With `ANVERS_CHROMIUM` set, a missing Playwright fails the run instead of skipping it.

Established, here: 27 unit tests and 19 browser tests pass in Playwright's Chromium 141 on Linux (the previews skipped), in two runs: one in Playwright's headless shell, apart from the theme test, which always uses the full browser; and one entirely in the full browser. Each of twenty deliberate faults in the component makes them fail. Not established: macOS, Futura (absent on Linux, so the previews show a fallback face), and Chromium 158.

## Outside this component

Reported by Codex: the installed page and the packaged interaction checks pass, but the first launch showed a stock new tab before Home opened the right page, and an Apple timeout is unresolved. Both are Codex's.

Inferred, unverified, offered as a lead only. In Chromium the Home button and the startup page are separate settings: the home page on one side, the "On startup" choice and its list of pages on the other. A stock new tab at launch, with the right page behind Home, is what one sees when only the home page is set. Chromium also protects these preferences against outside edits. A value written straight into an existing profile's preference file can therefore be reset on the next launch, while the same value set through the settings page holds. Opening the "On startup" section of Anvers's settings would confirm or refute this in a moment.

## Withdrawn: the wider mark palette and grammar 4

On 18 October this section announced a wider palette for the mark and a grammar 4. Both are withdrawn. Reported by Codex on the pull request, 19 October: Nadar rejected the monochrome-blue edition, wants the Bauhaus colours while browsing, and Codex restored the original homepage and installed a matching theme with Anvers 0.5.2. Codex's instruction to Claude was to keep the original homepage layout and the full Bauhaus palette, and to align the browsing themes with red, yellow, blue, paper and ink. Reported by Nadar to Claude: follow Codex.

Established, by the diff since commit `39f7589`: the mark, its palette, its grounds and grammar 3 are unchanged, so every seed draws as before. The mark's fill is already solid: neither the script nor the stylesheet uses opacity, a gradient or a blend.

## Browser themes (19 October 2026)

Four standalone folders under `themes/`, each holding one `manifest.json` and nothing else: colours only, with no images, tints, code, `ntp_*` key or incognito key. `anvers-themes.js` holds the values. `node bin/anvers-themes.js` prints every state with its contrast and rewrites the folders, and it refuses if a check fails. The README's section "Browser themes" grades each point below, with its means and the figures that matter; the generator prints every figure.

- **Default, `anvers-bauhaus`.** Codex's installed theme 0.5.4, less its four `ntp_*` keys. It has a yellow frame and background tabs with ink text, a blue toolbar and active tab with paper text and icons, a white address field, and an ink unfocused frame. Its values are 0.5.2's exact ones, as Codex reported them on 19 October 2026, with the reported changes of 0.5.3 and 0.5.4. Inferred, please confirm by posting 0.5.4's `theme.colors`: the keys not reported as changed keep their 0.5.2 values (unfocused background-tab text `#f4f1ea`, address text `#111111`, `button_background` `#f2c319`). The unit tests pin it key for key.
- **Alternatives.** `anvers-bauhaus-ink` has an ink frame, a paper toolbar and red icons. `anvers-bauhaus-yellow` has an ink frame, a yellow toolbar and blue icons. Both use white text on the frame, ink text on the toolbar, and a white address field.
- **Reference.** `anvers-reference-0.5.0` is the 0.5.0 theme as reported, without its `ntp_*` keys.

**Changed since commit `3b36004`, after Codex's review and a second review round.**

- **The browser theme test is split, as Codex asked.**
  - Before any theme, it records the page a new tab opens.
  - If that is Chromium's own New Tab page, the page must take each theme's toolbar colour, as before.
  - If it has been replaced, as in Anvers, the homepage must keep exactly the colours it has with no theme.
  - Either way, the page must show no console or page error, and the installation and restart checks are unchanged.

  Established here: on Playwright's Chromium 141 the test takes the first path. With the New Tab page replaced by a stand-in extension serving a paper page, it takes the second and passes. A stand-in page that throws fails it.
- **The default is Codex's installed theme**, instead of an approximation in the identity's colours: 0.5.2's exact values, now with 0.5.4's reversed colours.
- **Two more states are computed**, from Chromium 141's source and from pixels measured during review: the address bar's security chip, drawn in the address text colour on the toolbar, and Chromium's fixed grey globe.
- **The alternatives are redesigned.** In the version at `3b36004`, their dark toolbars put the chip and the globe below 3:1 (measured, 1.11 to 3.33:1).
- **Limitations are now computed, not listed.**
  - A theme may name a failing state as a limitation only if Chromium derives that state (a mixed fill, a colour reused on another fill, or the fixed globe). It must also be a state no colour, for that text or icon, could hold together with the same element's primary states, the theme's other colours staying as they are.
  - The generator and the unit tests each search for such a colour, independently.
  - They refuse a limitation that holds, or that a colour could hold.
- **The model is qualified.** It is Chromium 141's, and not checked against Chromium 158.

**What bears on integration.**

- **The homepage.** Reported by Codex: under the default of `3b36004`, Anvers's homepage kept its paper ground in Chromium 158. With the corrected test, a run of `ANVERS_CHROMIUM=<Anvers executable> node --test test/browser.test.mjs` should take the replaced-homepage path. It should then pass if the homepage keeps its colours under all four themes. Inferred, not checked: the default sets no `ntp_background`, so if any part of the homepage takes Chromium's New Tab colour, it would turn yellow. The test would then fail, and say so.
- **Limitations of the default.** Under 0.5.4 every unfocused state passes. Three limitations remain, each imposed by the blue toolbar:
  - the address bar's security chip, 2.40:1; Chromium reuses the dark address text on the blue toolbar;
  - the grey globe on the active tab, 1.30:1;
  - a hovered selected tab, 2.91:1.

  As Codex said, these are limitations to keep in view, not defects the theme can fix.
- **Private windows.** Chromium does not theme them. Established in 141 by its source and by measurement; inferred for 158.
- **Identifiers and the compiled pack.** The manifests carry no `key`, so the theme's identifier follows its folder's path. A content-hashed copy at a new path installs as a new theme and leaves the old entry in the profile; this was established in 141 by a relaunch experiment during review. A stable runtime path, or a `key` added in packaging, avoids it. Chromium writes `Cached Theme.pak` into the folder it loads; this is established by the browser test.

Not established: macOS, and anything in Chromium 158 beyond what Codex reported. Nothing here is installed, and I changed nothing on the Mac.
