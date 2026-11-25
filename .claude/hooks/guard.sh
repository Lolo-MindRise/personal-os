#!/usr/bin/env bash
# PreToolUse guard for the autonomous development system (ADR-0001, ADR-0008).
# Generic: everything project-specific lives in .claude/guard.conf.
# Receives the tool call as JSON on stdin. Exit code 2 blocks the call.
# No jq dependency on purpose: it must work in any environment.
# Agents must never edit this file, its configuration or the permission settings.

input="$(cat)"

block() {
  echo "Blocked by .claude/hooks/guard.sh: $1. Do not work around this; report it in the PR or handoff." >&2
  exit 2
}

tool="$(grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' <<<"$input" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"

# Project configuration. A missing or invalid file falls back to the most
# restrictive settings: supervised mode, default branch "main".
proj="${CLAUDE_PROJECT_DIR:-.}"
AUTONOMY=supervised
DEFAULT_BRANCH=main
PROTECTED_PATHS=''
PROTECTED_COMMANDS=''
if [[ -f "$proj/.claude/guard.conf" ]]; then
  while IFS='=' read -r key value; do
    key="${key//[[:space:]]/}"
    [[ -z "$key" || "$key" == \#* ]] && continue
    value="$(sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' <<<"$value")"
    case "$key" in
      AUTONOMY) AUTONOMY="$value" ;;
      DEFAULT_BRANCH) DEFAULT_BRANCH="$value" ;;
      PROTECTED_PATHS) PROTECTED_PATHS="$value" ;;
      PROTECTED_COMMANDS) PROTECTED_COMMANDS="$value" ;;
    esac
  done < "$proj/.claude/guard.conf"
