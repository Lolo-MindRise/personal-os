# Handoff 2026-11-24: Migration guard, import de-duplication, installable app (task 0014)

Branch `agent/implementer/installable-and-fixes` (from `main`, which includes the long session).

## Done
- **Migration guard** (`src/server/db/migrationSafety.ts` + test): every `drizzle/*.sql` must have no
  `DROP TABLE` and no `__new_` table (comments are ignored: 0004 explains why it avoids a rebuild).
  `ALLOWED` in the test is the empty exception list (file name → reason); a stale exception fails.
  Proved: a temporary `0099_temporary_bad.sql` failed the test with a clear message, then was removed.
- **Importer**: a bank row is now a duplicate, unchecked, reason "ya confirmado como fijo", when its
  month has a movement that confirms a fixed item with the same kind and amount. Checked after the
  exact-duplicate and pending-item rules (a pending item still wins); each stored movement covers one
  row. The preview shows the reason; the server loads whole months now. Unit, API and e2e tests.
- **Installable app**: `manifest.webmanifest` (standalone, colours from the UI), icons drawn in code
  and emitted by the build (`src/server/pwaIcons.ts`, Vite plugin; also served by the dev server),
  head tags. No service worker, nothing cached. Chromium's own `Page.getInstallabilityErrors` is empty
  in an e2e test.
- **Autostart**: `scripts/windows/install-autostart.ps1` / `uninstall-autostart.ps1` (Task Scheduler,
  current user, no admin, hidden `wsl.exe` at logon, idempotent). README "Install as an app".
- No dependency, no migration.

## Decisions taken
- Native `.exe` (Electron/Tauri) postponed: the server runs in WSL, so an `.exe` would still need WSL,
  packaging and updates. The installed web app gives a window, Start menu and taskbar with no
  architecture change. Revisit if that stops being enough.
- Icons are generated at build time instead of committed because binary files cannot be written with
  the file tools and shell writes to the repo are blocked.
- No service worker: Chromium no longer needs one to offer "Install" on localhost (checked by the e2e).
- Task name `PersonalOS-Autostart`; `$HOME` stays unexpanded in single quotes so bash resolves it.

## Not verified here
- The `.ps1` files and the browser's Install button: Windows only, WSL interop is off here. The PR has
  the manual test; the task is not done until Manuel has run it.

## Next step
Manuel runs the manual test in the PR, then merges.

## Blocked
Nothing.
