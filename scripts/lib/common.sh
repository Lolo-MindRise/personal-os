#!/usr/bin/env bash
# Shared helpers for start.sh, stop.sh and deploy-local.sh. Meant to be sourced.
# Nothing here knows a real path: everything comes from the instance config.

die() {
  echo "personal-os: $*" >&2
  exit 1
}

info() {
  echo "personal-os: $*"
}

# Loads the instance config (see config/instance.env.example) and checks it.
# Sets: INSTANCE_ENV, PERSONAL_OS_DATA_DIR, PORT, PID_FILE, LOG_DIR, LOG_FILE.
load_instance_config() {
  INSTANCE_ENV="${PERSONAL_OS_INSTANCE_ENV:-$HOME/.config/personal-os/instance.env}"
  [[ -f "$INSTANCE_ENV" ]] || die "config file not found: $INSTANCE_ENV. Create it from config/instance.env.example (see README, \"Run your real instance\")."
  set -a
  # shellcheck disable=SC1090
  source "$INSTANCE_ENV" || die "could not read $INSTANCE_ENV"
  set +a
  [[ -n "${PERSONAL_OS_DATA_DIR:-}" ]] || die "PERSONAL_OS_DATA_DIR is not set in $INSTANCE_ENV."
  PORT="${PORT:-5310}"
  [[ "$PORT" =~ ^[0-9]+$ ]] || die "PORT in $INSTANCE_ENV must be a number, got \"$PORT\"."
  PID_FILE="$PERSONAL_OS_DATA_DIR/app.pid"
  LOG_DIR="$PERSONAL_OS_DATA_DIR/logs"
  LOG_FILE="$LOG_DIR/app.log"
}

# Backup file names: personal-os-<UTC stamp>-<type>.sqlite (see backups.ts).
BACKUP_NAME_RE='^personal-os-([0-9]{8})T([0-9]{2})([0-9]{2})([0-9]{2})[0-9]{3}Z-(startup|daily|pre-migration|before-restore)\.sqlite$'

# Prints the backup file names in directory $1, newest first (the stamp in the
# name sorts as text in time order). Other files are ignored.
list_backups() {
  local dir="$1" name
  [[ -d "$dir" ]] || return 0
  while IFS= read -r name; do
    if [[ "$name" =~ $BACKUP_NAME_RE ]]; then echo "$name"; fi
  done < <(ls -1 "$dir" | LC_ALL=C sort -r)
}

# Makes `node` available. A login shell started from Windows may not have it:
# Node comes from fnm, so initialise fnm when it is installed. $1 = directory
# whose .nvmrc selects the version (optional).
ensure_node() {
  if command -v node >/dev/null 2>&1; then
    return 0
  fi
  local fnm_bin=""
  if command -v fnm >/dev/null 2>&1; then
    fnm_bin="$(command -v fnm)"
  else
    local dir
    for dir in "${FNM_PATH:-}" "$HOME/.local/share/fnm" "$HOME/.fnm"; do
      if [[ -n "$dir" && -x "$dir/fnm" ]]; then
        PATH="$dir:$PATH"
        fnm_bin="$dir/fnm"
        break
      fi
    done
  fi
  [[ -n "$fnm_bin" ]] || die "node was not found on PATH and fnm is not installed. Install Node (README, Requirements) or add it to PATH."
  eval "$("$fnm_bin" env --shell bash)" || die "could not initialise fnm."
  if ! command -v node >/dev/null 2>&1 && [[ -n "${1:-}" && -d "$1" ]]; then
    local install=()
    [[ "${FNM_INSTALL:-}" == "1" ]] && install=(--install-if-missing)
    # Runs in this shell (not a subshell): `fnm use` edits this shell's PATH.
    pushd "$1" >/dev/null || true
    "$fnm_bin" use "${install[@]}" >/dev/null 2>&1 || true
    popd >/dev/null || true
  fi
  command -v node >/dev/null 2>&1 || die "fnm is installed but has no Node version available. Run \`fnm install\` in the app directory."
}

# True when the app answers /api/health with {"status":"ok"} on $PORT.
health_ok() {
  node -e '
    const url = `http://127.0.0.1:${process.argv[1]}/api/health`;
    fetch(url, { signal: AbortSignal.timeout(2000) })
      .then((r) => r.json())
      .then((b) => process.exit(b && b.status === "ok" ? 0 : 1))
      .catch(() => process.exit(1));
  ' "$PORT" >/dev/null 2>&1
}

# True when $1 is a live process that looks like our server (guards against a
# recycled PID after a reboot).
pid_is_app() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  if [[ -r "/proc/$pid/cmdline" ]]; then
    tr '\0' ' ' <"/proc/$pid/cmdline" | grep -q 'dist/server/index.js' || return 1
  fi
  return 0
}

# Sets APP_PID to the PID in the PID file when it names a live app process,
# otherwise to "". Sets PID_STALE=1 when a file exists but names no live app.
# (Sets variables instead of printing: a $(...) subshell would lose PID_STALE.)
read_app_pid() {
  APP_PID=""
  PID_STALE=0
  [[ -f "$PID_FILE" ]] || return 0
  local pid
  pid="$(tr -d '[:space:]' <"$PID_FILE")"
  if pid_is_app "$pid"; then
    APP_PID="$pid"
  else
    PID_STALE=1
  fi
}
