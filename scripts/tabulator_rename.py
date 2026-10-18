#!/usr/bin/env python3
"""Tabulator: rename the product in a Carriage build's localised strings
(menus, dialogs, settings), so that it says "Quit Tabulator", not "Quit
Carriage". The name is compiled into every locale.pak as plain text.
usage: tabulator_rename.py FRAMEWORK_RESOURCES_DIR"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import pak_patch as p

OLD, NEW = 'Carriage', 'Tabulator'
CODECS = {1: 'utf-8', 2: 'utf-16-le'}  # pak text encodings; 0 is binary


def rename(path):
    enc, order, res, al = p.read(path)
    codec = CODECS.get(enc, 'utf-8')
    old, new = OLD.encode(codec), NEW.encode(codec)
    count = 0
    for rid in order:
        kind, raw = p.decode(res[rid])
        n = raw.count(old)
        if n:
            count += n
            res[rid] = p.encode(kind, raw.replace(old, new))
    if count:
        p.write(path, enc, order, res, al)
    return count


def main():
    paks = sorted(glob.glob(os.path.join(sys.argv[1], '*.lproj', 'locale.pak')))
    if not paks:
        sys.exit('no locale.pak found')
    english = 0
    for pak in paks:
        n = rename(pak)
        lang = os.path.basename(os.path.dirname(pak))
        print(f'{lang}: {n}')
        if lang == 'en.lproj':
            english = n
    if not english:
        sys.exit(f'{OLD!r} not found in the English strings')


if __name__ == '__main__':
    main()
