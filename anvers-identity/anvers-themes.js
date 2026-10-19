/*
 * Anvers browser themes: colour-only Chromium themes for the frame, tabs,
 * toolbar, address bar and bookmark text, built from the identity's own
 * palette (red, yellow, blue, paper, ink) and white; the default takes the
 * colours of the theme Codex installed, version 0.5.4.
 *
 * Each theme is a standalone folder holding one manifest.json and nothing
 * else: no code, no images and no ntp_* key. Chromium still paints its own
 * New Tab page in the toolbar colour when a theme sets no ntp_background, as
 * none of these does, and it shows private windows in its own dark colours
 * whatever the theme says; see the README. bin/anvers-themes.js writes the folders from this table; the
 * tests check that the committed folders match it, that every key is one
 * Chromium reads, and that every text and icon keeps its contrast in each
 * state modelled below, or is a limitation the theme's other colours impose.
 * The states are modelled on Chromium 141 (its source, and pixels rendered on
 * Linux); they have not been checked against Chromium 158.
 *
 * Node only (CommonJS), no dependency.
 */
'use strict';

const {palette, grounds} = require('./anvers-identity.js');

const LIGHT = palette.light;
const PAPER = grounds.paper;
const INK = grounds.ink;
const WHITE = '#ffffff';

// The colour keys these themes write, a subset of those Chromium's theme pack
// reads (chrome/browser/themes/browser_theme_pack.cc). Left out on purpose:
// ntp_* (the New Tab page, left to Codex) and the incognito keys, which
// Chromium ignores because it does not theme private windows. Only the
// default, which copies Codex's theme, sets background_tab* and
// button_background.
const KEYS = Object.freeze([
  'frame', 'frame_inactive', 'background_tab', 'background_tab_inactive',
  'toolbar', 'toolbar_text', 'toolbar_button_icon', 'button_background',
  'tab_text', 'tab_background_text', 'tab_background_text_inactive',
  'bookmark_text', 'omnibox_background', 'omnibox_text',
]);

