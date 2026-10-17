#!/usr/bin/env python3
"""Merge an Apple silicon (arm64) build and an Intel (x86_64) build of Carriage
into one universal app bundle that runs natively on both kinds of Mac.

usage: make_universal.py ARM64.app X86_64.app OUT.app [--take-arm64 GLOB]...
                         [--dry-run]

- A Mach-O file found in both builds is joined with lipo: its arm64 slice from
  the first build, its x86_64 slice from the second.
- Any other file must be identical in both builds, or exist in only one of them
  (as Chromium's per-architecture V8 snapshots do), or be an Info.plist whose
  only difference is LSMinimumSystemVersion (the higher one is kept).
- Code signatures are not merged: sign the result afterwards
  (codesign --force --deep --sign - OUT.app, as for any Carriage test build).

Anything else stops the merge, with the full list, rather than guessing. A file
that may safely be taken from the arm64 build can be named with --take-arm64
(a glob on the path inside the bundle) to get past it.
"""
import argparse
import filecmp
import fnmatch
import os
import plistlib
import shutil
import stat
import subprocess
import sys
import tempfile

ARCHS = ('arm64', 'x86_64')
MACHO_MAGICS = {
    b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf',  # 64-bit
    b'\xce\xfa\xed\xfe', b'\xfe\xed\xfa\xce',  # 32-bit
    b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf',  # universal (fat, fat64)
}


def is_macho(path):
    with open(path, 'rb') as f:
        head = f.read(8)
    if head[:4] not in MACHO_MAGICS:
        return False
    if head[:4] in (b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
        # Java class files share the fat magic; a fat file lists few slices.
        return int.from_bytes(head[4:8], 'big') < 20
    return True


def archs_of(path):
    out = subprocess.run(['lipo', '-archs', path], check=True,
                         capture_output=True, text=True).stdout
    return set(out.split())


def entries(top):
    """Map of path inside the bundle -> 'dir', 'file' or 'link'."""
    found = {}
    for root, dirs, files in os.walk(top):
        for name in dirs + files:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, top)
            if os.path.islink(full):
                found[rel] = 'link'
            elif os.path.isdir(full):
                found[rel] = 'dir'
            elif os.path.isfile(full):
                found[rel] = 'file'
            else:
                found[rel] = 'other'
    return found


