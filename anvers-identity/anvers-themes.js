/*
 * Anvers browser themes: colour-only Chromium themes for the frame, tabs,
 * toolbar, address bar and bookmark text, built from the identity's own
 * palette (red, yellow, blue, paper, ink), plus white for the address field
 * and the text on the frame, and a dark red for the default's toolbar icons.
 *
 * Each theme is a standalone folder holding one manifest.json and nothing
 * else: no code, no images and no ntp_* key. Chromium still paints its own
 * New Tab page in the toolbar colour whenever any theme is installed, and it
 * shows private windows in its own dark colours whatever the theme says; see
 * the README. bin/anvers-themes.js writes the folders from this table; the
 * tests check that the committed folders match it, that every key is one
 * Chromium reads, and that every text and icon keeps its contrast in each
 * state Chromium draws.
 *
 * Node only (CommonJS), no dependency.
 */
'use strict';

const {palette, grounds} = require('./anvers-identity.js');

const LIGHT = palette.light;
const PAPER = grounds.paper;
const INK = grounds.ink;
const WHITE = '#ffffff';
const DARK_RED = '#7a2318';

// The colour keys these themes write, a subset of those Chromium's theme pack
// reads (chrome/browser/themes/browser_theme_pack.cc). Left out on purpose:
// ntp_* (the New Tab page), background_tab* (a tab fill apart from the frame)
// and the incognito keys, which Chromium ignores because it does not theme
// private windows.
const KEYS = Object.freeze([
  'frame', 'frame_inactive',
  'toolbar', 'toolbar_text', 'toolbar_button_icon',
  'tab_text', 'tab_background_text', 'tab_background_text_inactive',
  'bookmark_text', 'omnibox_background', 'omnibox_text',
]);

// Each state Chromium 141 draws a text or an icon in, what it sits on, and the
// contrast it needs: 4.5:1 for text, 3:1 for icons. A background is a key or
// a mix [over, under, share of over]: Chromium fills a hovered background tab
// with 40% of the toolbar colour over the frame, a selected tab with 75%, and
// a hovered selected tab with 85%, and it keeps the background-tab text on a
// hovered tab, selected or not (tab_strip_color_mixer.cc, tab_style_views.cc).
// In an unfocused window it draws the new-tab button with the toolbar icon
// colour at 0x6E/255 opacity (chrome_color_mixer.cc), so that foreground is
// itself a mix. The active tab takes the toolbar colour.
const HOVER = 0.4, SELECTED = 0.75, SELECTED_HOVER = 0.85, DIMMED = 0x6E / 255;
const STATES = Object.freeze([
  ['toolbar text', 'toolbar_text', 'toolbar', 4.5],
  ['active tab text', 'tab_text', 'toolbar', 4.5],
  ['bookmark text', 'bookmark_text', 'toolbar', 4.5],
  ['toolbar icons', 'toolbar_button_icon', 'toolbar', 3],
  ['address text', 'omnibox_text', 'omnibox_background', 4.5],
  ['background tab text', 'tab_background_text', 'frame', 4.5],
  ['hovered background tab text', 'tab_background_text', ['toolbar', 'frame', HOVER], 4.5],
  ['selected tab text', 'tab_text', ['toolbar', 'frame', SELECTED], 4.5],
  ['hovered selected tab text', 'tab_background_text', ['toolbar', 'frame', SELECTED_HOVER], 4.5],
  ['background tab text, unfocused window', 'tab_background_text_inactive', 'frame_inactive', 4.5],
  ['hovered background tab text, unfocused window', 'tab_background_text_inactive', ['toolbar', 'frame_inactive', HOVER], 4.5],
  ['selected tab text, unfocused window', 'tab_text', ['toolbar', 'frame_inactive', SELECTED], 4.5],
  ['hovered selected tab text, unfocused window', 'tab_background_text_inactive', ['toolbar', 'frame_inactive', SELECTED_HOVER], 4.5],
  ['new-tab button, unfocused window', ['toolbar_button_icon', 'frame_inactive', DIMMED], 'frame_inactive', 3],
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

// The states the 0.5.2 composition cannot pass, whatever its exact values:
// a dark frame under a light toolbar, with dark icons.
const LIGHT_ON_LIGHT = 'Chromium keeps the light text of background tabs on a fill that is 85% the light toolbar colour';
const DIMMED_ICON = 'Chromium draws the button in the dark icon colour at 43% opacity over the dark unfocused frame';

const THEMES = Object.freeze([
  {
    folder: 'anvers-bauhaus',
    name: 'Anvers Bauhaus',
    role: 'default',
    description: 'Blue frame, yellow toolbar and active tab, dark-red icons, white address field, ink text.',
    colors: bauhaus({frame: LIGHT.blue, inactive: INK, toolbar: LIGHT.yellow, text: INK, icons: DARK_RED}),
    exceptions: {
      'hovered selected tab text': LIGHT_ON_LIGHT,
      'hovered selected tab text, unfocused window': LIGHT_ON_LIGHT,
      'new-tab button, unfocused window': DIMMED_ICON,
    },
  },
  {
    folder: 'anvers-bauhaus-red',
    name: 'Anvers Bauhaus Red',
    role: 'alternative',
    description: 'Red frame, blue toolbar and active tab, paper icons, white address field, white text.',
    colors: bauhaus({frame: LIGHT.red, inactive: INK, toolbar: LIGHT.blue, text: WHITE, icons: PAPER}),
    exceptions: {},
  },
  {
    folder: 'anvers-bauhaus-ink',
    name: 'Anvers Bauhaus Ink',
    role: 'alternative',
    description: 'Ink frame, red toolbar and active tab, paper icons, white address field, white text.',
    colors: bauhaus({frame: INK, inactive: INK, toolbar: LIGHT.red, text: WHITE, icons: PAPER}),
    exceptions: {},
  },
  {
    // Codex's bundled theme of Anvers 0.5.0, as reported on the pull request,
    // without its ntp_* keys. Only the reported keys are set; Chromium derives
    // the rest, so only the states built from reported keys are computed.
    folder: 'anvers-reference-0.5.0',
    name: 'Anvers Reference 0.5.0',
    role: 'reference',
    description: 'The theme bundled with Anvers 0.5.0, without its New Tab page keys.',
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
    exceptions: {},
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

// A key, or a mix of keys, as a colour; null if the theme leaves a key unset.
function resolve(colors, spec) {
  if (typeof spec === 'string') return colors[spec] || null;
  const [over, under, share] = spec;
  return colors[over] && colors[under] ? mix(colors[over], colors[under], share) : null;
}

// Every state a theme's keys determine, with its contrast and its status:
// 'ok', 'exception' (a known state the composition cannot pass, named in the
// theme with its reason) or 'FAIL'.
function check(theme) {
  const rows = [];
  for (const [state, fgSpec, bgSpec, min] of STATES) {
    const fg = resolve(theme.colors, fgSpec), bg = resolve(theme.colors, bgSpec);
    if (!fg || !bg) continue;
    const ratio = contrast(fg, bg);
    const reason = theme.exceptions[state];
    const status = ratio >= min ? 'ok' : reason ? 'exception' : 'FAIL';
    rows.push({state, fg, bg, min, ratio: Math.round(ratio * 100) / 100, status, reason: status === 'exception' ? reason : undefined});
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

module.exports = Object.freeze({KEYS, STATES, THEMES, rgb, mix, contrast, check, manifest, serialize});
