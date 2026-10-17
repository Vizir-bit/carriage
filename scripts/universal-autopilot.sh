#!/bin/bash
# Universal Carriage, unattended: waits for an Intel build to finish, joins it
# with an Apple silicon build into one universal app (universal.yml, started
# once), waits for that, then installs the result on this Mac with
# install-carriage.sh. Stops, without merging or installing, at the first
# thing that is not right, and says why.
#
#   universal-autopilot.sh ARM64_RUN INTEL_RUN
#
# Leave its Terminal window open (it keeps the Mac awake). If Carriage is open
# when the universal app is ready, it asks you to quit it and installs then;
# it never quits Carriage by surprise. Needs gh, signed in.
set -euo pipefail

ARM_RUN="${1:?usage: universal-autopilot.sh ARM64_RUN INTEL_RUN}"
X86_RUN="${2:?usage: universal-autopilot.sh ARM64_RUN INTEL_RUN}"
REPO="Vizir-bit/carriage"
BRANCH="essex/codex-improvements-debug-eecb34"
X86_DMG="carriage_0.19.2.1_x86_64-macos.dmg"
POLL="${POLL:-900}"   # seconds between checks while waiting for a build
here="$(cd "$(dirname "$0")" && pwd)"

log() { echo "$(date '+%Y-%m-%d %H:%M') $*"; }
notify() { osascript -e "display notification \"$1\" with title \"Carriage\"" >/dev/null 2>&1 || true; }
stop() { log "STOPPED: $*"; notify "Universal Carriage stopped: $*"; exit 1; }

caffeinate -i -w $$ &

# 1. The Intel build must finish and leave its disk image.
log "Waiting for the Intel build, run $X86_RUN (checking every $((POLL / 60)) minutes)."
while :; do
  status="$(gh run view "$X86_RUN" --repo "$REPO" --json status --jq .status 2>/dev/null || echo unknown)"
  [ "$status" = completed ] && break
  log "Intel build: $status"
  sleep "$POLL"
done
conclusion="$(gh run view "$X86_RUN" --repo "$REPO" --json conclusion --jq .conclusion)"
if ! gh api "repos/$REPO/actions/runs/$X86_RUN/artifacts" --paginate --jq '.artifacts[].name' \
     | grep -qx "$X86_DMG"; then
  stop "the Intel build finished ($conclusion) without $X86_DMG; it may need a resume. Nothing merged or installed."
fi
log "Intel build finished ($conclusion) with $X86_DMG."

# 2. Start the merge once, and wait for it.
latest() {
  gh run list --repo "$REPO" --workflow universal.yml --branch "$BRANCH" \
    --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId // 0'
}
before="$(latest)"
gh workflow run universal.yml --repo "$REPO" --ref "$BRANCH" \
  -f run_id="$ARM_RUN" -f x86_64_run_id="$X86_RUN"
run="$before"
for _ in $(seq 1 60); do
  sleep 10
  run="$(latest)"
  [ "$run" != "$before" ] && break
done
[ "$run" != "$before" ] || stop "the merge did not appear on GitHub after 10 minutes."
log "Merge started: run $run (https://github.com/$REPO/actions/runs/$run)"
if ! gh run watch "$run" --repo "$REPO" --exit-status --interval 60 >/dev/null; then
  stop "the merge, run $run, failed (gh run view $run --log-failed). Nothing installed."
fi
log "Merge finished: universal Carriage built in run $run."

# 3. Install, with the railway night-train page (as the Carriage it replaces),
# without quitting a Carriage that is in use: the installer waits for you.
notify "Universal Carriage is ready; it installs when Carriage is closed."
bash "$here/install-carriage.sh" --run "$run" --night-train
log "Done: universal Carriage from run $run is installed."
notify "Universal Carriage is installed."
