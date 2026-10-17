#!/bin/bash
# Installs Carriage on this Mac: downloads its disk image, checks its SHA-256,
# replaces any older Carriage in /Applications (the old one goes to the Trash,
# the profile stays where it is) and opens it.
#
#   install-carriage.sh [TAG]       a published release (waits until it is out)
#   install-carriage.sh --run ID    the disk image of a finished Actions run, for
#                                   example a universal.yml merge (needs gh)
#   add --night-train               to give it the railway night-train start
#                                   page (ntp_night_train_patch.py), signed again
#
# Either way it takes the universal app (Apple silicon and Intel) when there is
# one, else the Apple silicon one. It never quits a Carriage that is open: it
# asks you to quit it and installs then.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
NIGHT_TRAIN=false
args=()
for a in "$@"; do
  if [ "$a" = --night-train ]; then NIGHT_TRAIN=true; else args+=("$a"); fi
done
set -- ${args[@]+"${args[@]}"}

REPO="Vizir-bit/carriage"
ARCHS="universal arm64"
name() { echo "carriage_0.19.2.1_$1-macos.dmg"; }
tmp="$(mktemp -d)"

if [ "${1:-}" = --run ]; then
  RUN="${2:?usage: install-carriage.sh --run RUN_ID}"
  case "$RUN" in
    *[!0-9]*)
      echo "\"$RUN\" is not a run number. Use the number of a universal.yml run that finished"
      echo "with a tick (✓); this lists them:  gh run list --workflow=universal.yml"
      exit 1;;
  esac
  echo "Carriage installer — Actions run $RUN"
  DMG=""
  for arch in $ARCHS; do
    if gh run download "$RUN" --repo "$REPO" -n "$(name "$arch")" -D "$tmp/artifact" >/dev/null 2>&1; then
      DMG="$(name "$arch")"; break
    fi
  done
  if [ -z "$DMG" ]; then
    echo "Run $RUN holds no Carriage disk image (has it finished successfully?)."; exit 1
  fi
  mv "$tmp/artifact/release_asset/$DMG" "$tmp/$DMG"
  mv "$tmp/artifact/$DMG.hashes.md" "$tmp/hashes.md"
  FROM="run $RUN"
else
  TAG="${1:-v0.19.2.1-carriage.2}"
  BASE="https://github.com/$REPO/releases/download/$TAG"
  echo "Carriage installer — release $TAG"
  # Keep the Mac awake while this window waits.
  caffeinate -i -w $$ &
  pick() {
    for arch in $ARCHS; do
      if curl -fsIL "$BASE/$(name "$arch")" >/dev/null 2>&1; then DMG="$(name "$arch")"; return 0; fi
    done
    return 1
  }
  if ! pick; then
    echo "Waiting for $TAG to be published (checking every 10 minutes; leave this window open)."
    until pick; do printf '.'; sleep 600; done
    echo
  fi
  echo "Downloading $DMG…"
  curl -fL --progress-bar -o "$tmp/$DMG" "$BASE/$DMG"
  curl -fsL -o "$tmp/hashes.md" "$BASE/$DMG.hashes.md"
  FROM="release $TAG"
fi
want="$(grep -o 'sha256: [0-9a-f]*' "$tmp/hashes.md" | awk '{print $2}')"
got="$(shasum -a 256 "$tmp/$DMG" | awk '{print $1}')"
if [ -z "$want" ] || [ "$want" != "$got" ]; then
  echo "Checksum mismatch — not installing."; exit 1
fi
echo "Checksum OK ($got)."

mnt="$(mktemp -d /tmp/carriage.XXXXXX)"
hdiutil attach -nobrowse -readonly -mountpoint "$mnt" "$tmp/$DMG" >/dev/null
ditto "$mnt/Carriage.app" "$tmp/Carriage.app"
hdiutil detach "$mnt" >/dev/null || true
if $NIGHT_TRAIN; then
  echo "Giving it the railway night-train start page…"
  python3 "$here/ntp_night_train_patch.py" \
    "$tmp/Carriage.app/Contents/Frameworks/Carriage Framework.framework/Versions/Current/Resources/resources.pak"
  python3 "$here/sign_adhoc.py" "$tmp/Carriage.app"
fi
codesign --verify --deep --strict "$tmp/Carriage.app"

if pgrep -f "/Applications/Carriage.app/Contents/MacOS/Carriage" >/dev/null 2>&1; then
  echo "Carriage is open: quit it (Carriage > Quit) and the installation will go on."
  osascript -e 'display notification "Quit Carriage to finish installing the new one." with title "Carriage"' >/dev/null 2>&1 || true
  while pgrep -f "/Applications/Carriage.app/Contents/MacOS/Carriage" >/dev/null 2>&1; do sleep 5; done
fi

if [ -d /Applications/Carriage.app ]; then
  echo "Moving the previous Carriage to the Trash…"
  mv /Applications/Carriage.app "$HOME/.Trash/Carriage (previous $(date +%Y%m%d-%H%M%S)).app" 2>/dev/null \
    || osascript -e 'tell application "Finder" to delete (POSIX file "/Applications/Carriage.app" as alias)' >/dev/null 2>&1 \
    || sudo mv /Applications/Carriage.app "$HOME/.Trash/Carriage (previous $(date +%Y%m%d-%H%M%S)).app"
fi

echo "Installing into /Applications…"
ditto "$tmp/Carriage.app" /Applications/Carriage.app 2>/dev/null \
  || sudo ditto "$tmp/Carriage.app" /Applications/Carriage.app
xattr -dr com.apple.quarantine /Applications/Carriage.app 2>/dev/null \
  || sudo xattr -dr com.apple.quarantine /Applications/Carriage.app 2>/dev/null || true
rm -rf "$tmp"

echo "Opening Carriage…"
open /Applications/Carriage.app
echo "Done. Carriage from $FROM ($DMG) is installed."
