import { resolve } from 'node:path';
import { buildApp } from './app.js';
import { HOST, parsePort } from './config.js';
import { openDatabaseFromEnv } from './db/index.js';

const isProduction = process.env.NODE_ENV === 'production';
const port = parsePort(process.env.PORT);

// Opens the database and applies migrations. In production it refuses to start
// without PERSONAL_OS_DATA_DIR (ADR-0003).
const database = openDatabaseFromEnv(process.env);

// In production the built frontend lives next to the built server: dist/web.
const app = buildApp({
  logger: true,
  webRoot: isProduction ? resolve(import.meta.dirname, '../web') : undefined,
});

try {
  await app.listen({ host: HOST, port });
} catch (error) {
  app.log.error(error);
  database.close();
  process.exit(1);
}

process.on('SIGTERM', () => {
  database.close();
});
