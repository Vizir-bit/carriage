#!/usr/bin/env python3
"""Tabulator: replace the Pullman carriage on Carriage's new tab page with the
operator's console in scripts/tabulator/ (post-build patch of resources.pak).

usage: tabulator_ntp_patch.py resources.pak CHROMIUM_VERSION
       tabulator_ntp_patch.py --text bundle.js patched.js CHROMIUM_VERSION

Works on any Carriage build whose page has the Pullman clocks, with or without
the weather plaques. The console shows no weather, so a weather request
compiled into the page is switched off rather than left running unseen."""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import pak_patch as p

HERE = os.path.join(os.path.dirname(__file__), 'tabulator')
NEEDLE = 'CARRIAGE_CLOCK_ZONES'
TEMPLATE_START = '<div id="carriagePanelling"'
TEMPLATE_END = '${this.lazyRender_'
CSS_START = '#carriagePanelling{'
CLASS_ANCHOR = 'class AppElement extends AppElementBase{'
WEATHER_FN = re.compile(r'async function carriageWeatherRefresh\(([^)]*)\)\{')


def minify_css(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'\s+', ' ', css)
    css = re.sub(r'\s*([{};])\s*', r'\1', css)
    return css.replace(';}', '}').strip()


def load(version):
    if not re.fullmatch(r'\d+(\.\d+){3}', version):
        sys.exit(f'not a Chromium version: {version!r}')
    js = open(os.path.join(HERE, 'console.js'), encoding='utf-8').read()
    css = minify_css(open(os.path.join(HERE, 'console.css'),
                          encoding='utf-8').read())
    assert js.count('__TABULATOR_ENGINE__') == 1
    js = js.replace('__TABULATOR_ENGINE__', version)
    assert '`' not in css and '${' not in css and '\\' not in css
    return js, css


def once(s, needle):
    n = s.count(needle)
    if n != 1:
        sys.exit(f'{needle!r} found {n} times, expected once')
    return s.index(needle)


def splice(s, js, css):
    if 'tabulatorConsole' in s:
        sys.exit('already patched')
    # Template: the panelling, plate and clocks (and plaques) give way to the
    # console; the rest of the page (shortcuts, customise button) stays.
    start = once(s, TEMPLATE_START)
    end = s.index(TEMPLATE_END, start)
    s = s[:start] + '${tabulatorConsole()}\n  ' + s[end:]
    # Styles: Carriage's section runs from its first rule to the end of the
    # page's css`...` literal.
    start = once(s, CSS_START)
    end = s.index('`', start)
    s = s[:start] + css + s[end:]
    # Code: module-level functions next to Carriage's, before the element.
    at = once(s, CLASS_ANCHOR)
    s = s[:at] + js + '\n' + s[at:]
    if 'api.open-meteo.com' in s:
        hits = WEATHER_FN.findall(s)
        if len(hits) != 1:
            sys.exit('weather request present but its function was not found'
                     ' once; not patching')
        s = WEATHER_FN.sub(lambda m: m.group(0) + 'return;', s)
        print('weather request switched off')
    return s


def main():
    if sys.argv[1] == '--text':
        src, dst, version = sys.argv[2:5]
        js, css = load(version)
        s = splice(open(src, encoding='utf-8').read(), js, css)
        open(dst, 'w', encoding='utf-8').write(s)
        print('console spliced into', dst)
        return
    pak, version = sys.argv[1:3]
    js, css = load(version)
    enc, order, res, al = p.read(pak)
    done = 0
    for rid in order:
        kind, raw = p.decode(res[rid])
        if NEEDLE.encode() not in raw:
            continue
        s = splice(raw.decode('utf-8'), js, css)
        res[rid] = p.encode(kind, s.encode('utf-8'))
        assert p.decode(res[rid])[1] == s.encode('utf-8')
        print(f'resource {rid} ({kind}): console spliced')
        done += 1
    if done != 1:
        sys.exit(f'{NEEDLE} found in {done} resources, expected one')
    p.write(pak, enc, order, res, al)


if __name__ == '__main__':
    main()
