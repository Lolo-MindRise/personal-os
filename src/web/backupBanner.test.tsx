import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BackupStatusDto } from '../shared/api.js';
import { createApiClient } from './api.js';
import { BackupWarning } from './BackupBanner.js';

const status = (warnings: string[]): BackupStatusDto => ({
  enabled: true,
  lastBackupAt: '2026-11-25T03:00:00.000Z',
  localCount: 3,
  mirror: { configured: true, state: warnings.length > 0 ? 'error' : 'ok', count: 3 },
  warnings,
});

describe('BackupWarning', () => {
  it('renders nothing while the status is unknown or healthy', () => {
    expect(renderToStaticMarkup(<BackupWarning status={undefined} />)).toBe('');
    expect(renderToStaticMarkup(<BackupWarning status={status([])} />)).toBe('');
  });

  it('shows every warning in a visible banner', () => {
    const html = renderToStaticMarkup(
      <BackupWarning status={status(['El espejo no responde.', 'Otra cosa.'])} />,
    );
    expect(html).toContain('backup-warning');
    expect(html).toContain('Aviso de copias de seguridad');
    expect(html).toContain('El espejo no responde.');
    expect(html).toContain('Otra cosa.');
  });
});

describe('api client: backup status', () => {
  it('reads /api/backups/status', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(status([])), { status: 200 })),
    );
    const result = await createApiClient(fetchFn).backupStatus();
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/backups/status');
    expect(result.localCount).toBe(3);
  });
});