// The states the model computes, as Chromium 141 draws them: a text or an
// icon, what it sits on, and the contrast it needs: 4.5:1 for text, 3:1 for
// icons. They are not every state Chromium draws; the README lists others. A background is a key,
// 'a|b' for a key that falls back to another when unset (a background tab is
// filled with background_tab, or else the frame), or a mix [over, under,
// share of over]: Chromium fills a hovered background tab with 40% of the
// toolbar colour over the background-tab fill, a selected tab with 75%, and a
// hovered selected tab with 85%, and it keeps the background-tab text on a
// hovered tab, selected or not (tab_strip_color_mixer.cc, tab_style_views.cc).
// In an unfocused window it draws the new-tab button with the toolbar icon
// colour at 0x6E/255 opacity (chrome_color_mixer.cc), so that foreground is
// itself a mix. The active tab takes the toolbar colour. Under a theme,
// Chromium also reuses the address text colour for the address bar's
// security chip ('Not secure', 'File'), drawn on the toolbar colour
// (location_bar_view.cc, omnibox_color_mixer.cc); such a row is marked
// 'reused'. A page without an icon gets a fixed grey globe, #5f6368, which no
// key changes; a foreground given as a colour is such a fixed one. Not
// checked against Chromium 158.
const HOVER = 0.4, SELECTED = 0.75, SELECTED_HOVER = 0.85, DIMMED = 0x6E / 255;
const TAB = 'background_tab|frame', TAB_UNFOCUSED = 'background_tab_inactive|frame_inactive';
const GLOBE = '#5f6368';
const STATES = Object.freeze([
  ['toolbar text', 'toolbar_text', 'toolbar', 4.5],
  ['active tab text', 'tab_text', 'toolbar', 4.5],
  ['bookmark text', 'bookmark_text', 'toolbar', 4.5],
  ['toolbar icons', 'toolbar_button_icon', 'toolbar', 3],
  ['address text', 'omnibox_text', 'omnibox_background', 4.5],
  ['address bar chip text', 'omnibox_text', 'toolbar', 4.5, 'reused'],
  ['globe on the active tab', GLOBE, 'toolbar', 3],
  ['background tab text', 'tab_background_text', TAB, 4.5],
  ['globe on a background tab', GLOBE, TAB, 3],
  ['globe on a hovered background tab', GLOBE, ['toolbar', TAB, HOVER], 3],
  ['globe on a selected tab', GLOBE, ['toolbar', TAB, SELECTED], 3],
  ['globe on a hovered selected tab', GLOBE, ['toolbar', TAB, SELECTED_HOVER], 3],
  ['hovered background tab text', 'tab_background_text', ['toolbar', TAB, HOVER], 4.5],
  ['selected tab text', 'tab_text', ['toolbar', TAB, SELECTED], 4.5],
  ['hovered selected tab text', 'tab_background_text', ['toolbar', TAB, SELECTED_HOVER], 4.5],
  ['background tab text, unfocused window', 'tab_background_text_inactive', TAB_UNFOCUSED, 4.5],
  ['hovered background tab text, unfocused window', 'tab_background_text_inactive', ['toolbar', TAB_UNFOCUSED, HOVER], 4.5],
  ['selected tab text, unfocused window', 'tab_text', ['toolbar', TAB_UNFOCUSED, SELECTED], 4.5],
  ['hovered selected tab text, unfocused window', 'tab_background_text_inactive', ['toolbar', TAB_UNFOCUSED, SELECTED_HOVER], 4.5],
  ['new-tab button, unfocused window', ['toolbar_button_icon', TAB_UNFOCUSED, DIMMED], TAB_UNFOCUSED, 3],
  ['globe on a background tab, unfocused window', GLOBE, TAB_UNFOCUSED, 3],
  ['globe on a hovered background tab, unfocused window', GLOBE, ['toolbar', TAB_UNFOCUSED, HOVER], 3],
  ['globe on a selected tab, unfocused window', GLOBE, ['toolbar', TAB_UNFOCUSED, SELECTED], 3],
  ['globe on a hovered selected tab, unfocused window', GLOBE, ['toolbar', TAB_UNFOCUSED, SELECTED_HOVER], 3],
]);

// A full theme from five choices: the frame, the unfocused window's frame, the
// toolbar (which the active tab shares), the text on the toolbar and the
// icons. The text on the frame is white; the address field is white with ink.
function bauhaus({frame, inactive, toolbar, text, icons}) {
  return {
    frame,
    frame_inactive: inactive,
    toolbar,
    toolbar_text: text,
    toolbar_button_icon: icons,
    tab_text: text,
    tab_background_text: WHITE,
    tab_background_text_inactive: WHITE,
    bookmark_text: text,
    omnibox_background: WHITE,
    omnibox_text: INK,
  };
}

// States some compositions cannot pass with any colour; check() verifies
// each claim.
const LIGHT_ON_LIGHT = 'Chromium keeps the light text and close button of background tabs on a fill that is 85% the light toolbar colour';
const DARK_ON_DARK = 'Chromium keeps the dark text and close button of background tabs on a fill that is 85% the dark toolbar colour';
const DIMMED_ICON = 'Chromium draws the button in the dark icon colour at 43% opacity over the dark unfocused frame';
const CHIP = 'the address text must be dark on the white field, and Chromium reuses it for the chip on the dark toolbar';

