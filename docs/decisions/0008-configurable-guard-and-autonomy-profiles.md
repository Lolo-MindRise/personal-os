# ADR-0008: Configurable guard and autonomy profiles

**Status:** Accepted
**Date:** 2026-11-25
**Deciders:** Manuel Cardoso

## Context

The development system will be reused in other repositories, starting with
an inherited MindRise CRM. That repository is private on GitHub Free, so
branch rulesets are not enforced (ADR-0001 relied on them as layer 1); it
may use `master`; it may need a stricter autonomy level than personal-os;
and its real data lives elsewhere. Until now the guard hook had
personal-os paths and `main` written into it.

## Decision

1. **The guard is generic.** Everything project-specific lives in
   `.claude/guard.conf`, maintained by Manuel and protected by the guard:
   - `AUTONOMY`: `branches` (agents commit and push their own branches and
     open PRs; Manuel merges) or `supervised` (agents never commit, push or
     open PRs; Manuel does).
   - `DEFAULT_BRANCH`: the branch only Manuel merges into.
   - `PROTECTED_PATHS`: extended regex of real instances, data and backups.
2. **Fail safe:** a missing or invalid configuration means `supervised` and
   `main`.
3. **No server-side rules required:** the guard also blocks commits made
   while on the default branch, not only pushes to it, because in a
   repository without rulesets nothing else stops them.
4. **Bootstrap checklist** (`docs/system/bootstrap.md`) and a discovery
   task template for inherited code (`docs/tasks/TEMPLATE-discovery.md`).

## Options Considered

| Dimension (weight) | A. One guard per project, edited by hand | B. Generic guard + config file |
|---|---|---|
| Reuse across projects (30 %) | 1 | 5 |
| Risk of a copy-paste mistake weakening protection (30 %) | 2 | 5 |
| Simplicity (20 %) | 4 | 4 |
| Fails safe when misconfigured (20 %) | 2 | 5 |
| **Weighted total** | **2.10** | **4.80** |

## Consequences

- One guard to maintain and test; projects differ only by configuration.
- In repositories without rulesets, the guard is the main guarantee; its
  real-session tests (bootstrap checklist) are mandatory before agents work.
- Shipping the new guard without its `guard.conf` would switch a project to
  supervised mode: they always travel together.
