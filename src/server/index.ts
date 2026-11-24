import { resolve } from 'node:path';
import { buildApp } from './app.js';
import { createBackupService, type BackupService } from './backups.js';
import { HOST, parsePort } from './config.js';
import { resolveBackupConfig, resolveDbPath } from './db/config.js';
import { openDatabaseGuarded } from './db/index.js';

const isProduction = process.env.NODE_ENV === 'production';
const port = parsePort(process.env.PORT);

// Backups run only where there is a data directory (ADR-0003); locations come from the environment.
const backupConfig = resolveBackupConfig(process.env);
let backups: BackupService | undefined;
const log = (message: string) => {
  console.warn(message);
};

// Opens the database and applies migrations. In production it refuses to start
// without PERSONAL_OS_DATA_DIR (ADR-0003). An existing database with pending
// migrations is backed up first; if that backup fails, nothing is migrated.
const database = await openDatabaseGuarded(resolveDbPath(process.env), async (sqlite) => {
  if (backupConfig === undefined) {
    return;
  }
  backups = createBackupService({ sqlite, ...backupConfig, log });
  const result = await backups.runBackup('pre-migration');
  if (!result.ok) {
    throw new Error(`Backup before migration failed, not migrating: ${result.error ?? 'unknown'}`);
  }
});
if (backupConfig !== undefined) {
  backups ??= createBackupService({ sqlite: database.sqlite, ...backupConfig, log });
  // Startup and then every 24 h. A failure is a warning in the UI, never a reason to stop.
  await backups.runBackup('startup');
  backups.start();
}

// In production the built frontend lives next to the built server: dist/web.
const app = buildApp({
  db: database.db,
  backups,
  logger: true,
  webRoot: isProduction ? resolve(import.meta.dirname, '../web') : undefined,
});

try {
  await app.listen({ host: HOST, port });
} catch (error) {
  app.log.error(error);
  backups?.stop();
  database.close();
  process.exit(1);
}

// Without this, the open SQLite handle would outlive a `kill`. Close the server, then the DB.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    backups?.stop();
    // Let a backup in flight finish before the database closes under it.
    void Promise.all([app.close(), backups?.whenIdle()]).finally(() => {
      database.close();
      process.exit(0);
    });
  });
}
