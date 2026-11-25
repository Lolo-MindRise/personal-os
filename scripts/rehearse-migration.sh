#!/usr/bin/env bash
# Rehearses this build's database migrations on a copy of your newest backup
# (ADR-0003, ADR-0007, plan 0003 task 00).
#   scripts/rehearse-migration.sh           print rows per table before/after, delete the copy
#   scripts/rehearse-migration.sh --keep    same, and keep the copy (its path is printed)
# Exit code is non-zero when a migration fails or a table loses rows.
# It NEVER opens the live database and never writes anywhere but a new
# temporary directory: it reads the newest local backup (a consistent
# snapshot) from <data dir>/backups, copies it there and migrates the copy.
# The app can be running. Run it from the build you are about to deploy.
# Env: PERSONAL_OS_INSTANCE_ENV (config file).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/common.sh
source "$APP_DIR/scripts/lib/common.sh"

keep=0
for arg in "$@"; do
  case "$arg" in
    --keep) keep=1 ;;
    -h | --help)
      sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown option: $arg (try --help)" ;;
  esac
done

load_instance_config
ensure_node "$APP_DIR"

BACKUPS_DIR="$PERSONAL_OS_DATA_DIR/backups"
[[ -d "$BACKUPS_DIR" ]] || die "no backup folder found: $BACKUPS_DIR. Start the app once so it takes a backup."
newest="$(list_backups "$BACKUPS_DIR" | head -n 1)"
[[ -n "$newest" ]] || die "no backup found in $BACKUPS_DIR. Start the app once so it takes a backup, then try again."
backup_file="$BACKUPS_DIR/$newest"

MIGRATIONS_DIR="$APP_DIR/drizzle"
[[ -f "$MIGRATIONS_DIR/meta/_journal.json" ]] || die "no migrations folder in this build: $MIGRATIONS_DIR."

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/personal-os-rehearsal.XXXXXX")"
cleanup() {
  if ((keep)); then
    info "the copy was kept: $work_dir/rehearsal.sqlite"
  else
    rm -rf -- "$work_dir"
  fi
}
trap cleanup EXIT

# The original backup is only ever read by cp and cmp. Everything else (integrity
# check, migration) runs on the copy, so SQLite never creates -wal/-shm next to it.
copy="$work_dir/rehearsal.sqlite"
cp -- "$backup_file" "$copy"
cmp -s -- "$backup_file" "$copy" || die "the copy of $newest differs from the original. Nothing was changed."

if ! check_out="$(node "$APP_DIR/scripts/lib/sqlite-tool.mjs" check "$copy" 2>&1)"; then
  die "$newest is not a valid backup ($check_out). Nothing was changed."
fi

info "rehearsing the migrations of this build on a copy of $newest"
echo
status=0
node "$APP_DIR/scripts/lib/rehearse-tool.mjs" "$copy" "$MIGRATIONS_DIR" || status=$?
echo
if ((status == 0)); then
  info "OK: the migrations ran on the copy and no table lost rows."
else
  info "FAILED: do not deploy this build (see above). Your real data was not touched."
fi
exit "$status"
