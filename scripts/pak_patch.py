#!/usr/bin/env python3
"""Find/replace text inside a Chromium .pak (v5), handling gzip/brotli-compressed resources.
usage: pak_patch.py file.pak needle_must_exist 'old=>new' ['old=>new' ...]"""
import struct, sys, gzip, io
try:
    import brotli
except ImportError:
    brotli = None

BROTLI_MAGIC = b'\x1e\x9b'

def read(path):
    d = open(path, 'rb').read()
    ver = struct.unpack('<I', d[:4])[0]
    assert ver == 5, f'pak version {ver}'
    enc = d[4]; n, na = struct.unpack('<HH', d[8:12])
    pos = 12
    ents = [struct.unpack('<HI', d[pos+6*i:pos+6*i+6]) for i in range(n+1)]
    pos += 6*(n+1)
    aliases = [struct.unpack('<HH', d[pos+4*i:pos+4*i+4]) for i in range(na)]
    res = {ents[i][0]: d[ents[i][1]:ents[i+1][1]] for i in range(n)}
    order = [ents[i][0] for i in range(n)]
    return enc, order, res, aliases

def write(path, enc, order, res, aliases):
    n, na = len(order), len(aliases)
    hdr = struct.pack('<IB3xHH', 5, enc, n, na)
    off = 12 + 6*(n+1) + 4*na
    table = b''; body = b''
    for rid in order:
        table += struct.pack('<HI', rid, off + len(body)); body += res[rid]
    table += struct.pack('<HI', 0, off + len(body))
    al = b''.join(struct.pack('<HH', a, b) for a, b in aliases)
    open(path, 'wb').write(hdr + table + al + body)

def decode(b):
    if b[:2] == b'\x1f\x8b': return 'gzip', gzip.decompress(b)
    if b[:2] == BROTLI_MAGIC and brotli: return 'br', brotli.decompress(b[8:])
    return 'raw', b

def encode(kind, raw):
    if kind == 'gzip': return gzip.compress(raw, 9, mtime=0)
    if kind == 'br':
        size = len(raw)
        return BROTLI_MAGIC + size.to_bytes(6, 'little') + brotli.compress(raw, quality=11)
    return raw

def main():
    path, needle = sys.argv[1], sys.argv[2].encode()
    reps = [tuple(x.encode() for x in r.split('=>', 1)) for r in sys.argv[3:]]
    enc, order, res, aliases = read(path)
    hits = 0
    for rid in order:
        kind, raw = decode(res[rid])
        if needle not in raw: continue
        hits += 1
        new = raw
        for o, nw in reps:
            c = new.count(o)
            print(f'resource {rid} ({kind}, {len(raw)} bytes): {o[:60]!r} x{c}')
            new = new.replace(o, nw)
        if new != raw:
            res[rid] = encode(kind, new)
            assert decode(res[rid])[1] == new
    if not hits: sys.exit(f'needle {needle!r} not found')
    write(path, enc, order, res, aliases)
    print('hits', hits)

if __name__ == '__main__': main()
