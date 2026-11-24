# Task 0014: Migration guard, import de-duplication, installable app

**Branch:** `agent/implementer/installable-and-fixes`
**ADRs:** 0001, 0002, 0003, 0005

## Goal

Three independent improvements: turn the "no destructive migrations" rule
into a CI check, fix a double-counting risk in the importer, and make the
app feel like a desktop application on Windows without changing its
architecture (decision recorded in the handoff; a native `.exe` was
discussed and postponed).

## Scope

### 1. Migration safety check

A unit test that reads every file in `drizzle/*.sql` and fails if any
contains `DROP TABLE` (case-insensitive) or a table-rebuild pattern
(creating a `__new_` table). An explicit allow list in the test, empty
today, lets Manuel approve a reviewed exception with a one-line reason.
Prove it fails on a temporary bad migration, then remove it.

### 2. Importer: already-confirmed fixed items

Today a bank row for a fixed item that was already confirmed by hand (for
example the rent) appears as new and checked, so it would be counted twice.
A row is now flagged as a duplicate, unchecked by default, with the reason
"ya confirmado como fijo", when the same month has a movement linked to a
recurring item with the same kind and amount. Keep the existing duplicate
and pending-fixed-item rules. Unit, API and e2e tests.

### 3. Installable app

- **Web app manifest** and icons so Edge and Chrome offer "Install" for
  `http://localhost:<port>`: name "Personal OS", short name, standalone
  display, start URL, theme and background colours matching the current
  UI. Icons in the sizes the browsers require for installation. No offline
  caching of API data: the app always talks to the live server.
- **Autostart on Windows login:** `scripts/windows/install-autostart.ps1`
  and `uninstall-autostart.ps1` register and remove a Task Scheduler task
  for the current user (no admin rights) that runs the existing start script
  through `wsl.exe` hidden, at logon. Idempotent: running install twice
  leaves one task. They print what they did.
- README: "Install as an app" (install from the browser, pin it, autostart
  on and off).

### 4. Manual test (Windows; required by `CLAUDE.md`)

The PR must contain a "Manual test needed" section with exact steps for
Manuel: install the app from Edge or Chrome and open it from the Start menu;
run the autostart install script; sign out and in; open the installed app
without starting anything by hand; run uninstall and check the task is gone.

### 5. Process

No new dependencies expected; if one seems necessary, stop and report.
Run the `reviewer` subagent, fix, run it again on the final diff, and
record both verdicts. Review log row and handoff.

## Out of scope

A native `.exe` (Electron or Tauri), offline mode, UI redesign.

## Done when

- Both CI jobs pass on the PR.
- Both reviewer verdicts are in the PR.
- The manual test steps are in the PR, and the task is not done until
  Manuel has run them.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
