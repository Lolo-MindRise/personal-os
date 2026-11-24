# Handoff 2026-11-26: Real instance operations (task 0009)

Branch `agent/implementer/real-instance-ops` (from `main`).

## Done
- `config/instance.env.example`: placeholders only (`PERSONAL_OS_DATA_DIR`,
  `PERSONAL_OS_BACKUP_MIRROR_DIR`, `PORT`). Real file: `~/.config/personal-os/instance.env`,
  overridable with `PERSONAL_OS_INSTANCE_ENV`.
- `scripts/start.sh` (+ `--port`), `stop.sh`, `deploy-local.sh`, shared `scripts/lib/common.sh`.
- `scripts/windows/personal-os-start.cmd` / `-stop.cmd` (CRLF, forced by `.gitattributes`).
- `npm run db:reset` (`src/server/db/reset.ts`): refuses with `NODE_ENV=production` or a data dir set.
- README "Run your real instance"; ADR-0003 action item 2 ticked.
- Tests: `src/server/scripts.test.ts` (temp dirs, temp bare remote, free port, fake server) and
  `src/server/db/reset.test.ts`. No new dependencies, no migration.

## Decisions taken
- Health check uses `node` (fetch), not curl: node is already required, curl is not.
- The PID file is written by the inner shell that then `exec`s node, so it holds the server's PID.
  A PID is trusted only if `/proc/<pid>/cmdline` contains `dist/server/index.js` (recycled PIDs).
- `stop.sh` never sends SIGKILL: after 30 s it fails and tells Manuel (a backup may be running).
- On a health timeout `start.sh` leaves the process running (it may be mid-migration); the message
  points to the log and to `stop.sh`.
- `deploy-local.sh` needs the instance config only to detect a running app; without it, it
  proceeds with a note (first deploy comes before the first start anyway).
- Node lookup: `PATH`, else fnm (`PATH`, `$FNM_PATH`, `~/.local/share/fnm`, `~/.fnm`), then
  `fnm use` in the app dir. Deploy passes `--install-if-missing`; start does not.
- `.cmd` files take the instance directory from `APP_DIR` at the top (default is the ADR path;
  shell `$HOME` is expanded inside WSL). The port comes from `start.sh --port`.
- Deploy requires branch `main` and a clean tree (`git status --porcelain`); ignored files
  (`dist/`, `node_modules/`) do not count.

- Failed deploy (reviewer major): `dist/` is kept as `dist.previous` during the build and the
  previous commit is restored on a failed `npm ci` / build. **Partial deviation from ADR-0003**
  ("previous build remains"): `node_modules` is not preserved (`npm ci` replaces it), so after a
  failed deploy the app may not start until a deploy succeeds; the script says so.
- The instance path default (`~/apps/personal-os`) is in `deploy-local.sh` and the `.cmd` files
  because a script needs some default; tests always override it with a temp dir.
- `stop.sh` fails (instead of "not running") when no PID file exists but the port still answers.

## Review
- Reviewer: changes required. Majors: false "nothing changed" deploy message (fixed as above);
  the guard-block incident below. Minors: default path (kept, see above), `.cmd` port parsing
  (now filtered to digits only), stop vs. health (fixed).

## Not verified here
- The `.cmd` files cannot run on Linux; tests only check their structure. First real use is
  Manuel's.
- Nothing was run against the real instance, its data or backups (guard hook respected). **Manuel to confirm:** the guard
  blocked one shell command of mine whose text contained the instance path; I redid that edit
  with the file tools instead, as CLAUDE.md asks.

## Next step
Manuel follows the README section, top to bottom, and reports anything unclear.

## Blocked
Nothing.
