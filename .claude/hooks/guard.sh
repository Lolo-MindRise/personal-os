#!/usr/bin/env bash
# PreToolUse guard for personal-os (ADR-0001, ADR-0003).
# Receives the tool call as JSON on stdin. Exit code 2 blocks the call.
# No jq dependency on purpose: it must work in any environment.
# Agents must never edit this file or the permission settings.

input="$(cat)"

block() {
  echo "Blocked by .claude/hooks/guard.sh: $1. Do not work around this; report it in the PR or handoff." >&2
  exit 2
}

tool="$(grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' <<<"$input" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"

# Protected agent configuration: permissions, this hook and the subagents (ADR-0001, ADR-0007).
protected='\.claude/(settings[^/"]*\.json|hooks/|agents/)'

if [[ "$tool" == "Bash" ]]; then
  target="$input"

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
  grep -Eq 'git[[:space:]]+push[^;&|]*([[:space:]]|:)main([[:space:]]|"|$)' <<<"$target" && block "pushing to main is not allowed"
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

# The real instance and the real data are off limits (ADR-0003).
grep -Eq 'apps/personal-os|\.local/share/personal-os|apps_personales/personal_os' <<<"$target" \
  && block "the real instance, real data and backups are off limits"

exit 0
