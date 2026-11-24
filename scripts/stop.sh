#!/usr/bin/env bash
# Stops the real instance using its PID file: SIGTERM, then wait for the app to
# finish (it closes the database and any backup in flight). Never sends SIGKILL.
# Env: PERSONAL_OS_INSTANCE_ENV, PERSONAL_OS_STOP_TIMEOUT (seconds, default 30).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/common.sh
source "$APP_DIR/scripts/lib/common.sh"

TIMEOUT="${PERSONAL_OS_STOP_TIMEOUT:-30}"

load_instance_config

read_app_pid
pid="$APP_PID"
if [[ -z "$pid" ]]; then
  if [[ "$PID_STALE" == "1" ]]; then
    info "removing stale PID file $PID_FILE"
    rm -f "$PID_FILE"
  fi
  if command -v node >/dev/null 2>&1 && health_ok; then
    die "no live PID file, but something still answers on port $PORT (started another way?). Stop that process yourself."
  fi
  info "not running"
  exit 0
fi

info "stopping process $pid"
kill -TERM "$pid" 2>/dev/null || true
for ((waited = 0; waited < TIMEOUT; waited++)); do
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$PID_FILE"
    info "stopped"
    exit 0
  fi
  sleep 1
done
die "process $pid did not stop within ${TIMEOUT}s (a backup may be running). Wait and run stop.sh again; only use kill -9 as a last resort."
