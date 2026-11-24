import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerApi } from './api.js';
import type { Db } from './db/index.js';

export interface AppOptions {
  /** Database the API reads and writes. */
  db: Db;
  /** Absolute path to the built frontend. When set, the server also serves it. */
  webRoot?: string | undefined;
  logger?: boolean;
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/api/health', () => ({ status: 'ok' }));
  registerApi(app, options.db);

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