def merge_plists(a, b):
    with open(a, 'rb') as f:
        raw = f.read()
    pa = plistlib.loads(raw)
    with open(b, 'rb') as f:
        pb = plistlib.load(f)
    if not isinstance(pa, dict) or not isinstance(pb, dict):
        return None, ['not a dictionary']
    differ = sorted(k for k in set(pa) | set(pb) if pa.get(k) != pb.get(k))
    unresolved = [k for k in differ if k != 'LSMinimumSystemVersion']
    if unresolved:
        return None, unresolved
    if 'LSMinimumSystemVersion' in differ:
        version = lambda v: tuple(int(p) for p in str(v).split('.'))
        pa['LSMinimumSystemVersion'] = max(
            pa.get('LSMinimumSystemVersion', '0'),
            pb.get('LSMinimumSystemVersion', '0'), key=version)
    fmt = plistlib.FMT_BINARY if raw.startswith(b'bplist') else plistlib.FMT_XML
    return plistlib.dumps(pa, fmt=fmt), []


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('arm64_app')
    ap.add_argument('x86_64_app')
    ap.add_argument('out_app')
    ap.add_argument('--take-arm64', action='append', default=[], metavar='GLOB')
    ap.add_argument('--dry-run', action='store_true',
                    help='check and report only; write nothing')
    args = ap.parse_args()
    top_a, top_b, out = args.arm64_app, args.x86_64_app, args.out_app
    for top in (top_a, top_b):
        if not os.path.isdir(top) or not top.rstrip('/').endswith('.app'):
            sys.exit(f'{top}: not an app bundle')
    if not args.dry_run and os.path.lexists(out):
        sys.exit(f'{out} exists; choose a new output path')

    ea, eb = entries(top_a), entries(top_b)
    errors, notes = [], []
    counts = dict.fromkeys(('lipo', 'same', 'one build', 'plist', 'signature',
                            'taken from arm64', 'dirs', 'links'), 0)
    tmp = tempfile.mkdtemp(prefix='make_universal.')

    def write(rel):
        return None if args.dry_run else os.path.join(out, rel)

    def slice_of(path, arch, rel):
        archs = archs_of(path)
        if arch not in archs:
            errors.append(f'{rel}: no {arch} slice in the {arch} build '
                          f'(has {" ".join(sorted(archs)) or "none"})')
            return None
        if archs == {arch}:
            return path
        thin = os.path.join(tmp, f'{len(os.listdir(tmp))}.{arch}')
        subprocess.run(['lipo', path, '-thin', arch, '-output', thin], check=True)
        return thin

    if not args.dry_run:
        os.makedirs(out)
    for rel in sorted(set(ea) | set(eb)):
        ka, kb = ea.get(rel), eb.get(rel)
        a, b, dest = os.path.join(top_a, rel), os.path.join(top_b, rel), write(rel)
        if 'other' in (ka, kb):
            errors.append(f'{rel}: not a file, folder or link')
            continue
        if ka and kb and ka != kb:
            errors.append(f'{rel}: a {ka} in the arm64 build, a {kb} in the x86_64 build')
            continue
        kind, src = ka or kb, a if ka else b
        if kind == 'dir':
            counts['dirs'] += 1
            if dest:
                os.makedirs(dest, exist_ok=True)
                shutil.copymode(src, dest)
        elif kind == 'link':
            counts['links'] += 1
            if ka and kb and os.readlink(a) != os.readlink(b):
                errors.append(f'{rel}: link points to {os.readlink(a)!r} and '
                              f'{os.readlink(b)!r}')
            elif dest:
                os.symlink(os.readlink(src), dest)
        elif not (ka and kb):
            # In one build only: fine for data (per-architecture V8 snapshots),
            # not for code, which the other kind of Mac could not run.
            if is_macho(src) and not set(ARCHS) <= archs_of(src):
                errors.append(f'{rel}: program code only in the '
                              f'{"arm64" if ka else "x86_64"} build')
                continue
            counts['one build'] += 1
            if dest:
                shutil.copy2(src, dest)
        elif '_CodeSignature' in rel.split(os.sep):
            counts['signature'] += 1  # Replaced when the result is signed.
            if dest:
                shutil.copy2(a, dest)
        elif is_macho(a) and is_macho(b):
            sa, sb = slice_of(a, 'arm64', rel), slice_of(b, 'x86_64', rel)
            if sa and sb:
                counts['lipo'] += 1
                if dest:
                    subprocess.run(['lipo', '-create', sa, sb, '-output', dest],
                                   check=True)
                    shutil.copymode(a, dest)
        elif is_macho(a) != is_macho(b):
            errors.append(f'{rel}: program code in one build only')
        elif filecmp.cmp(a, b, shallow=False):
            counts['same'] += 1
            if dest:
                shutil.copy2(a, dest)
        elif os.path.basename(rel) == 'Info.plist':
            merged, keys = merge_plists(a, b)
            if keys:
                errors.append(f'{rel}: Info.plist differs in {", ".join(keys)}')
                continue
            counts['plist'] += 1
            if dest:
                with open(dest, 'wb') as f:
                    f.write(merged)
                shutil.copymode(a, dest)
        elif any(fnmatch.fnmatch(rel, pat) for pat in args.take_arm64):
            counts['taken from arm64'] += 1
            notes.append(f'{rel}: differs; arm64 copy kept (--take-arm64)')
            if dest:
                shutil.copy2(a, dest)
        else:
            errors.append(f'{rel}: differs between the two builds')

    shutil.rmtree(tmp, ignore_errors=True)
    for line in notes:
        print('note:', line)
    print(', '.join(f'{n} {k}' for k, n in counts.items()))
    if errors:
        for line in errors:
            print('error:', line, file=sys.stderr)
        if not args.dry_run:
            shutil.rmtree(out, ignore_errors=True)
        sys.exit(f'{len(errors)} problem(s); no universal app was made')
    print('dry run: nothing written' if args.dry_run else f'universal app: {out}')


if __name__ == '__main__':
    main()
