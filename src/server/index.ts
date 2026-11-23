import { resolve } from 'node:path';
import { buildApp } from './app.js';
import { HOST, parsePort } from './config.js';

const isProduction = process.env.NODE_ENV === 'production';
const port = parsePort(process.env.PORT);

// In production the built frontend lives next to the built server: dist/web.
const app = buildApp({
  logger: true,
  webRoot: isProduction ? resolve(import.meta.dirname, '../web') : undefined,
});

try {
  await app.listen({ host: HOST, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
