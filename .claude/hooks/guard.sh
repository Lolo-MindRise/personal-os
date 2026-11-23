#!/usr/bin/env bash
# PreToolUse guard for personal-os (ADR-0001, ADR-0003).
# Receives the tool call as JSON on stdin. Exit code 2 blocks the call.
# No jq dependency on purpose: it must work in any environment.

input="$(cat)"

block() {
  echo "Blocked by .claude/hooks/guard.sh: $1. Do not work around this; report it in the PR or handoff." >&2
  exit 2
}

tool="$(grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' <<<"$input" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"

if [[ "$tool" == "Bash" ]]; then
  target="$input"

  # Merging is reserved to Manuel (ADR-0001).
  grep -Eq 'gh[[:space:]]+pr[[:space:]]+merge' <<<"$target" && block "merging pull requests is reserved to Manuel"
  grep -Eq 'pulls/[0-9]+/merge' <<<"$target" && block "merging pull requests is reserved to Manuel"

  # Repository protection and visibility are reserved to Manuel (ADR-0001).
  grep -Eq 'rulesets|branches/[^[:space:]]*/protection|--visibility' <<<"$target" \
    && block "changing repository rules or visibility is reserved to Manuel"

  # No pushes to main and no force pushes (ADR-0001).
  grep -Eq 'git[[:space:]]+push[^;&|]*([[:space:]]|:)main([[:space:]]|"|$)' <<<"$target" && block "pushing to main is not allowed"
  grep -Eq 'git[[:space:]]+push[^;&|]*(--force|[[:space:]]-f([[:space:]]|"|$))' <<<"$target" && block "force pushes are not allowed"
else
  target="$(grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' <<<"$input" | head -1)"
fi

# The real instance and the real data are off limits (ADR-0003).
grep -Eq 'apps/personal-os|\.local/share/personal-os|apps_personales/personal_os' <<<"$target" \
  && block "the real instance, real data and backups are off limits"

exit 0
