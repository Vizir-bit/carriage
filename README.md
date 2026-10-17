# Carriage

A private, minimal browser with typewriter character, for macOS first.

Carriage is built on [Helium](https://github.com/imputnet/helium) and
[ungoogled-chromium](https://github.com/ungoogled-software/ungoogled-chromium):
real Chromium, no Google services, Chrome Web Store extensions, and uBlock Origin
included out of the box.

## Status

Early development. Milestone 1 on Chromium: Carriage identity on top of Helium
(app name, bundle ID `app.carriage.browser`, own profile folder and keychain item).
Test builds are unsigned (ad-hoc). Builds published so far are for Apple silicon;
the build now also makes an Intel version and a universal app for both.

## How it is built

- `helium-chromium/` — Helium's patch set on Chromium (submodule, upstream).
- `patches/` — macOS patches from Helium, plus `patches/carriage/` for Carriage's own changes,
  listed at the end of `patches/series`.
- `.github/workflows/build.yml` — run it manually ("Run workflow") to build on GitHub's
  macOS runners. Apple silicon and Intel build side by side, each resuming across up to
  ten chained jobs; `universal.yml` then joins them (`scripts/make_universal.py`) into one
  universal app, and its `.dmg` appears as an artifact of the run.

Upstream Helium macOS: see `README.helium.md` and https://github.com/imputnet/helium-macos.

## Licence

GPL-3.0, as Helium. See `LICENSE`. Chromium and ungoogled-chromium components keep
their own licences.
