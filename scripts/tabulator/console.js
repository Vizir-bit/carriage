// Tabulator: the new tab page as the operator's console of the first IBM
// machines. Neon lamps in bi-quinary code, after the IBM 650 (1954), show the
// date and time and four cities' clocks; an 80-column punched card, the card
// IBM introduced in 1928, carries the engine version and today's date in
// Hollerith code. scripts/tabulator_ntp_patch.py splices this into Carriage's
// compiled new tab page, where `html` is Lit's; the page renders it again
// every second through Carriage's clock timer (carriageClocks_).
const TABULATOR_ENGINE = '__TABULATOR_ENGINE__';

const TABULATOR_CITIES = [
  ['London', 'Europe/London'],
  ['Paris', 'Europe/Paris'],
  ['Roma', 'Europe/Rome'],
  ['Moscow', 'Europe/Moscow'],
];

const tabulatorCityFormatters = TABULATOR_CITIES.map(
    ([, timeZone]) => new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }));

const tabulatorDateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

// Card geometry in hundredths of an inch: a card of 7 3/8 by 3 1/4 inches,
// 80 columns 0.087 in apart, 12 rows 0.25 in apart (rows 12 and 11, then 0
// to 9 from the top), holes 0.055 by 0.125 in.
const TABULATOR_COLUMN_X = Array.from({length: 80}, (_, i) => 25.1 + 8.7 * i);
const TABULATOR_COLUMN_LIST =
    TABULATOR_COLUMN_X.map(x => x.toFixed(1)).join(' ');
const TABULATOR_PRINTED_ROWS = [...'0123456789'].map(d => d.repeat(80));

function tabulatorRowY(row) {
  return 25 + 25 * row;
}

// Column numbers 1 to 80, printed in small type under rows 0 and 9; each
// character gets its own x so that two-digit numbers centre on their column.
const TABULATOR_COLUMN_NUMBERS = (() => {
  let text = '';
  const xs = [];
  TABULATOR_COLUMN_X.forEach((x, i) => {
    const n = String(i + 1);
    [...n].forEach((ch, j) => {
      text += ch;
      xs.push((x + (j - (n.length - 1) / 2) * 2.4).toFixed(1));
    });
  });
  return {text, x: xs.join(' ')};
})();

// Rows punched for one character (IBM 026/029 code), counted from the top:
// 0 is row 12, 1 is row 11, 2 to 11 are rows 0 to 9.
function tabulatorPunches(ch) {
  const c = ch.charCodeAt(0);
  if (ch >= '0' && ch <= '9') {
    return [2 + c - 48];
  }
  if (ch >= 'A' && ch <= 'I') {
    return [0, 2 + c - 64];
  }
  if (ch >= 'J' && ch <= 'R') {
    return [1, 2 + c - 73];
  }
  if (ch >= 'S' && ch <= 'Z') {
    return [2, 2 + c - 81];
  }
  return {'&': [0], '-': [1], '/': [2, 3], '.': [0, 5, 10], ',': [2, 5, 10]}[ch]
      ?? [];
}

let tabulatorCardMemo = {key: '', text: '', x: '', holes: ''};

function tabulatorCardFor(now) {
  const parts = Object.fromEntries(tabulatorDateFormatter.formatToParts(now)
      .map(part => [part.type, part.value]));
  const key = `TABULATOR - CHROMIUM ${TABULATOR_ENGINE} - ${parts['weekday']} ${
      parts['day']} ${parts['month']} ${parts['year']}`.toUpperCase();
  if (key !== tabulatorCardMemo.key) {
    let text = '';
    const xs = [];
    let holes = '';
    [...key.slice(0, 80)].forEach((ch, i) => {
      const x = TABULATOR_COLUMN_X[i];
      for (const row of tabulatorPunches(ch)) {
        holes += `M${(x - 2.75).toFixed(2)} ${
            (tabulatorRowY(row) - 6.25).toFixed(2)}h5.5v12.5h-5.5z`;
      }
      if (ch !== ' ') {
        text += ch;
        xs.push(x.toFixed(1));
      }
    });
    tabulatorCardMemo = {key, text, x: xs.join(' '), holes};
  }
  return tabulatorCardMemo;
}

// One decimal digit in bi-quinary: a lamp for 0 or for 5, then one of five
// lamps for 0 to 4. The digit is the sum of the two lit lamps.
function tabulatorDigit(d, position) {
  const q = d % 5;
  return html`
      <div class="tabulator-digit">
        <b class="tabulator-pos">${position}</b>
        <i class="tabulator-lamp ${d < 5 ? 'on' : ''}"></i>
        <i class="tabulator-lamp ${d >= 5 ? 'on' : ''}"></i>
        <i class="tabulator-lamp quinary ${q === 0 ? 'on' : ''}"></i>
        <i class="tabulator-lamp ${q === 1 ? 'on' : ''}"></i>
        <i class="tabulator-lamp ${q === 2 ? 'on' : ''}"></i>
        <i class="tabulator-lamp ${q === 3 ? 'on' : ''}"></i>
        <i class="tabulator-lamp ${q === 4 ? 'on' : ''}"></i>
      </div>`;
}

function tabulatorPair(label, value, position) {
  const v = String(value).padStart(2, '0');
  return html`
      <div class="tabulator-pair">
        <div class="tabulator-digits">
          ${tabulatorDigit(Number(v[0]), position ?? '')}
          ${tabulatorDigit(Number(v[1]), position ? position - 1 : '')}
        </div>
        <div class="tabulator-label">${label}</div>
        <div class="tabulator-value">${v}</div>
      </div>`;
}

