#!/usr/bin/env python3
"""Sign a Carriage app ad hoc from the inside out, keeping each part's own
entitlements and signing flags (such as the hardened runtime) as built.

usage: sign_adhoc.py APP [--compare-with ARCH=INPUT.app]...

`codesign --deep` signs every nested helper like the outer app and drops the
helpers' own entitlements. Here every piece of code is signed on its own,
deepest first and the app last, with
--preserve-metadata=identifier,entitlements,flags,runtime. No certificate,
Team ID or designated requirement is carried over: an ad-hoc signature has
none.

With --compare-with (for a universal app: arm64=... and x86_64=...), every
signed part must then have, for each architecture, the same entitlements and
flags as the same part of the input built for that architecture.
"""
import argparse
import os
import plistlib
import re
import subprocess
import sys

BUNDLE_SUFFIXES = ('.app', '.xpc', '.appex', '.bundle', '.plugin')
PRESERVE = '--preserve-metadata=identifier,entitlements,flags,runtime'
LINKER_SIGNED = 0x20000  # Set by the linker; any later signature drops it.
MACHO_MAGICS = {b'\xcf\xfa\xed\xfe', b'\xce\xfa\xed\xfe',
                b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'}


def is_macho(path):
    with open(path, 'rb') as f:
        head = f.read(8)
    if head[:4] in (b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
        return int.from_bytes(head[4:8], 'big') < 20
    return head[:4] in MACHO_MAGICS


def executable_of(info_plist):
    try:
        with open(info_plist, 'rb') as f:
            return plistlib.load(f).get('CFBundleExecutable')
    except (OSError, plistlib.InvalidFileException):
        return None


def is_bundle_main(path):
    """True for the main executable of an app, XPC service or framework version,
    which is signed together with its bundle."""
    folder, name = os.path.split(path)
    if os.path.basename(folder) == 'MacOS':
        return executable_of(os.path.join(folder, '..', 'Info.plist')) == name
    if os.path.basename(os.path.dirname(folder)) == 'Versions':
        return executable_of(os.path.join(folder, 'Resources', 'Info.plist')) == name
    return False


def nested_code(app):
    """Every separately signed part inside APP, deepest first."""
    parts = []
    for root, dirs, files in os.walk(app):
        for d in dirs:
            full = os.path.join(root, d)
            if os.path.islink(full):
                continue
            framework_version = (os.path.basename(root) == 'Versions' and
                                 root.endswith('.framework/Versions') and d != 'Current')
            if d.endswith(BUNDLE_SUFFIXES) or framework_version:
                parts.append(full)
        for f in files:
            full = os.path.join(root, f)
            if not os.path.islink(full) and is_macho(full) and not is_bundle_main(full):
                parts.append(full)
    return sorted(parts, key=lambda p: (-p.count(os.sep), p))


def archs_of(path):
    if os.path.isdir(path):
        exe = main_executable(path)
        if exe is None:
            return set()
        path = exe
    out = subprocess.run(['lipo', '-archs', path], capture_output=True, text=True)
    return set(out.stdout.split())


def main_executable(bundle):
    for info, folder in ((os.path.join(bundle, 'Contents', 'Info.plist'),
                          os.path.join(bundle, 'Contents', 'MacOS')),
                         (os.path.join(bundle, 'Resources', 'Info.plist'), bundle)):
        name = executable_of(info)
        if name and os.path.isfile(os.path.join(folder, name)):
            return os.path.join(folder, name)
    return None


def signing_of(path, arch):
    """(flags, entitlements) of one architecture of a signed part."""
    info = subprocess.run(['codesign', '-dv', '--arch', arch, path],
                          capture_output=True, text=True)
    m = re.search(r'flags=0x([0-9a-f]+)', info.stderr)
    flags = int(m.group(1), 16) & ~LINKER_SIGNED if m else None
    ent = subprocess.run(['codesign', '-d', '--entitlements', '-', '--xml',
                          '--arch', arch, path], capture_output=True)
    xml = ent.stdout[ent.stdout.find(b'<?xml'):] if b'<?xml' in ent.stdout else b''
    entitlements = plistlib.loads(xml) if xml else {}
    return flags, entitlements


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('app')
    ap.add_argument('--compare-with', action='append', default=[],
                    metavar='ARCH=INPUT.app')
    args = ap.parse_args()
    app = args.app.rstrip('/')
    inputs = dict(item.split('=', 1) for item in args.compare_with)

    parts = nested_code(app)
    for path in parts + [app]:
        subprocess.run(['codesign', '--force', '--sign', '-', PRESERVE,
                        '--timestamp=none', path], check=True,
                       stdout=subprocess.DEVNULL)
    subprocess.run(['codesign', '--verify', '--deep', '--strict', app], check=True)
    print(f'signed {len(parts)} nested parts and the app, inside out; signature valid')

    problems = []
    for path in parts + [app]:
        rel = os.path.relpath(path, app)
        for arch in sorted(archs_of(path)):
            got = signing_of(path, arch)
            line = (f'{rel} [{arch}]: flags {hex(got[0]) if got[0] is not None else "?"}, '
                    f'entitlements {sorted(got[1]) or "none"}')
            if arch in inputs:
                want = signing_of(os.path.join(inputs[arch], rel), arch)
                if got != want:
                    problems.append(f'{line}; the {arch} input had flags '
                                    f'{hex(want[0]) if want[0] is not None else "?"}, '
                                    f'entitlements {sorted(want[1]) or "none"}')
                    continue
            print(line)
    if problems:
        for line in problems:
            print('error:', line, file=sys.stderr)
        sys.exit(f'{len(problems)} part(s) lost or changed their entitlements or flags')
    if inputs:
        print('every part kept the entitlements and flags of its input build')


if __name__ == '__main__':
    main()
