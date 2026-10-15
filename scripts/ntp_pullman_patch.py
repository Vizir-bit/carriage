#!/usr/bin/env python3
"""Bring the Pullman new tab page of a built Carriage or Orient-Express app up
to date, without rebuilding Chromium (post-build pak patch).

The Carriage parts of the page are taken from the same sources a full build
compiles, resources/carriage/ntp-tree/chrome/browser/resources/new_tab_page/
(app.ts, app.html, app.css), so both apps show the same page. The TypeScript
is turned into JavaScript by removing its type annotations; the script stops if
anything is left that it does not recognise.

usage: ntp_pullman_patch.py path/to/resources.pak [--at 2026-12-21T17:30:00Z]

--at shows the clocks as if it were that moment (UTC), to check the skies and
the moon at night in a layout test. Never use it for a release.
"""
import argparse, datetime, os, re, sys
sys.path.insert(0, os.path.dirname(__file__)); import pak_patch as p

NTP = os.path.join(os.path.dirname(__file__), '..', 'resources', 'carriage',
                   'ntp-tree', 'chrome', 'browser', 'resources', 'new_tab_page')
read = lambda name: open(os.path.join(NTP, name), encoding='utf-8').read()
JS_MARK = '// Carriage: four Pullman-window clocks'


def between(text, start, end, what):
    i = text.find(start)
    j = text.find(end, i + len(start))
    if i < 0 or j < 0 or text.count(start) != 1:
        sys.exit(f'{what}: anchor not found or not unique')
    return i, j


def strip_types(ts):
    """TypeScript to JavaScript for the Carriage clock code in app.ts."""
    js = re.sub(r'^interface \w+ \{\n(?:  .*\n)*\}\n\n', '', ts, flags=re.M)
    js = re.sub(r'(const \w+): Array<[^=]+> =', r'\1 =', js)
    js = re.sub(r'(\w+): (?:number|string)(?=[,)])', r'\1', js)
    js = re.sub(r'\): [\w\[\]]+ \{', ') {', js)
    js = js.replace(']!.', '].')
    leftover = re.search(r'\binterface\b|: (?:number|string|boolean)\b|'
                         r'\bArray<|!\.|\bas [A-Z]|\bprivate\b|\bprotected\b', js)
    if leftover:
        sys.exit(f'TypeScript left after stripping types: {leftover.group(0)!r}')
    return js


def carriage_sources(at):
    ts = read('app.ts')
    i, j = between(ts, JS_MARK, 'export class AppElement extends AppElementBase {',
                   'app.ts')
    js = strip_types(ts[i:j])
    if at:
        shift = round((at - datetime.datetime.now(datetime.timezone.utc))
                      .total_seconds() * 1000)
        assert js.count('const now = new Date();') == 1
        js = js.replace('const now = new Date();',
                        f'const now = new Date(Date.now() + {shift});')
    i, j = between(ts, '  private carriageScheduleTick_() {\n', '\n  }\n',
                   'app.ts tick')
    tick = 'carriageScheduleTick_() {\n' + ts[i:j].split('\n', 1)[1] + '\n  }'

    html = read('app.html')
    i, j = between(html, '  <div id="carriagePanelling"', '  ${this.lazyRender_',
                   'app.html')
    template = html[i + 2:j].rstrip('\n')

    css = read('app.css')
    css = css[css.index('/* Carriage: '):]
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'\s*([{};,])\s*', r'\1', re.sub(r'\s+', ' ', css)).strip()
    # The template goes in as Chromium's build puts it, inside html`...`; the
    # styles go inside css`...`, where these would end or change the text.
    if any(c in css for c in ('`', '\\', '${')):
        sys.exit('app.css: backquote, backslash or ${ in the Carriage section')
    return js, tick, template, css


def patch(s, js, tick, template, css):
    # Clock code: from the zone table (or the comment this script put before
    # it last time) to the app element.
    start = JS_MARK if JS_MARK in s else 'const CARRIAGE_CLOCK_ZONES='
    i, j = between(s, start, 'class AppElement extends AppElementBase{',
                   'clock code')
    s = s[:i] + js + s[j:]
    # Styles: the Carriage rules close the app's stylesheet.
    i, j = between(s, '#carriagePanelling{', '`', 'styles')
    s = s[:i] + css + s[j:]
    # Template: the Carriage panelling, nameplate and windows open #content.
    i, j = between(s, '<div id="carriagePanelling"', '\n  ${this.lazyRender_',
                   'template')
    s = s[:i] + template + s[j:]
    # Ticks on each whole second (builds from before this script only).
    old_start = ('connectedCallback(){super.connectedCallback();'
                 'this.carriageClockTimer_=window.setInterval((()=>{'
                 'this.carriageClocks_=carriageClocksNow()}),1e3);')
    if 'carriageScheduleTick_(){' not in s and 'carriageScheduleTick_() {' not in s:
        if s.count(old_start) != 1:
            sys.exit('clock timer: anchor not found or not unique')
        s = s.replace(old_start, tick + 'connectedCallback(){super.connectedCallback();'
                      'this.carriageScheduleTick_();')
        s = s.replace('window.clearInterval(this.carriageClockTimer_)',
                      'window.clearTimeout(this.carriageClockTimer_)')
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pak')
    ap.add_argument('--at', type=lambda v: datetime.datetime.fromisoformat(
        v.replace('Z', '+00:00')))
    args = ap.parse_args()
    js, tick, template, css = carriage_sources(args.at)
    enc, order, res, al = p.read(args.pak)
    done = 0
    for rid in order:
        kind, raw = p.decode(res[rid])
        if b'CARRIAGE_CLOCK_ZONES' not in raw:
            continue
        s = patch(raw.decode('utf-8'), js, tick, template, css)
        res[rid] = p.encode(kind, s.encode('utf-8'))
        assert p.decode(res[rid])[1] == s.encode('utf-8')
        done += 1
        print(f'resource {rid} ({kind}): Pullman page updated')
    if done != 1:
        sys.exit(f'expected one new tab page resource, found {done}')
    p.write(args.pak, enc, order, res, al)


if __name__ == '__main__':
    main()
