"""Applies the ADR-0009 permission changes to .claude/settings.json.
Run by Manuel only (agents cannot edit settings). Idempotent."""
import json, pathlib, sys

path = pathlib.Path(".claude/settings.json")
data = json.loads(path.read_text())
perms = data.setdefault("permissions", {})

before_ask = list(perms.get("ask", []))
perms["ask"] = [r for r in before_ask if not r.replace(" ", "").startswith("Bash(npmci")]
removed = [r for r in before_ask if r not in perms["ask"]]

allow = perms.setdefault("allow", [])
added = []
for rule in ["Bash(npm ci:*)", "Bash(git merge:*)", "Bash(git worktree list:*)"]:
    if rule not in allow:
        allow.append(rule)
        added.append(rule)

worktree = data.setdefault("worktree", {})
old_base = worktree.get("baseRef")
worktree["baseRef"] = "head"

path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
print("removed from ask:", removed or "nothing")
print("added to allow:  ", added or "nothing")
print("worktree.baseRef:", old_base, "->", "head")