const THEMES = Object.freeze([
  {
    folder: 'anvers-bauhaus',
    name: 'Anvers Bauhaus',
    role: 'default',
    description: 'Yellow frame and background tabs with ink text; blue toolbar and active tab with paper text and icons; white address field.',
    // Codex's installed theme, version 0.5.4, as Codex reported its full
    // theme.colors on the pull request, without its ntp_* keys.
    colors: {
      frame: '#f2c319',
      frame_inactive: '#111111',
      background_tab: '#f2c319',
      background_tab_inactive: '#111111',
      toolbar: '#1d4f9e',
      toolbar_text: '#f4f1ea',
      toolbar_button_icon: '#f4f1ea',
      button_background: '#1d4f9e',
      tab_text: '#f4f1ea',
      tab_background_text: '#111111',
      tab_background_text_inactive: '#f4f1ea',
      bookmark_text: '#f4f1ea',
      omnibox_background: '#ffffff',
      omnibox_text: '#111111',
    },
    limitations: {
      'address bar chip text': CHIP,
      'hovered selected tab text': DARK_ON_DARK,
    },
  },
  {
    folder: 'anvers-bauhaus-ink',
    name: 'Anvers Bauhaus Ink',
    role: 'alternative',
    description: 'Ink frame, paper toolbar and active tab, red icons, white address field, ink text.',
    colors: bauhaus({frame: INK, inactive: INK, toolbar: PAPER, text: INK, icons: LIGHT.red}),
    limitations: {
      'hovered selected tab text': LIGHT_ON_LIGHT,
      'hovered selected tab text, unfocused window': LIGHT_ON_LIGHT,
      'new-tab button, unfocused window': DIMMED_ICON,
    },
  },
  {
    folder: 'anvers-bauhaus-yellow',
    name: 'Anvers Bauhaus Yellow',
    role: 'alternative',
    description: 'Ink frame, yellow toolbar and active tab, blue icons, white address field, ink text.',
    colors: bauhaus({frame: INK, inactive: INK, toolbar: LIGHT.yellow, text: INK, icons: LIGHT.blue}),
    limitations: {
      'hovered selected tab text': LIGHT_ON_LIGHT,
      'hovered selected tab text, unfocused window': LIGHT_ON_LIGHT,
      'new-tab button, unfocused window': DIMMED_ICON,
    },
  },
  {
    // Codex's bundled theme of Anvers 0.5.0, as reported on the pull request,
    // without its ntp_* keys. Only the reported keys are set; Chromium derives
    // the rest, so only the states built from reported keys are computed.
    folder: 'anvers-reference-0.5.0',
    name: 'Anvers Reference 0.5.0',
    role: 'reference',
    description: 'The theme bundled with Anvers 0.5.0, without its New Tab page keys.',
    // Reported, not chosen here: its states are computed and named, not fixed.
    colors: {
      frame: '#1d4f9e',
      frame_inactive: '#111111',
      toolbar: '#f4f1ea',
      toolbar_text: '#111111',
      tab_text: '#111111',
      bookmark_text: '#111111',
      omnibox_background: '#ffffff',
      omnibox_text: '#111111',
    },
    limitations: {},
  },
]);

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

// `share` of `over` laid on `under`, as Chromium's AlphaBlend does in sRGB.
function mix(over, under, share) {
  const a = rgb(over), b = rgb(under);
  return hex(a.map((v, i) => share * v + (1 - share) * b[i]));
}

