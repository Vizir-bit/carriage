#!/usr/bin/env bash
# Repackage an existing supported Carriage binary; no browser profile is copied.
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
input_app="${1:?Usage: package-night-train.sh /path/to/Carriage.app /path/to/output.dmg}"
output_dmg="${2:?An output DMG path is required}"
[ ! -e "$output_dmg" ] || { echo 'Output already exists' >&2; exit 1; }
[ -f "$input_app/Contents/Info.plist" ] || { echo 'Input is not an app bundle' >&2; exit 1; }
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$input_app/Contents/Info.plist")" = app.carriage.browser ] || { echo 'Input is not Carriage' >&2; exit 1; }
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/carriage-package.XXXXXX")"
trap 'rm -rf "$staging_dir"' EXIT
mkdir "$staging_dir/image"
app_copy="$staging_dir/image/Carriage.app"
ditto "$input_app" "$app_copy"
python3 "$script_dir/ntp_night_train_patch.py" "$app_copy/Contents/Frameworks/Carriage Framework.framework/Versions/Current/Resources/resources.pak"
# These .new files are leftovers from earlier local builds, never runtime inputs.
rm -f "$app_copy/Contents/Resources/Assets.car.new" "$app_copy/Contents/Resources/app.icns.new" "$app_copy/Contents/Frameworks/Carriage Framework.framework/Versions/Current/Resources/resources.pak.new"
xattr -dr com.apple.FinderInfo "$app_copy" 2>/dev/null || true
codesign --force --deep --sign - "$app_copy"
codesign --verify --deep --strict "$app_copy"
ln -s /Applications "$staging_dir/image/Applications"
printf '%s\n' 'Quit Carriage, then drag Carriage.app onto Applications.' 'Apple Silicon; macOS 13+; ad-hoc signed, not Apple notarized.' > "$staging_dir/image/Install.txt"
hdiutil create -volname 'Carriage Night Train' -srcfolder "$staging_dir/image" -format UDZO "$output_dmg"
hdiutil verify "$output_dmg"
