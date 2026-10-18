// Tests for the Tabulator console: the punched card decodes back to its text
// through an independent IBM 029 table, and each bi-quinary digit lights
// exactly its two lamps. Run: node scripts/tabulator/test_console.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./console.js', import.meta.url), 'utf8')
    .replace('__TABULATOR_ENGINE__', '155.0.8059.39');

// Lit's html, reduced to string concatenation.
const flat = v => Array.isArray(v) ? v.map(flat).join('') : String(v ?? '');
const html = (strings, ...values) =>
    strings.reduce((out, s, i) => out + s + (i < values.length ?
        flat(values[i]) : ''), '');
const context = vm.createContext({html, navigator: {onLine: true}, Intl});
const api = vm.runInContext(
    `${source}\n;({tabulatorDigit, tabulatorCardFor, tabulatorConsole})`,
    context);

// IBM 029 card code, written out independently of console.js.
const CODE = {' ': ''};
'123456789'.split('').forEach((d, i) => {
  CODE['ABCDEFGHI'[i]] = `12-${d}`;
  CODE['JKLMNOPQR'[i]] = `11-${d}`;
});
'23456789'.split('').forEach((d, i) => CODE['STUVWXYZ'[i]] = `0-${d}`);
'0123456789'.split('').forEach(d => CODE[d] = d);
Object.assign(CODE, {'&': '12', '-': '11', '/': '0-1', '.': '12-3-8',
                     ',': '0-3-8'});
const DECODE = Object.fromEntries(Object.entries(CODE).map(([c, p]) => [p, c]));
const ROW_NAMES = ['12', '11', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function decodeCard(holes) {
  const columns = Array.from({length: 80}, () => []);
  for (const [, x, y] of holes.matchAll(/M([\d.]+) ([\d.]+)h5\.5v12\.5h-5\.5z/g)) {
    const col = Math.round((Number(x) + 2.75 - 25.1) / 8.7);
    const row = Math.round((Number(y) + 6.25 - 25) / 25);
    assert.ok(col >= 0 && col < 80 && row >= 0 && row < 12, `hole ${x},${y}`);
    columns[col].push(row);
  }
  return columns.map(rows => {
    const key = rows.sort((a, b) => a - b).map(r => ROW_NAMES[r]).join('-');
    assert.ok(key in DECODE, `unknown punch combination ${key}`);
    return DECODE[key];
  }).join('').trimEnd();
}

for (const date of [new Date(2026, 9, 18, 16, 42, 7),
                    new Date(2027, 8, 29, 0, 0, 0),
                    new Date(1954, 11, 1, 9, 30, 0)]) {
  const card = api.tabulatorCardFor(date);
  assert.equal(decodeCard(card.holes), card.key);
  assert.equal(card.text, card.key.replaceAll(' ', ''));
  assert.equal(card.x.split(' ').length, card.text.length);
}
assert.equal(api.tabulatorCardFor(new Date(2026, 9, 18)).key,
             'TABULATOR - CHROMIUM 155.0.8059.39 - SUNDAY 18 OCTOBER 2026');

// Lamp order in a digit: bi 0, bi 5, then quinary 0 to 4.
for (let d = 0; d <= 9; d++) {
  const lamps = [...api.tabulatorDigit(d, '').matchAll(/class="tabulator-lamp([^"]*)"/g)]
      .map(m => /\bon\b/.test(m[1]));
  assert.equal(lamps.length, 7);
  const lit = lamps.flatMap((on, i) => on ? [i] : []);
  assert.deepEqual(lit, [d < 5 ? 0 : 1, 2 + d % 5], `digit ${d}`);
}

// The whole console renders, with the date-and-time word and four cities.
const page = api.tabulatorConsole();
assert.equal((page.match(/class="tabulator-digit"/g) ?? []).length, 10 + 4 * 4);
assert.match(page, /aria-label="Local time \d\d:\d\d:\d\d\. London \d\d:\d\d, Paris \d\d:\d\d, Roma \d\d:\d\d, Moscow \d\d:\d\d\."/);
console.log('tabulator console: all tests passed');
