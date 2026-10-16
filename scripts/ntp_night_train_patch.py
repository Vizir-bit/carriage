#!/usr/bin/env python3
"""Put the night window train into a built app's new tab page (pak patch).

Replaces the Pullman clocks in an already-built resources.pak with the night
train, taking the markup and the CSS straight from the source of truth,
resources/carriage/ntp-tree, so a released build can be refreshed in minutes
instead of a full Chromium build.

usage: ntp_night_train_patch.py <path to resources.pak>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pak_patch as p

NTP = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'resources/carriage/ntp-tree/chrome/browser/resources/new_tab_page')

# Where the Carriage block sits in the compiled bundle. The CSS runs from the
# panelling to the end of the stylesheet; the markup from the panelling to the
# lazily rendered rest of the page. In the sources the CSS block starts at its
# comment and runs to the end of the file.
CSS_FROM, CSS_TO = '#carriagePanelling{', '`])'
CSS_SOURCE_FROM = '/* Carriage: a night train of windows.'
HTML_FROM, HTML_TO = '<div id="carriagePanelling"', '${this.lazyRender_'
# The clocks ticked once a second; nothing reads them now.
CLOCK_TIMER = ('this.carriageClockTimer_=window.setInterval((()=>{'
               'this.carriageClocks_=carriageClocksNow()}),1e3);')


def section(path, start, end=None):
    """The text from an anchor in one of the source files, to end or to EOF."""
    s = open(os.path.join(NTP, path)).read()
    i = s.index(start)
    return s[i:s.index(end, i)] if end else s[i:]


def strip_comments(css):
    out = []
    while '/*' in css:
        head, css = css.split('/*', 1)
        out.append(head)
        css = css.split('*/', 1)[1].lstrip('\n')
    return ''.join(out) + css


def splice(s, start, end, new, what):
    i = s.index(start)
    j = s.index(end, i)
    print(f'{what}: {j - i} chars out, {len(new)} in')
    return s[:i] + new + s[j:]


def main(pak):
    css = strip_comments(section('app.css', CSS_SOURCE_FROM)).strip()
    html = section('app.html', HTML_FROM, HTML_TO).rstrip() + '\n  '
    assert '`' not in css + html and '${' not in html, 'breaks the template'

    enc, order, res, aliases = p.read(pak)
    done = False
    for rid in order:
        kind, raw = p.decode(res[rid])
        if b'carriagePanelling' not in raw:
            continue
        s = raw.decode('utf-8')
        if 'carriageTrain' in s:
            sys.exit('already patched')
        s = splice(s, CSS_FROM, CSS_TO, css, f'resource {rid} css')
        s = splice(s, HTML_FROM, HTML_TO, html, f'resource {rid} markup')
        assert s.count(CLOCK_TIMER) == 1, 'clock timer anchor'
        s = s.replace(CLOCK_TIMER, '')
        res[rid] = p.encode(kind, s.encode('utf-8'))
        done = True
    assert done, 'no new tab page resource in this pak'
    p.write(pak, enc, order, res, aliases)
    print('night window train in place')


if __name__ == '__main__':
    main(sys.argv[1])
