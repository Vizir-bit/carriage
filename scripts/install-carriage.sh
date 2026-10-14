#!/bin/bash
# Installs a Carriage release on this Mac: waits until it is published,
# downloads it, checks its SHA-256, replaces any older Carriage in
# /Applications (the old one goes to the Trash) and opens it.
set -euo pipefail

TAG="${1:-v0.19.2.1-carriage.2}"
REPO="Vizir-bit/carriage"
DMG="carriage_0.19.2.1_arm64-macos.dmg"
BASE="https://github.com/$REPO/releases/download/$TAG"

echo "Carriage installer — release $TAG"
# Keep the Mac awake while this window waits.
caffeinate -i -w $$ &

if ! curl -fsIL "$BASE/$DMG" >/dev/null 2>&1; then
  echo "Waiting for $TAG to be published (checking every 10 minutes; leave this window open)."
  until curl -fsIL "$BASE/$DMG" >/dev/null 2>&1; do
    printf '.'; sleep 600
  done
  echo
fi

tmp="$(mktemp -d)"
echo "Downloading…"
curl -fL --progress-bar -o "$tmp/$DMG" "$BASE/$DMG"
curl -fsL -o "$tmp/hashes.md" "$BASE/$DMG.hashes.md"
want="$(grep -o 'sha256: [0-9a-f]*' "$tmp/hashes.md" | awk '{print $2}')"
got="$(shasum -a 256 "$tmp/$DMG" | awk '{print $1}')"
if [ -z "$want" ] || [ "$want" != "$got" ]; then
  echo "Checksum mismatch — not installing."; exit 1
fi
echo "Checksum OK ($got)."

osascript -e 'tell application "Carriage" to quit' >/dev/null 2>&1 || true
sleep 2

mnt="$(mktemp -d /tmp/carriage.XXXXXX)"
hdiutil attach -nobrowse -readonly -mountpoint "$mnt" "$tmp/$DMG" >/dev/null

if [ -d /Applications/Carriage.app ]; then
  echo "Moving the previous Carriage to the Trash…"
  osascript -e 'tell application "Finder" to delete (POSIX file "/Applications/Carriage.app" as alias)' >/dev/null 2>&1 \
    || sudo mv /Applications/Carriage.app "$HOME/.Trash/Carriage (previous).app"
fi

echo "Installing into /Applications…"
ditto "$mnt/Carriage.app" /Applications/Carriage.app 2>/dev/null \
  || sudo ditto "$mnt/Carriage.app" /Applications/Carriage.app
hdiutil detach "$mnt" >/dev/null || true
xattr -dr com.apple.quarantine /Applications/Carriage.app 2>/dev/null \
  || sudo xattr -dr com.apple.quarantine /Applications/Carriage.app 2>/dev/null || true
rm -rf "$tmp"

echo "Opening Carriage…"
open /Applications/Carriage.app
echo "Done. Carriage $TAG is installed."