function tabulatorConsole() {
  const now = new Date();
  const two = n => String(n).padStart(2, '0');
  const cities = TABULATOR_CITIES.map(([city], i) => {
    const parts = tabulatorCityFormatters[i].formatToParts(now);
    const get = type =>
        Number(parts.find(part => part.type === type)?.value ?? 0);
    const hour = get('hour');
    return {city, hour, minute: get('minute'), day: hour >= 7 && hour < 19};
  });
  const word = [
    ['Day', now.getDate()],
    ['Month', now.getMonth() + 1],
    ['Hour', now.getHours()],
    ['Min', now.getMinutes()],
    ['Sec', now.getSeconds()],
  ];
  const online = navigator.onLine;
  const card = tabulatorCardFor(now);
  const summary = `Local time ${two(now.getHours())}:${two(now.getMinutes())}:${
      two(now.getSeconds())}. ${
      cities.map(c => `${c.city} ${two(c.hour)}:${two(c.minute)}`)
          .join(', ')}.`;
  return html`
    <div id="tabulatorCabinet" aria-hidden="true">
      <div class="tabulator-trim top"></div>
      <div class="tabulator-louvres left"></div>
      <div class="tabulator-louvres right"></div>
      <div class="tabulator-plinth"></div>
      <div class="tabulator-trim bottom"></div>
    </div>
    <div id="tabulatorPlate" aria-hidden="true">TABULATOR</div>
    <div id="tabulatorConsole" role="img" aria-label="${summary}">
      <div class="tabulator-face">
        <div class="tabulator-head">
          <span>Display</span>
          <span class="tabulator-status">
            <i class="tabulator-lamp small on"></i>Power
            <i class="tabulator-lamp small ${online ? 'on' : ''}"></i>Network
          </span>
        </div>
        <div class="tabulator-registers">
          <div class="tabulator-rows">
            <b class="tabulator-pos"></b>
            <span>0</span><span>5</span>
            <span class="quinary">0</span><span>1</span><span>2</span>
            <span>3</span><span>4</span>
          </div>
          <div class="tabulator-register">
            <div class="tabulator-caption">Date and time</div>
            <div class="tabulator-pairs">
              ${word.map(([label, value], i) =>
                  tabulatorPair(label, value, 10 - 2 * i))}
            </div>
          </div>
          <div class="tabulator-sign">
            <b class="tabulator-pos"></b>
            <span><i class="tabulator-lamp on"></i>+</span>
            <span><i class="tabulator-lamp"></i>−</span>
          </div>
          <div class="tabulator-divider"></div>
          ${cities.map(c => html`
            <div class="tabulator-register">
              <div class="tabulator-caption">
                ${c.city}<i class="tabulator-lamp small ${c.day ? 'on' : ''}"
                    title="Daylight hours, 07:00 to 19:00"></i>
              </div>
              <div class="tabulator-pairs">
                ${tabulatorPair('Hour', c.hour)}
                ${tabulatorPair('Min', c.minute)}
              </div>
            </div>
          `)}
        </div>
      </div>
    </div>
    <svg id="tabulatorCard" viewBox="0 0 737.5 325" role="img"
        aria-label="Punched card: ${card.key}">
      <defs>
        <linearGradient id="tabulatorManila" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#F4E9CB"></stop>
          <stop offset="1" stop-color="#E3D2A6"></stop>
        </linearGradient>
      </defs>
      <path class="stock" fill="url(#tabulatorManila)"
          d="M25 0H731.5a6 6 0 0 1 6 6V319a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V25Z">
      </path>
      <g class="printed">
        <text x="${TABULATOR_COLUMN_LIST}" y="78.2">${TABULATOR_PRINTED_ROWS[0]}</text>
        <text x="${TABULATOR_COLUMN_LIST}" y="103.2">${TABULATOR_PRINTED_ROWS[1]}</text>
        <text x="${TABULATOR_COLUMN_LIST}" y="128.2">${TABULATOR_PRINTED_ROWS[2]}</text>
        <text x="${TABULATOR_COLUMN_LIST}" y="153.2">${TABULATOR_PRINTED_ROWS[3]}</text>
        <text x="${TABULATOR_COLUMN_LIST}" y="178.2">${TABULATOR_PRINTED_ROWS[4]}</text>
        <text x="${TABULATOR_COLUMN_LIST}" y="203.2">${TABULATOR_PRINTED_ROWS[5]}</text>
        <text x="${TABULATOR_COLUMN_LIST}" y="228.2">${TABULATOR_PRINTED_ROWS[6]}</text>
        <text x="${TABULATOR_COLUMN_LIST}" y="253.2">${TABULATOR_PRINTED_ROWS[7]}</text>
        <text x="${TABULATOR_COLUMN_LIST}" y="278.2">${TABULATOR_PRINTED_ROWS[8]}</text>
        <text x="${TABULATOR_COLUMN_LIST}" y="303.2">${TABULATOR_PRINTED_ROWS[9]}</text>
      </g>
      <text class="numbers" x="${TABULATOR_COLUMN_NUMBERS.x}" y="88.5">${
          TABULATOR_COLUMN_NUMBERS.text}</text>
      <text class="numbers" x="${TABULATOR_COLUMN_NUMBERS.x}" y="313.5">${
          TABULATOR_COLUMN_NUMBERS.text}</text>
      <text class="interpret" x="${card.x}" y="13.2">${card.text}</text>
      <path class="holes" d="${card.holes}"></path>
    </svg>
  `;
}
