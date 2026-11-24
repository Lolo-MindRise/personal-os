import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { BackupStatusDto } from '../shared/api.js';
import { registerApi } from './api.js';
import type { BackupService } from './backups.js';
import type { Db } from './db/index.js';

export interface AppOptions {
  /** Database the API reads and writes. */
  db: Db;
  /** Absolute path to the built frontend. When set, the server also serves it. */
  webRoot?: string | undefined;
  /** In-app backups; without them the status endpoint reports them as disabled. */
  backups?: BackupService | undefined;
  logger?: boolean;
}

const DISABLED: BackupStatusDto = {
  enabled: false,
  lastBackupAt: null,
  localCount: 0,
  oldestBackupAt: null,
  tiers: { recent: 0, daily: 0, monthly: 0, preMigration: 0 },
  mirror: {
    configured: false,
    state: 'disabled',
    count: 0,
    oldestBackupAt: null,
    tiers: { recent: 0, daily: 0, monthly: 0, preMigration: 0 },
  },
  warnings: [],
};

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/api/health', () => ({ status: 'ok' }));
  registerApi(app, options.db);
  app.get('/api/backups/status', () => options.backups?.status() ?? DISABLED);

  const { webRoot } = options;
  if (webRoot !== undefined) {
    void app.register(fastifyStatic, { root: webRoot });

    // Client-side routes fall back to index.html; unknown API routes stay 404.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not Found' });
    });
  }

  return app;
}
