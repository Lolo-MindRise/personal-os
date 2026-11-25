# Bootstrapping the development system in a repository

Manual checklist until the system is packaged as a template and plugin.
Record in the target repo's handoff every step that needed adapting: that
list is what the template must solve.

## 1. Decide (write ADR-0001 of the target repo)

- [ ] Autonomy profile: `branches` or `supervised` (ADR-0008).
- [ ] Default branch name.
- [ ] Protected paths: real instances, data, backups, exports, and the
      configuration that points to them.
- [ ] Protected commands: scripts that reach real data through their own
      configuration (start, stop, restore, deploy). A text-based guard cannot
      see that indirect access.
- [ ] Real data with personal or client information: give it to a separate
      OS user, so agents cannot read it even by mistake. Required for the CRM.
- [ ] Server-side rules available? Public repo or paid plan: yes. Private
      on GitHub Free: no — the guard is the main guarantee.

## 2. Copy

- [ ] `.claude/hooks/guard.sh` (executable) **and** `.claude/guard.conf`
      with the decisions above — always together.
- [ ] `.claude/settings.json`: hook registration; permissions adapted to the
      stack (package manager, test commands); deny reading `.env*`;
      dependency installs always ask.
- [ ] `.claude/agents/reviewer.md`.
- [ ] `CLAUDE.md`: core rules, adapted stack and environment sections.
- [ ] `.github/pull_request_template.md`, `docs/tasks/TEMPLATE.md`,
      `docs/tasks/TEMPLATE-discovery.md`.
- [ ] `docs/decisions/`, `docs/handoffs/`, `docs/dependencies.md`,
      `docs/metrics/review-log.md`.

## 3. Verify in a real Claude Code session (mandatory)

Each action must be valid (it would succeed without the guard), so the test
really reaches the guard:
- [ ] Merge attempt (`gh pr merge 999`) → blocked.
- [ ] A protected path from `guard.conf` → blocked.
- [ ] Editing `.claude/guard.conf` with the Edit tool → blocked.
- [ ] `echo x > notes.txt` → blocked; `echo x > /tmp/ok.txt` → allowed.
- [ ] Profile behaviour: `branches` — commit on the default branch blocked,
      commit on a feature branch allowed; `supervised` — any commit blocked.

## 4. First task

- [ ] Inherited code: the discovery task (`TEMPLATE-discovery.md`) before
      anything else.
- [ ] New code: a walking skeleton with CI, as personal-os task 0001.
