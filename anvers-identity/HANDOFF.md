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

Established, here: 26 unit tests and 19 browser tests pass in Playwright's Chromium 141 on Linux (the previews skipped), in two runs: one in Playwright's headless shell, apart from the theme test, which always uses the full browser; and one entirely in the full browser. Each of twenty deliberate faults in the component makes them fail. Not established: macOS, Futura (absent on Linux, so the previews show a fallback face), and Chromium 158.

## Outside this component

Reported by Codex: the installed page and the packaged interaction checks pass, but the first launch showed a stock new tab before Home opened the right page, and an Apple timeout is unresolved. Both are Codex's.

Inferred, unverified, offered as a lead only. In Chromium the Home button and the startup page are separate settings: the home page on one side, the "On startup" choice and its list of pages on the other. A stock new tab at launch, with the right page behind Home, is what one sees when only the home page is set. Chromium also protects these preferences against outside edits. A value written straight into an existing profile's preference file can therefore be reset on the next launch, while the same value set through the settings page holds. Opening the "On startup" section of Anvers's settings would confirm or refute this in a moment.

## Withdrawn: the wider mark palette and grammar 4

On 18 October this section announced a wider palette for the mark and a grammar 4. Both are withdrawn. Reported by Codex on the pull request, 19 October: Nadar rejected the monochrome-blue edition, wants the Bauhaus colours while browsing, and Codex restored the original homepage and installed a matching theme, version 0.5.2. Codex's instruction to Claude was to keep the original homepage layout and the full Bauhaus palette, and to align the browsing themes with red, yellow, blue, paper and ink. Reported by Nadar to Claude: follow Codex.

Established, by the diff since commit `39f7589`: the mark, its palette, its grounds and grammar 3 are unchanged, so every seed draws as before. The mark's fill is already solid: neither the script nor the stylesheet uses opacity, a gradient or a blend.

## Browser themes (19 October 2026)

Four standalone folders under `themes/`, each holding one `manifest.json` and nothing else: colours only, with no images, tints, code, `ntp_*` key or incognito key. `anvers-themes.js` holds the values; `node bin/anvers-themes.js` rewrites the folders and refuses if a contrast check fails. The README's section "Browser themes" gives the table, the states checked and every figure.

- **Default, `anvers-bauhaus`.** Blue frame, ink when the window is unfocused, yellow toolbar and active tab, ink toolbar text, dark-red icons, white address field, white text on the frame. It follows the composition Codex reported for 0.5.2. Its values are the identity's own: 0.5.2's `theme.colors` were asked for on the pull request and have not been posted. Inferred, not checked: the default approximates 0.5.2 rather than matching it. If Codex posts the values, they replace these, subject to the same checks.
- **Alternatives.** `anvers-bauhaus-red` has a red frame with a blue toolbar; `anvers-bauhaus-ink` has an ink frame with a red toolbar. Both have white text, paper icons and an ink unfocused frame.
- **Reference.** `anvers-reference-0.5.0` is the 0.5.0 theme as Codex reported it, without its `ntp_*` keys.

**Changed since commit `63ab393`, after an adversarial review.** That commit's themes and documents were wrong in four ways:

- they said the New Tab page stays unchanged;
- they said private windows take ink;
- they checked contrast only on plain fills, so a hovered background tab fell below 4.5:1 (2.52:1 in the old red theme);
- the browser test loaded the folders without exercising `--load-extension`.

The two alternatives are redesigned. The default keeps its composition, with white instead of paper text on the frame. Read this commit, not `63ab393`.

**What Chromium does with these themes.** Established in Chromium 141 on Linux unless marked.

- **The New Tab page.** Chromium paints its own New Tab page in the toolbar colour when a theme sets no `ntp_background`: yellow under the default. The browser test asserts this for every theme. Whether Anvers's homepage on the native New Tab routes takes that colour depends on its own stylesheet; as Codex said it would, Codex should check both routes before replacing the installed theme. Holding the stock colour would need `ntp_background`, which these themes leave to Codex.
- **Private windows.** Chromium does not theme them.
- **Contrast in each state Chromium draws.** Every text and icon was computed against what it sits on in fourteen states, including the fills Chromium mixes for hovered and selected tabs, and the dimmed new-tab button of an unfocused window. The alternatives pass all fourteen. The default has three exceptions, which its composition imposes whatever the exact values (a dark frame, a light toolbar, dark icons):
  - the text of a hovered selected tab: 2.63:1, or 2.83:1 unfocused;
  - the new-tab button in an unfocused window: 1.21:1.

  Inferred: Codex's installed 0.5.2 has the same three, by the same composition.
- **Loading and persistence.** Each folder, copied to a temporary directory, is installed through `--load-extension` alone. Chromium paints it, and a restart of the same profile without the switch keeps it. A theme Chromium refuses fails the test.
- **Identifiers and the compiled pack.** The manifests carry no `key`, so Chromium derives a theme's identifier from its folder's path. A copy at a new content-hashed path is installed as a new theme, and the old entry stays in the profile. A stable runtime path, or a `key` added in packaging, avoids this; the choice is Codex's. Chromium also writes `Cached Theme.pak` into the folder it loads. Loading a copy keeps the bundled folder, and its hash, unchanged; the runtime copy itself gains the pack.

Not established: how the window itself looks in each state (the browser tests read pages, not the window), macOS, and Chromium 158. These are Codex's to verify in installed Anvers, as Codex required. Nothing here is installed, and I changed nothing on the Mac.