fi
case "$AUTONOMY" in branches|supervised) ;; *) AUTONOMY=supervised ;; esac
[[ "$DEFAULT_BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || DEFAULT_BRANCH=main

# The directory the command runs in (a subagent may work in its own worktree,
# on a different branch than the main checkout).
cwd="$(grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' <<<"$input" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
[[ -d "$cwd" ]] || cwd="$proj"
current_branch() { git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null; }

# Protected agent configuration: permissions, this hook, its configuration and the subagents.
protected='\.claude/(settings[^/"]*\.json|hooks/|agents/|guard\.conf)'

if [[ "$tool" == "Bash" ]]; then
  target="$input"

  # Commands that operate on real instances through their own configuration,
  # so no protected path appears in the command text (PROTECTED_COMMANDS).
  if [[ -n "$PROTECTED_COMMANDS" ]]; then
    grep -Eq "$PROTECTED_COMMANDS" <<<"$target" \
      && block "this command operates on a real instance; test it through the test suite with temporary directories"
  fi

  # Merging is reserved to Manuel (ADR-0001).
  grep -Eq 'gh[[:space:]]+pr[[:space:]]+merge' <<<"$target" && block "merging pull requests is reserved to Manuel"
  grep -Eq 'pulls/[0-9]+/merge' <<<"$target" && block "merging pull requests is reserved to Manuel"

  # Closing, reopening or approving PRs is reserved to Manuel.
  grep -Eq 'gh[[:space:]]+pr[[:space:]]+(close|reopen|review)' <<<"$target" \
    && block "closing, reopening or reviewing pull requests is reserved to Manuel"

  # The GitHub API is read-only for agents: no write methods, no fields
  # (gh api switches to POST when fields or input are given).
  if grep -Eq 'gh[[:space:]]+api' <<<"$target"; then
    grep -Eq 'gh[[:space:]]+api[^;&|]*(-X|--method)[[:space:]=]*(POST|PATCH|PUT|DELETE)' <<<"$target" \
      && block "the GitHub API is read-only for agents"
    grep -Eq 'gh[[:space:]]+api[^;&|]*[[:space:]](-f|-F|--field|--raw-field|--input)([[:space:]=]|$)' <<<"$target" \
      && block "the GitHub API is read-only for agents"
    grep -Eq 'gh[[:space:]]+api[[:space:]]+graphql' <<<"$target" \
      && block "the GitHub API is read-only for agents"
  fi

  # Repository protection and visibility are reserved to Manuel (ADR-0001).
  grep -Eq 'rulesets|branches/[^[:space:]]*/protection|--visibility' <<<"$target" \
    && block "changing repository rules or visibility is reserved to Manuel"

  # No pushes to main and no force pushes (ADR-0001).
  grep -Eq "git[[:space:]]+push[^;&|]*([[:space:]]|:)${DEFAULT_BRANCH}([[:space:]]|\"|\$)" <<<"$target" \
    && block "pushing to ${DEFAULT_BRANCH} is not allowed"

  # Supervised mode: agents leave their changes uncommitted for Manuel.
  if [[ "$AUTONOMY" == supervised ]]; then
    grep -Eq '(^|[^[:alnum:]_-])git[[:space:]]+(commit|push)([[:space:]]|"|$)' <<<"$target" \
      && block "this project runs in supervised mode: leave your changes uncommitted for Manuel to review"
    grep -Eq 'gh[[:space:]]+pr[[:space:]]+create' <<<"$target" \
      && block "this project runs in supervised mode: Manuel opens the pull requests"
  fi

  # Never commit or merge on the default branch: without server-side rules
  # nothing else stops it (ADR-0008). Merging into integration branches is
  # allowed (ADR-0009).
  if grep -Eq '(^|[^[:alnum:]_-])git[[:space:]]+(commit|merge|cherry-pick|revert)([[:space:]]|"|$)' <<<"$target"; then
    [[ "$(current_branch)" == "$DEFAULT_BRANCH" ]] \
      && block "you are on ${DEFAULT_BRANCH}: only Manuel changes it; work on your own or the integration branch"
  fi
  grep -Eq 'git[[:space:]]+push[^;&|]*(--force|[[:space:]]-f([[:space:]]|"|$))' <<<"$target" && block "force pushes are not allowed"

  # Files are written with the file tools (Write, Edit), never from the shell.
  # Scratch output under /tmp and /dev/null is allowed.
  grep -Eq '(^|[^[:alnum:]_])sed[[:space:]]+(-[[:alnum:]]*i|--in-place)' <<<"$target" \
    && block "edit files with the file tools (Edit), not sed -i"
  grep -Eq '(^|[^[:alnum:]_])(perl|ruby)[[:space:]]+-[[:alnum:]]*i' <<<"$target" \
    && block "edit files with the file tools (Edit), not in-place perl or ruby"
  grep -Eq '(write_text|write_bytes|writeFileSync|writeFile\(|appendFileSync|createWriteStream|open\([^)]*,[[:space:]]*\\?['"'"'"][wax])' <<<"$target" \
    && block "write files with the file tools (Write, Edit), not from a script"
  while read -r dest; do
    [[ -z "$dest" ]] && continue
    case "$dest" in
      /dev/null|/dev/stdout|/dev/stderr|/tmp/*) ;;
      *) block "write files with the file tools (Write, Edit), not with shell redirection or tee" ;;
    esac
  done < <(
    grep -oE '(^|[[:space:];&|(])([0-9]?>>?|&>)[[:space:]]*(\\?")?[^[:space:]&|;<>()"\\}]+' <<<"$target" \
      | sed -E 's/^[[:space:];&|(]*([0-9]?>>?|&>)[[:space:]]*(\\?")?//'
    grep -oE '(^|[^[:alnum:]_])tee[[:space:]]+(-a[[:space:]]+)?(\\?")?[^[:space:]&|;<>()"\\}]+' <<<"$target" \
      | sed -E 's/.*tee[[:space:]]+(-a[[:space:]]+)?(\\?")?//'
  )

  # No shell writes to the protected agent configuration.
  if grep -Eq "$protected" <<<"$target"; then
    grep -Eq '(>|tee|sed[[:space:]]+-i|perl[[:space:]]+-pi|(^|[[:space:]";&|])(mv|cp|rm|chmod|truncate|ln)[[:space:]]|git[[:space:]]+(checkout|restore|rm|mv)[[:space:]])' <<<"$target" \
      && block "agents may not modify permission settings, the guard hook or the subagents"
  fi
else
  target="$(grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' <<<"$input" | head -1)"

  # No file-tool edits to the protected agent configuration.
  if [[ "$tool" =~ ^(Edit|Write|MultiEdit|NotebookEdit)$ ]] && grep -Eq "$protected" <<<"$target"; then
    block "agents may not modify permission settings, the guard hook or the subagents"
  fi
fi

# Real instances, real data and backups are off limits (PROTECTED_PATHS).
if [[ -n "$PROTECTED_PATHS" ]]; then
  grep -Eq "$PROTECTED_PATHS" <<<"$target" \
    && block "real instances, real data and backups are off limits"
fi

exit 0
