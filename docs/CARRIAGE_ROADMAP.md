# Carriage roadmap

Carriage follows the approach of Brave Origin (https://brave.com/origin/):
keep only the core — ad and tracker blocking, privacy protection, speed and
prompt Chromium security updates — and leave every extra out. Like Origin's
standalone app, extras are compiled out or switched off by default; anything
optional lives in one panel, off until the user turns it on.

Unlike Brave Origin, Carriage is free and open source (GPL-3.0) on every platform.

## Core (always on)
- Chromium engine, via Helium and ungoogled-chromium; no Google services.
- uBlock Origin built in; Chrome Web Store extensions installed and updated
  directly from Google, as in Chrome and Brave.
- No telemetry, no usage pings, no crash uploads.
- Chromium security fixes shipped within days of each Helium/Chromium release.

## Milestones (macOS first)
| # | Milestone | Status |
|---|-----------|--------|
| C1 | Identity: Carriage name, bundle ID, own profile and keychain item | Building |
| C2 | Look, first pass: typewriter-key icon, wordmark, walnut/paper default colours | Branch `carriage-look` |
| C3 | Origin-style core: Web Store direct to Google (done on branch); Helium services off by default; uBlock filter lists fetched from their own sources; network audit proving no other outbound calls | In progress |
| C4 | Updates: Carriage's own signed update channel (Sparkle + GitHub Releases); automated tracking of Helium/Chromium security releases | Planned |
| C5 | Extras panel, like Origin's upgrade panel: Helium's extension proxy, bangs and any future extra, each off by default | Planned |
| C6 | Typewriter character, deeper: tab strip and address strip, new-tab sheet, privacy ledger, optional key sounds | Planned |
| C7 | Apple signing and notarisation; first public release | Planned |
| C8 | Windows, then Linux | Later |
