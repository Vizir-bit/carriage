# Carriage

A private, minimal browser with typewriter character, for macOS first.

Carriage is built on [Helium](https://github.com/imputnet/helium) and
[ungoogled-chromium](https://github.com/ungoogled-software/ungoogled-chromium):
real Chromium, no Google services, Chrome Web Store extensions, and uBlock Origin
included out of the box.

## Status

Early development. Milestone 1 on Chromium: Carriage identity on top of Helium
(app name, bundle ID `app.carriage.browser`, own profile folder and keychain item).
Test builds are unsigned (ad-hoc), Apple Silicon only.

## How it is built

- `helium-chromium/` — Helium's patch set on Chromium (submodule, upstream).
- `patches/` — macOS patches from Helium, plus `patches/carriage/` for Carriage's own changes,
  listed at the end of `patches/series`.
- `.github/workflows/build.yml` — run it manually ("Run workflow") to build on GitHub's
  macOS runners. The build resumes across up to ten chained jobs; the `.dmg` appears as
  an artifact of the final job.

Upstream Helium macOS: see `README.helium.md` and https://github.com/imputnet/helium-macos.

## Tabulator

A sibling app styled after the first IBM machines: the same Chromium browser,
repackaged from a Carriage release with its own name, icon and profile folder,
and a new tab page drawn as an IBM 650-style console of neon lamps with an
80-column punched card. See `docs/TABULATOR.md`;
`.github/workflows/tabulator.yml` makes a release.

## Licence

GPL-3.0, as Helium. See `LICENSE`. Chromium and ungoogled-chromium components keep
their own licences.
