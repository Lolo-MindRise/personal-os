#!/usr/bin/env bash
# Starts the real instance in production mode, detached (ADR-0003).
#   scripts/start.sh          start (or report that it is already up)
#   scripts/start.sh --port   print the configured port and exit
# Env: PERSONAL_OS_INSTANCE_ENV (config file), PERSONAL_OS_START_TIMEOUT (seconds, default 30).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/common.sh
source "$APP_DIR/scripts/lib/common.sh"

LOG_MAX_BYTES=$((5 * 1024 * 1024))
LOG_KEEP=3
TIMEOUT="${PERSONAL_OS_START_TIMEOUT:-30}"

load_instance_config

if [[ "${1:-}" == "--port" ]]; then
  echo "$PORT"
  exit 0
fi

ensure_node "$APP_DIR"

if health_ok; then
  info "already running on http://localhost:$PORT"
  exit 0
fi

read_app_pid
pid="$APP_PID"
if [[ -n "$pid" ]]; then
  die "process $pid is running but does not answer on port $PORT. See $LOG_FILE, then run scripts/stop.sh."
fi
if [[ "$PID_STALE" == "1" ]]; then
  info "removing stale PID file $PID_FILE"
  rm -f "$PID_FILE"
fi

[[ -f "$APP_DIR/dist/server/index.js" ]] || die "no build found in $APP_DIR/dist. Run scripts/deploy-local.sh (or npm run build)."

mkdir -p "$LOG_DIR"

# Rotation: app.log -> app.log.1 -> app.log.2 -> app.log.3 (oldest dropped).
if [[ -f "$LOG_FILE" ]] && (($(stat -c %s "$LOG_FILE") > LOG_MAX_BYTES)); then
  for ((i = LOG_KEEP - 1; i >= 1; i--)); do
    [[ -f "$LOG_FILE.$i" ]] && mv -f "$LOG_FILE.$i" "$LOG_FILE.$((i + 1))"
  done
  mv -f "$LOG_FILE" "$LOG_FILE.1"
fi

# The inner shell records its own PID and then becomes node, so the PID file
# names the server itself. setsid detaches it from this terminal / WSL session.
detach=()
command -v setsid >/dev/null 2>&1 && detach=(setsid)
cd "$APP_DIR"
NODE_ENV=production PORT="$PORT" PERSONAL_OS_DATA_DIR="$PERSONAL_OS_DATA_DIR" \
  "${detach[@]}" bash -c 'echo $$ > "$1"; exec node dist/server/index.js' _ "$PID_FILE" \
  >>"$LOG_FILE" 2>&1 </dev/null &
disown

info "starting (log: $LOG_FILE)"
for ((waited = 0; waited < TIMEOUT; waited++)); do
  if health_ok; then
    info "up on http://localhost:$PORT"
    exit 0
  fi
  pid="$(tr -d '[:space:]' <"$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$PID_FILE"
    die "the app exited during start. See the end of $LOG_FILE."
  fi
  sleep 1
done
die "the app did not answer /api/health within ${TIMEOUT}s. See $LOG_FILE. If it is still starting, wait and run start.sh again; otherwise run scripts/stop.sh."
