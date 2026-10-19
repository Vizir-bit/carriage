/*
 * Anvers browser themes: colour-only Chromium themes for the frame, tabs,
 * toolbar, address bar and bookmark text, built from the identity's own
 * palette (red, yellow, blue, paper, ink), plus white for the address field
 * and a dark red for the toolbar icons.
 *
 * Each theme is a standalone folder holding one manifest.json and nothing
 * else: no code, no images, and no ntp_* key, so no page content changes,
 * the New Tab page included. bin/anvers-themes.js writes the folders from
 * this table; the tests check that the committed folders match it, that every
 * key is one Chromium reads, and that every text and icon keeps its contrast.
 *
 * Node only (CommonJS), no dependency.
 */
'use strict';

const {palette} = require('./anvers-identity.js');

const LIGHT = palette.light;
const PAPER = '#f3efe6';
const INK = '#161616';
const WHITE = '#ffffff';
const DARK_RED = '#7a2318';

// The colour keys Chromium's theme pack reads (chrome/browser/themes/
// browser_theme_pack.cc). ntp_* keys exist too and are deliberately left out.
const KEYS = Object.freeze([
  'frame', 'frame_inactive', 'frame_incognito', 'frame_incognito_inactive',
  'toolbar', 'toolbar_text', 'toolbar_button_icon',
  'tab_text', 'tab_background_text', 'tab_background_text_inactive',
  'tab_background_text_incognito', 'tab_background_text_incognito_inactive',
  'bookmark_text', 'button_background', 'omnibox_background', 'omnibox_text',
]);

// Which text or icon sits on which background, and the contrast it needs:
// 4.5:1 for text, 3:1 for icons. The active tab takes the toolbar's colour.
const PAIRS = Object.freeze([
  ['tab_text', 'toolbar', 4.5],
  ['toolbar_text', 'toolbar', 4.5],
  ['bookmark_text', 'toolbar', 4.5],
  ['toolbar_button_icon', 'toolbar', 3],
  ['omnibox_text', 'omnibox_background', 4.5],
  ['tab_background_text', 'frame', 4.5],
  ['tab_background_text_inactive', 'frame_inactive', 4.5],
  ['tab_background_text_incognito', 'frame_incognito', 4.5],
  ['tab_background_text_incognito_inactive', 'frame_incognito_inactive', 4.5],
]);

// A full theme from three choices: the frame, the toolbar and the icons. The
// text is ink on light grounds and paper on the frame; unfocused and private
// windows take the given inactive frame.
function bauhaus({frame, inactive, toolbar, icons}) {
  return {
    frame,
    frame_inactive: inactive,
    frame_incognito: INK,
    frame_incognito_inactive: INK,
    toolbar,
    toolbar_text: INK,
    toolbar_button_icon: icons,
    tab_text: INK,
    tab_background_text: PAPER,
    tab_background_text_inactive: PAPER,
    tab_background_text_incognito: PAPER,
    tab_background_text_incognito_inactive: PAPER,
    bookmark_text: INK,
    omnibox_background: WHITE,
    omnibox_text: INK,
  };
}

const THEMES = Object.freeze([
  {
    folder: 'anvers-bauhaus',
    name: 'Anvers Bauhaus',
    role: 'default',
    description: 'Blue frame, yellow toolbar and active tab, dark-red icons, white address field, ink text.',
    colors: bauhaus({frame: LIGHT.blue, inactive: INK, toolbar: LIGHT.yellow, icons: DARK_RED}),
  },
  {
    folder: 'anvers-bauhaus-red',
    name: 'Anvers Bauhaus Red',
    role: 'alternative',
    description: 'Red frame, paper toolbar and active tab, blue icons, white address field, ink text.',
    colors: bauhaus({frame: LIGHT.red, inactive: INK, toolbar: PAPER, icons: LIGHT.blue}),
  },
  {
    folder: 'anvers-bauhaus-ink',
    name: 'Anvers Bauhaus Ink',
    role: 'alternative',
    description: 'Ink frame, paper toolbar and active tab, red icons, white address field, ink text.',
    colors: bauhaus({frame: INK, inactive: LIGHT.blue, toolbar: PAPER, icons: LIGHT.red}),
  },
  {
    // Codex's bundled theme of Anvers 0.5.0, as reported on the pull request,
    // without its ntp_* keys. Only the reported keys are set; Chromium derives
    // the rest (tab text on the frame among them).
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
  },
]);

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

function luminance(hex) {
  const c = rgb(hex).map(v => v / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Every pair a theme sets, with its contrast and whether it passes.
function check(theme) {
  return PAIRS.filter(([fg, bg]) => theme.colors[fg] && theme.colors[bg]).map(([fg, bg, min]) => {
    const ratio = contrast(theme.colors[fg], theme.colors[bg]);
    return {fg, bg, min, ratio: Math.round(ratio * 100) / 100, pass: ratio >= min};
  });
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

module.exports = Object.freeze({KEYS, PAIRS, THEMES, rgb, contrast, check, manifest, serialize});
