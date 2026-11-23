import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});

describe('without a web root (development)', () => {
  it('does not serve the frontend', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe('with a web root (production)', () => {
  let webRoot: string;

  beforeAll(() => {
    webRoot = mkdtempSync(join(tmpdir(), 'personal-os-web-'));
    writeFileSync(join(webRoot, 'index.html'), '<!doctype html><title>fixture</title>');
  });

  afterAll(() => {
    rmSync(webRoot, { recursive: true, force: true });
  });

  it('serves index.html at /', async () => {
    const app = buildApp({ webRoot });
    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('fixture');
    await app.close();
  });

  it('falls back to index.html for client-side routes', async () => {
    const app = buildApp({ webRoot });
    const response = await app.inject({ method: 'GET', url: '/movimientos' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('fixture');
    await app.close();
  });

  it('keeps the API working', async () => {
    const app = buildApp({ webRoot });
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('returns 404 for unknown API routes', async () => {
    const app = buildApp({ webRoot });
    const response = await app.inject({ method: 'GET', url: '/api/unknown' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
