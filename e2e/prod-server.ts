import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DB_FILENAME } from '../src/server/db/config.js';
import { openDatabase } from '../src/server/db/index.js';
import { seed } from '../src/server/db/seed.js';

/**
 * Starts the production server (`npm start`) against a throwaway data
 * directory seeded with the fictional development data. Never touches the real
 * data directory: the path always comes from `mkdtemp`, not from the environment.
 * Run by Playwright (see playwright.config.ts); stops and cleans up on SIGTERM.
 */
const dataDir = mkdtempSync(join(tmpdir(), 'personal-os-e2e-'));

// Filled once the server is spawned; cleanup may run before that (seed failure).
const servers: ChildProcess[] = [];
let cleaned = false;
function cleanUp(): void {
  if (cleaned) {
    return;
  }
  cleaned = true;
  for (const server of servers) {
    if (server.pid !== undefined) {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        // Already gone.
      }
    }
  }
  rmSync(dataDir, { recursive: true, force: true });
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    cleanUp();
    process.exit(0);
  });
}
process.on('exit', cleanUp);

// Cleanup is registered first: if seeding throws, the temp directory still goes.
// E2E_EMPTY=1: no seed, a fresh database (the server migrates it on start): the dashboard's
// empty states.
if (process.env.E2E_EMPTY !== '1') {
  const handle = openDatabase(join(dataDir, DB_FILENAME));
  try {
    seed(handle.db);
  } finally {
    handle.close();
  }
}

// A regular file where the backup mirror directory should be: the mirror is unreachable, which
// the backups spec expects to see as a warning. It lives inside the temporary directory.
const unreachableMirror = join(dataDir, 'mirror-blocked');
writeFileSync(unreachableMirror, 'not a directory');

const server = spawn('npm', ['start'], {
  // New process group, so the whole `npm -> sh -> node` chain can be stopped.
  detached: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    PERSONAL_OS_DATA_DIR: dataDir,
    PERSONAL_OS_BACKUP_MIRROR_DIR: unreachableMirror,
  },
});
servers.push(server);
server.on('exit', (code) => {
  cleanUp();
  process.exit(code ?? 1);
});
