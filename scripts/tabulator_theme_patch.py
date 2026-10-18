#!/usr/bin/env python3
"""Tabulator: change the default theme colour compiled into a Carriage build
from mahogany (#5A2A17) to the console's slate, so the toolbar of a new
profile matches the new tab page.

Carriage's default-colours patch passes SkColorSetRGB(0x5A, 0x2A, 0x17), the
constant 0xFF5A2A17, to two preference writes (new profile, theme reset). On
arm64 clang builds it in a register in two instructions, MOVZ Wd, #0x2A17 and
then MOVK Wd, #0xFF5A, LSL #16. Only such pairs, on the same register within
a few instructions, are rewritten, and only if there are exactly two of them;
otherwise the binary is left untouched and the exit status is 3.
usage: tabulator_theme_patch.py "Carriage Framework" [#RRGGBB]"""
import re
import sys

OLD = 0xFF5A2A17
MOVZ_W, MOVK_W_LSL16, RD = 0x52800000, 0x72A00000, 0x1F
WINDOW = 8  # instructions searched after the MOVZ for its MOVK


def movz(imm, rd):
    return MOVZ_W | imm << 5 | rd


def movk16(imm, rd):
    return MOVK_W_LSL16 | imm << 5 | rd


def word(data, off):
    return int.from_bytes(data[off:off + 4], 'little')


def find_sites(data):
    first = movz(OLD & 0xFFFF, 0).to_bytes(4, 'little')
    # The register number sits in the low five bits of the first byte.
    pattern = re.compile(b'[' + re.escape(bytes([first[0]])) + b'-' +
                         re.escape(bytes([first[0] | RD])) + b']' +
                         re.escape(first[1:]))
    sites = []
    for m in pattern.finditer(data):
        off = m.start()
        if off % 4:
            continue
        rd = data[off] & RD
        for k in range(1, WINDOW + 1):
            if word(data, off + 4 * k) == movk16(OLD >> 16, rd):
                sites.append((off, off + 4 * k, rd))
                break
    return sites


def main():
    path = sys.argv[1]
    colour = sys.argv[2] if len(sys.argv) > 2 else '#44525F'
    if not re.fullmatch(r'#[0-9A-Fa-f]{6}', colour):
        sys.exit(f'not a colour: {colour!r}')
    new = 0xFF000000 | int(colour[1:], 16)
    data = bytearray(open(path, 'rb').read())
    sites = find_sites(data)
    for lo, hi, rd in sites:
        print(f'MOVZ/MOVK w{rd} at {lo:#x}/{hi:#x}')
    if len(sites) != 2:
        print(f'{len(sites)} sites found, expected 2: theme colour left as built')
        sys.exit(3)
    for lo, hi, rd in sites:
        data[lo:lo + 4] = movz(new & 0xFFFF, rd).to_bytes(4, 'little')
        data[hi:hi + 4] = movk16(new >> 16, rd).to_bytes(4, 'little')
    open(path, 'wb').write(data)
    print(f'default theme colour set to {colour.upper()}')


if __name__ == '__main__':
    main()
