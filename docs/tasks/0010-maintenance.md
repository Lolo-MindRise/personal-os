# Task 0010: Maintenance (prerequisites, dependencies, test isolation)

**Branch:** `agent/implementer/maintenance`
**ADRs:** 0001, 0002, 0003

## Goal

Close the gaps found while setting up Manuel's real instance and during the
overnight run. No new features.

## Scope

### 1. README: prerequisites

A "Prerequisites" section before the real instance guide, for a fresh
Ubuntu under WSL:
- `build-essential` (needed to compile `better-sqlite3` when no prebuilt
  binary matches the Node version; a deploy failed without it).
- The Playwright system packages for local e2e runs, with the safe way to
  install them: `npx playwright install-deps --dry-run chromium` to list
  them, then `sudo apt-get install` of that list.
- Node through `fnm`, using the version in `.nvmrc`.
- In the real instance guide, recommend a `PORT` other than the development
  server's default, and say why.

### 2. npm audit

Run `npm audit` and classify each finding: does it reach the production
runtime (`npm audit --omit=dev`) or only development tooling? Fix what can
be fixed without major version changes. Anything left: record package,
severity, why it is not fixed and whether it is reachable, in
`docs/dependencies.md`. Any lockfile change goes with its
`docs/dependencies.md` update. Dependency installs will ask Manuel for
approval: that is expected.

### 3. Install scripts

npm warns that `esbuild` (three versions) and `better-sqlite3` run install
scripts that are not covered by an explicit allow list. Use npm's
install-script approval mechanism so exactly the scripts the project needs
are allowed, committed in the repo, and any new package with an install
script is not run silently. Verify that `npm ci` still builds
`better-sqlite3` in CI. Record the decision in `docs/dependencies.md`.

### 4. E2E isolation

- The dev-mode smoke test must not depend on Vite's default port or the
  development server's default port: give it dedicated ports, so it never
  collides with a running `npm run dev` or the real instance.
- Tests that create movements must not depend on today's date near
  midnight: use fixed dates.
- Prove both: run the e2e suite while `npm run dev` is running, and show a
  test with a fixed date passing.

### 5. Process

Run the `reviewer` subagent before opening the PR and add the review log
row. Handoff in `docs/handoffs/`.

## Out of scope

Features, data model changes, `.claude/`, `CLAUDE.md` (Manuel updates it).

## Done when

- Both CI jobs pass on the PR.
- The README prerequisites let someone set up a fresh WSL Ubuntu without
  hitting the failures seen on 2026-11-24.
- The reviewer verdict is in the PR, with blockers and majors fixed or
  explained.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
