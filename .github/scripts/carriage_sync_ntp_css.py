#!/usr/bin/env python3
"""Carriage: when resuming a build from a checkpoint, bring the new tab page's
Carriage CSS in the restored source tree up to date with
patches/carriage/ui/carriage-ntp-night-train.patch (the CSS section is appended at
the end of app.css, starting at the Carriage marker comment)."""
import sys
from pathlib import Path

patch, target = Path(sys.argv[1]), Path(sys.argv[2])
MARK = '/* Carriage: '
lines, in_css, collecting = [], False, False
for raw in patch.read_text().splitlines():
    if raw.startswith('+++ '):
        in_css = raw.endswith('new_tab_page/app.css')
        continue
    if not in_css or raw.startswith('--- ') or raw.startswith('@@'):
        continue
    if raw.startswith('+'):
        if raw[1:].startswith(MARK):
            collecting = True
        if collecting:
            lines.append(raw[1:])
if not lines:
    sys.exit('Carriage CSS section not found in patch')
css = target.read_text()
idx = css.find(MARK)
if idx < 0:
    sys.exit('Carriage CSS section not found in target')
start = css.rfind('\n', 0, idx) + 1
new = css[:start] + '\n'.join(lines) + '\n'
if new != css:
    target.write_text(new)
    print('Updated', target)
else:
    print('Already up to date')
