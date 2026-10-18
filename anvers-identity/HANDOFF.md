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

Established, here: 21 unit tests and 18 browser tests pass in Playwright's Chromium 141 on Linux, and each of twenty deliberate faults makes them fail. Not established: macOS, Futura (absent on Linux, so the previews show a fallback face), and Chromium 158.

## Outside this component

Reported by Codex: the installed page and the packaged interaction checks pass, but the first launch showed a stock new tab before Home opened the right page, and an Apple timeout is unresolved. Both are Codex's.

Inferred, unverified, offered as a lead only. In Chromium the Home button and the startup page are separate settings: the home page on one side, the "On startup" choice and its list of pages on the other. A stock new tab at launch, with the right page behind Home, is what one sees when only the home page is set. Chromium also protects these preferences against outside edits. A value written straight into an existing profile's preference file can therefore be reset on the next launch, while the same value set through the settings page holds. Opening the "On startup" section of Anvers's settings would confirm or refute this in a moment.

## Under way: many more solid colours (18 October 2026, afternoon)

Reported by Nadar, verbatim and in this order: "There are a lot more solid colors for ANvers and its browsing experience" … "that we need"; then "Don't change the homepage."; then that Codex be made aware of this undertaking, which is the purpose of this section.

What Claude is doing, within the same split:

1. **The mark's colour range** widens from three restrained primaries to many solid (flat, opaque) colours, each with a tone for light pages and one for dark pages. Each is chosen to stand at least 3:1 against the unchanged grounds, or named as an exception with its reason. The mark stays one shape, randomly coloured and distorted, from a reproducible seed. On the Home page the only change is the mark's fill colour; the ground, layout, text, search field and links stay exactly as they are.
2. **A family of Chromium themes** for the browser's frame, tabs, toolbar, address bar and bookmark text. Each theme is manifest-only data, with no code and no images, and sets no `ntp_*` key, so no page content changes, Chromium's stock New Tab page included. A theme is fixed once installed, so it cannot follow the per-load seed; Codex and Nadar would choose one theme from the family. Installing it stays Codex's.

What this means for Codex:

- **Seeds and API.** The grammar will rise to 4, and every seed will draw differently, because the grammar's number is part of what is hashed. The API, the data attributes and the file names stay the same. Integrating grammar 3 now costs nothing, but take the script and the stylesheet together when grammar 4 lands, since the colour tokens change.
- **Installing a theme without managing the browser.** Inferred, unverified on Chromium 158: installing an extension through enterprise policy would make Anvers report itself as managed by an organisation, which Nadar's own management-audit scripts would flag. Loading the theme's folder from the extensions page in developer mode, or packing it and dragging it in, avoids that. The choice is Codex's.

Questions for Codex, to answer through Nadar or on the pull request:

1. Does the installed Anvers already set any frame or toolbar colour, through a theme, a policy or a preference? A new theme would replace it.
2. Has grammar 3 already been integrated locally?
3. Which way of installing a theme fits the packaging?

Status, established: a design panel is choosing the palette and the theme family: three independent proposals, two judges who recompute the contrast figures, and one synthesis. Implementation, an adversarial review and the tests follow, as for grammars 2 and 3. The result will land on the same branch and pull request, with the exact commit given in the pull request and in Claude's reply. Nothing else on the branch has changed since commit `39f7589`.
