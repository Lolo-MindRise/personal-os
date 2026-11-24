#!/usr/bin/env bash
# Lists and restores backups of the real instance (ADR-0003, task 0012).
#   scripts/restore.sh                    list local backups, newest first
#   scripts/restore.sh --mirror           list the backups in the mirror
#   scripts/restore.sh <backup file>      restore a local backup (a name from the list, or a path)
#   scripts/restore.sh --mirror <file>    restore a backup from the mirror
# The app must be stopped. The current database is first copied to
# <data dir>/backups/ as a `-before-restore` backup, and the chosen file is
# checked (SQLite integrity) before anything is touched.
# Env: PERSONAL_OS_INSTANCE_ENV (config file).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/common.sh
source "$APP_DIR/scripts/lib/common.sh"

TIME_ZONE="Europe/Andorra"
DB_NAME="personal-os.sqlite"
NAME_RE='^personal-os-([0-9]{8})T([0-9]{2})([0-9]{2})([0-9]{2})[0-9]{3}Z-(startup|daily|pre-migration|before-restore)\.sqlite$'

use_mirror=0
mirror_flag=""
target=""
for arg in "$@"; do
  case "$arg" in
    --mirror) use_mirror=1; mirror_flag=" --mirror" ;;
    -h | --help)
      sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) die "unknown option: $arg (try --help)" ;;
    *)
      [[ -z "$target" ]] || die "only one backup file can be restored at a time."
      target="$arg"
      ;;
  esac
done

load_instance_config

if ((use_mirror)); then
  [[ -n "${PERSONAL_OS_BACKUP_MIRROR_DIR:-}" ]] || die "PERSONAL_OS_BACKUP_MIRROR_DIR is not set in $INSTANCE_ENV."
  SOURCE_DIR="$PERSONAL_OS_BACKUP_MIRROR_DIR"
  SOURCE_LABEL="mirror"
else
  SOURCE_DIR="$PERSONAL_OS_DATA_DIR/backups"
  SOURCE_LABEL="local"
fi
LOCAL_BACKUPS="$PERSONAL_OS_DATA_DIR/backups"
DB_FILE="$PERSONAL_OS_DATA_DIR/$DB_NAME"

# Newest first: the stamp in the name sorts as text in time order.
list_backups() {
  local dir="$1" name
  [[ -d "$dir" ]] || return 0
  while IFS= read -r name; do
    if [[ "$name" =~ $NAME_RE ]]; then echo "$name"; fi
  done < <(ls -1 "$dir" | sort -r)
}

# "personal-os-20261125T030405006Z-startup.sqlite" -> "2026-11-25 04:04" (local time).
local_date() {
  [[ "$1" =~ $NAME_RE ]] || return 1
  local d="${BASH_REMATCH[1]}"
  TZ="$TIME_ZONE" date -d "${d:0:4}-${d:4:2}-${d:6:2} ${BASH_REMATCH[2]}:${BASH_REMATCH[3]}:${BASH_REMATCH[4]} UTC" '+%Y-%m-%d %H:%M'
}

if [[ -z "$target" ]]; then
  [[ -d "$SOURCE_DIR" ]] || die "$SOURCE_LABEL backup folder not found: $SOURCE_DIR"
  found=0
  info "$SOURCE_LABEL backups in $SOURCE_DIR (newest first, times in $TIME_ZONE):"
  while IFS= read -r name; do
    [[ "$name" =~ $NAME_RE ]]
    printf '  %s  %-14s %s\n' "$(local_date "$name")" "${BASH_REMATCH[5]}" "$name"
    found=1
  done < <(list_backups "$SOURCE_DIR")
  ((found)) || info "  (none)"
  info "To restore one: scripts/restore.sh$mirror_flag <file name>"
  exit 0
fi

# --- Restore ---------------------------------------------------------------

if [[ "$target" == */* ]]; then
  backup_file="$target"
else
  backup_file="$SOURCE_DIR/$target"
fi
[[ -f "$backup_file" ]] || die "backup not found: $backup_file (run scripts/restore.sh$mirror_flag to list them)."

ensure_node "$APP_DIR"

# 1. The app must not be running: it holds the database open.
read_app_pid
[[ -z "$APP_PID" ]] || die "the app is running (process $APP_PID). Stop it first with scripts/stop.sh."
if health_ok; then
  die "something answers on port $PORT. Stop the app first with scripts/stop.sh."
fi

# 2. The chosen file must be a healthy database. Nothing has been touched yet.
if ! check_out="$(node "$APP_DIR/scripts/lib/sqlite-tool.mjs" check "$backup_file" 2>&1)"; then
  die "$backup_file is not a valid backup ($check_out). Nothing was changed."
fi

# 3. Stage the copy next to the database (same filesystem, so the swap is a rename).
mkdir -p "$PERSONAL_OS_DATA_DIR" "$LOCAL_BACKUPS"
staged="$DB_FILE.restoring"
trap 'rm -f "$staged"' EXIT
cp -f -- "$backup_file" "$staged"
cmp -s -- "$backup_file" "$staged" || die "could not copy the backup into $PERSONAL_OS_DATA_DIR (disk full?). Nothing was changed."

# 4. Keep what is there now.
if [[ -f "$DB_FILE" ]]; then
  stamp="$(node -e 'console.log(new Date().toISOString().replace(/[-:]/g, "").replace(".", ""))')"
  safety="$LOCAL_BACKUPS/personal-os-${stamp}-before-restore.sqlite"
  if node "$APP_DIR/scripts/lib/sqlite-tool.mjs" snapshot "$DB_FILE" "$safety" >/dev/null 2>&1; then
    info "current database saved as $safety"
  else
    # The current database may be exactly what is broken: keep a raw copy rather than refuse.
    rm -f "$safety"
    cp -f -- "$DB_FILE" "$safety" || die "could not save the current database before replacing it. Nothing was changed."
    info "warning: the current database could not be read as SQLite; a raw copy was saved as $safety"
  fi
else
  info "no current database in $PERSONAL_OS_DATA_DIR; nothing to save first."
fi

# 5. Swap. A leftover -wal/-shm from the old database must not be applied to the restored one.
mv -f -- "$staged" "$DB_FILE"
rm -f -- "$DB_FILE-wal" "$DB_FILE-shm"
trap - EXIT

info "restored $(basename "$backup_file") ($(local_date "$(basename "$backup_file")" || echo 'custom file')) into $DB_FILE"
info "Start the app again with scripts/start.sh. Migrations newer than this backup run on start."
