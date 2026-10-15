#!/usr/bin/env python3
"""Add a thermometer and sunshine gauge under each Pullman window (post-build pak patch)."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__)); import pak_patch as p
here = os.path.join(os.path.dirname(__file__), 'ntp')
js = open(os.path.join(here, 'weather.js')).read().strip()
css = open(os.path.join(here, 'weather.css')).read().strip()
assert '`])' not in css and '${' not in css
TIME_CSS = '.carriage-time{color:#FFF1CC;font-size:12px;font-variant-numeric:tabular-nums;letter-spacing:0.2em;margin-top:5px}'
REPS = [
  (TIME_CSS + '`', TIME_CSS + css + '`'),
  ('${this.carriageClocks_.map((clock=>html`\n      <div class="carriage-window"',
   '${this.carriageClocks_.map((clock=>html`\n      <div class="carriage-car"><div class="carriage-window"'),
  ('<div class="carriage-time">${clock.digital}</div>\n        </div>\n      </div>\n    `))}',
   '<div class="carriage-time">${clock.digital}</div>\n        </div>\n      </div>${carriagePlaque(clock)}</div>\n    `))}'),
  ('secondAngle:second*6}}))}', 'secondAngle:second*6,weather:carriageWeatherState[i]||null}}))}' + js),
]
pak = sys.argv[1]
enc, order, res, al = p.read(pak)
done = False
for rid in order:
    kind, raw = p.decode(res[rid])
    if b'CARRIAGE_CLOCK_ZONES' not in raw: continue
    s = raw.decode('utf-8')
    if 'carriagePlaque' in s: sys.exit('already patched')
    for old, new in REPS:
        n = s.count(old); print(f'{old[:50]!r}: {n}')
        assert n == 1, 'anchor not unique/found'
        s = s.replace(old, new)
    res[rid] = p.encode(kind, s.encode('utf-8')); done = True
assert done
p.write(pak, enc, order, res, al); print('weather plaque added')
