# Handoff to Codex: Anvers identity component

Written by Claude, 18 October 2026, in reply to Codex's message relaying Nadar's instruction to collaborate. Statements are graded: **established** (checked here, with the means named), **inferred** (reasoned from something stated, not checked), **reported** (said by Codex, not checked by me).

## The split, as acknowledged

Reported by Codex, and accepted. The Anvers source is local on Nadar's Mac, not in the GitHub `Vizir-bit/Anvers` repository (which holds hygiene scripts). Anvers 0.4.0 is installed: plain Chromium 158.0.8111.0, revision 1721445, a universal package, bundle identifier `app.anvers.browser`, with Firefox kept in reserve. Codex owns local packaging and installation, startup reliability and the Apple timeout. Claude owns the identity component on its cloud branch.

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

Established, here: 25 unit tests and 19 browser tests pass in Playwright's Chromium 141 on Linux, both in its headless shell and in its full browser (the previews skipped), and each of twenty deliberate faults in the component makes them fail. Not established: macOS, Futura (absent on Linux, so the previews show a fallback face), and Chromium 158.

## Outside this component

Reported by Codex: the installed page and the packaged interaction checks pass, but the first launch showed a stock new tab before Home opened the right page, and an Apple timeout is unresolved. Both are Codex's.

Inferred, unverified, offered as a lead only. In Chromium the Home button and the startup page are separate settings: the home page on one side, the "On startup" choice and its list of pages on the other. A stock new tab at launch, with the right page behind Home, is what one sees when only the home page is set. Chromium also protects these preferences against outside edits. A value written straight into an existing profile's preference file can therefore be reset on the next launch, while the same value set through the settings page holds. Opening the "On startup" section of Anvers's settings would confirm or refute this in a moment.

## Withdrawn: the wider mark palette and grammar 4

On 18 October this section announced a wider palette for the mark and a grammar 4. Both are withdrawn. Reported by Codex on the pull request, 19 October: Nadar rejected the monochrome-blue edition, wants the Bauhaus colours while browsing, and Codex restored the original homepage and installed a matching theme, version 0.5.2. Codex's instruction to Claude was to keep the original homepage layout and the full Bauhaus palette, and to align the browsing themes with red, yellow, blue, paper and ink. Reported by Nadar to Claude: follow Codex.

Established, by the diff since commit `39f7589`: the mark, its palette, its grounds and grammar 3 are unchanged, so every seed draws as before. The mark's fill is already solid: neither the script nor the stylesheet uses opacity, a gradient or a blend.

## Browser themes (19 October 2026)

Four standalone folders under `themes/`, each holding one `manifest.json` and nothing else: colours only, no images, no tints, no code, and no `ntp_*` key. `anvers-themes.js` holds the values; `node bin/anvers-themes.js` rewrites the folders and refuses if a contrast check fails.

| Folder | Role | Frame | Toolbar and active tab | Icons | Address field | Text |
|--------|------|-------|------------------------|-------|---------------|------|
| `anvers-bauhaus` | default | blue `#1f4e99` | yellow `#e0a817` | dark red `#7a2318` | white | ink `#161616` |
| `anvers-bauhaus-red` | alternative | red `#c0392b` | paper `#f3efe6` | blue | white | ink |
| `anvers-bauhaus-ink` | alternative | ink | paper | red | white | ink |
| `anvers-reference-0.5.0` | reference | `#1d4f9e` | `#f4f1ea` | Chromium's own | `#ffffff` | `#111111` |

In the three Bauhaus themes, unfocused and private windows take ink, with paper text on inactive tabs. The reference is the 0.5.0 theme as Codex reported it, without its `ntp_*` keys.

**The default and 0.5.2.** The default follows the composition Codex reported for 0.5.2: blue frame, yellow active tab and toolbar, dark-red navigation icons, white address field, dark text. Its values are the component's own palette, because 0.5.2's `theme.colors` were asked for on the pull request and have not been posted. Inferred, not checked: the default approximates 0.5.2 rather than matching it. If Codex posts the values, they replace the default's in `anvers-themes.js`, subject to the same contrast checks.

**Contrast**, established by computation (WCAG relative luminance, checked by the unit tests and printed by the generator). Every text is at least 4.5:1 on its background and every icon at least 3:1. The narrowest margins: dark-red icons on yellow 4.70:1, paper tab text on the red frame 4.74:1, red icons on paper 4.74:1. Default theme: ink on yellow 8.43:1, paper on the blue frame 7.02:1, ink on white 18.10:1.

**Loading**, established in Playwright's full Chromium 141 on Linux, by a browser test that runs in CI. Each folder, copied to a temporary directory and loaded with `--load-extension` into a fresh profile, becomes the active theme. The profile records it under `extensions.theme` with the copy's path, and Chromium writes its compiled `Cached Theme.pak` beside the manifest. Three deliberate faults each make the test fail: manifest version 1, the `theme` key misspelt, and an invalid version string. A manifest version of 9 still loads in Chromium 141, so the unit tests pin it to 3.

Not established: how the window looks (Chromium shows no image for a colour-only theme, and a headless window has no frame to capture), persistence across restarts, macOS, and Chromium 158. As Codex required, these must be verified in installed Anvers; they are Codex's.

**For integration:**

- Chromium writes `Cached Theme.pak` into the folder it loads. Inferred: loading the bundled folder directly would change its content hash after the first launch. Codex's packaging already loads a content-hashed runtime copy (reported), which avoids this. `themes/.gitignore` keeps the file out of the repository.
- No theme here sets an `ntp_*` key. As Codex agreed on the pull request, Codex carries the homepage's current colours over and checks both native routes before replacing the installed theme.
- Nothing here is installed, and I changed nothing on the Mac.
