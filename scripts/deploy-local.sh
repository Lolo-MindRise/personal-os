#!/usr/bin/env bash
# Builds the real instance from `main` (ADR-0003). Run it after merging a PR.
# It never runs migrations: the app migrates on start, after its own backup.
# Env:
#   PERSONAL_OS_APP_DIR       instance directory (default: ~/apps/personal-os, see README)
#   PERSONAL_OS_REPO_URL      repository to clone on the first run
#   PERSONAL_OS_INSTANCE_ENV  config file, used only to detect a running app
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

DEPLOY_DIR="${PERSONAL_OS_APP_DIR:-$HOME/apps/personal-os}"
REPO_URL="${PERSONAL_OS_REPO_URL:-https://github.com/Lolo-MindRise/personal-os.git}"

step() {
  local name="$1"
  shift
  info "$name"
  "$@" || die "step failed: $name. Nothing else was changed after it."
}

# 1. Refuse while the app runs (it would be serving files we are replacing).
if [[ -f "${PERSONAL_OS_INSTANCE_ENV:-$HOME/.config/personal-os/instance.env}" ]]; then
  load_instance_config
  if { read_app_pid; [[ -n "$APP_PID" ]]; } || { command -v node >/dev/null 2>&1 && health_ok; }; then
    die "the app is running. Stop it first with its stop shortcut or scripts/stop.sh."
  fi
else
  info "no instance config yet, so I cannot check whether the app is running (it cannot be, if you never started it)."
fi

# 2. Get the code.
if [[ ! -e "$DEPLOY_DIR" ]] || [[ -d "$DEPLOY_DIR" && -z "$(ls -A "$DEPLOY_DIR")" ]]; then
  mkdir -p "$(dirname "$DEPLOY_DIR")"
  step "cloning main into $DEPLOY_DIR" git clone --quiet --branch main "$REPO_URL" "$DEPLOY_DIR"
else
  [[ -d "$DEPLOY_DIR/.git" ]] || die "$DEPLOY_DIR exists and is not a git checkout. Move it away or choose another PERSONAL_OS_APP_DIR."
  cd "$DEPLOY_DIR"
  branch="$(git rev-parse --abbrev-ref HEAD)"
  [[ "$branch" == "main" ]] || die "the instance is on branch \"$branch\", expected main. Fix it by hand."
  [[ -z "$(git status --porcelain)" ]] || die "the instance directory has local changes. The instance must stay a pristine copy of main; inspect with: git -C $DEPLOY_DIR status"
  step "fetching origin" git fetch --quiet origin main
  step "fast-forwarding to origin/main" git merge --ff-only --quiet origin/main
fi
cd "$DEPLOY_DIR"

# 3. Build.
FNM_INSTALL=1 ensure_node "$DEPLOY_DIR"
step "npm ci" npm ci
step "npm run build" npm run build

info "done at $(git rev-parse --short HEAD). Start it with scripts/start.sh; it migrates (after a backup) on start."