function luminance(hex) {
  const c = rgb(hex).map(v => v / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// A fixed colour, a key ('a|b' takes b when a is unset), or a mix of these,
// as a colour; null if the theme leaves a key unset.
function resolve(colors, spec) {
  if (typeof spec === 'string' && spec.startsWith('#')) return spec;
  if (typeof spec === 'string') return spec.split('|').map(k => colors[k]).find(Boolean) || null;
  const [over, under, share] = spec;
  const a = resolve(colors, over), b = resolve(colors, under);
  return a && b ? mix(a, b, share) : null;
}

// The key whose colour a state's foreground is drawn in.
const keyOf = spec => (typeof spec === 'string' ? spec : spec[0]);

// A state is derived when Chromium mixes its colours or reuses a key's
// colour on another fill; the others are a key's primary states.
const derived = row => typeof row[1] !== 'string' || typeof row[2] !== 'string' || row[4] === 'reused';

// Whether no colour for a derived state's foreground key holds the state
// together with that key's primary states, the theme's other colours staying
// as they are. Only such a state is accepted as the composition's limitation
// rather than the theme's choice; a primary state never is, and a fixed
// foreground, which no key sets, always is. The search is exhaustive over the
// 16,777,216 colours a manifest can hold: each row's luminance is a sum of
// three per-channel terms, read from tables, and its contrast bound becomes a
// luminance window.
const LINEAR = Array.from({length: 256}, (_, v) => {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
});
const WEIGHTS = [0.2126, 0.7152, 0.0722];
function imposed(theme, state) {
  const row = STATES.find(s => s[0] === state);
  if (!row) return false;
  const key = keyOf(row[1]);
  if (key.startsWith('#')) return true;
  if (!derived(row)) return false;
  const rows = [row, ...STATES.filter(s => s[1] === key && !derived(s))]
    .filter(([, , bg]) => resolve(theme.colors, bg));
  const tests = rows.map(([, fg, bg, min]) => {
    const under = typeof fg === 'string' ? null : rgb(resolve(theme.colors, fg[1]));
    const share = typeof fg === 'string' ? 1 : fg[2];
    // The luminance each value of each channel adds to the foreground.
    const tables = WEIGHTS.map((w, i) => Float64Array.from({length: 256}, (_, v) =>
      w * LINEAR[under ? Math.round(share * v + (1 - share) * under[i]) : v]));
    const l = luminance(resolve(theme.colors, bg));
    return {tables, low: (l + 0.05) / min - 0.05, high: min * (l + 0.05) - 0.05};
  });
  for (let r = 0; r < 256; r++) {
    for (let g = 0; g < 256; g++) {
      for (let b = 0; b < 256; b++) {
        let holds = true;
        for (const {tables, low, high} of tests) {
          const y = tables[0][r] + tables[1][g] + tables[2][b];
          if (y > low && y < high) { holds = false; break; }
        }
        if (holds) return false;
      }
    }
  }
  return true;
}

// Every state a theme's keys determine, with its contrast and its status:
// 'ok'; 'fixed', a failing state whose foreground is a colour Chromium fixes,
// such as the grey globe, which no theme names; 'limitation', a state the
// theme names with its reason and that no colour could hold; or 'FAIL',
// which includes a named limitation that holds or that a colour could hold.
function check(theme) {
  const rows = [];
  for (const [state, fgSpec, bgSpec, min] of STATES) {
    const fg = resolve(theme.colors, fgSpec), bg = resolve(theme.colors, bgSpec);
    if (!fg || !bg) continue;
    const ratio = contrast(fg, bg);
    const named = theme.limitations[state];
    let status = 'ok', reason;
    if (ratio >= min && named) [status, reason] = ['FAIL', 'named as a limitation, but it holds'];
    else if (ratio < min && keyOf(fgSpec).startsWith('#')) [status, reason] = ['fixed', "Chromium's own colour, which no key sets"];
    else if (ratio < min && named && imposed(theme, state)) [status, reason] = ['limitation', named];
    else if (ratio < min && named) [status, reason] = ['FAIL', 'named as a limitation, but a colour could hold it'];
    else if (ratio < min) status = 'FAIL';
    rows.push({state, fg, bg, min, ratio: Math.round(ratio * 100) / 100, status, reason});
  }
  return rows;
}

// The manifest.json a theme folder holds.
function manifest(theme) {
  const colors = {};
  for (const key of KEYS) if (theme.colors[key]) colors[key] = rgb(theme.colors[key]);
  return {
    manifest_version: 3,
    name: theme.name,
    version: '1.0.0',
    description: theme.description,
    theme: {colors},
  };
}

// The manifest as written to disk: two-space JSON with each colour on one
// line, so a folder reads at a glance.
function serialize(theme) {
  return JSON.stringify(manifest(theme), null, 2)
    .replace(/\[\s+(\d+),\s+(\d+),\s+(\d+)\s+\]/g, '[$1, $2, $3]') + '\n';
}

module.exports = Object.freeze({KEYS, STATES, THEMES, rgb, contrast, imposed, check, manifest, serialize});
