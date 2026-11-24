import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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

const handle = openDatabase(join(dataDir, DB_FILENAME));
seed(handle.db);
handle.close();

const server = spawn('npm', ['start'], {
  // New process group, so the whole `npm -> sh -> node` chain can be stopped.
  detached: true,
  stdio: 'inherit',
  env: { ...process.env, PERSONAL_OS_DATA_DIR: dataDir },
});

let cleaned = false;
function cleanUp(): void {
  if (cleaned) {
    return;
  }
  cleaned = true;
  if (server.pid !== undefined) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // Already gone.
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
server.on('exit', (code) => {
  cleanUp();
  process.exit(code ?? 1);
});
