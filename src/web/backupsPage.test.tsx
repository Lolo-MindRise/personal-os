import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BackupStatusDto } from '../shared/api.js';
import { BackupsView, formatTimestamp } from './BackupsPage.js';

const tiers = { recent: 0, daily: 0, monthly: 0, preMigration: 0 };

const status = (over: Partial<BackupStatusDto> = {}): BackupStatusDto => ({
  enabled: true,
  lastBackupAt: '2026-01-05T09:30:00',
  localCount: 4,
  oldestBackupAt: '2025-12-01T08:00:00',
  tiers,
  mirror: {
    configured: true,
    state: 'ok',
    count: 3,
    oldestBackupAt: null,
    tiers,
  },
  warnings: [],
  ...over,
});

describe('formatTimestamp', () => {
  it('writes the local date and time, or says there is none', () => {
    expect(formatTimestamp('2026-01-05T09:30:00')).toBe('05/01/2026 09:30');
    expect(formatTimestamp(null)).toBe('Ninguna todavía');
  });
});

describe('BackupsView', () => {
  it('shows the last copy, the count and the mirror', () => {
    const html = renderToStaticMarkup(<BackupsView status={status()} />);
    expect(html).toContain('05/01/2026 09:30');
    expect(html).toContain('>4<');
    expect(html).toContain('Correcta (3 copias)');
  });

  it('shows every warning as an alert and an unreachable mirror', () => {
    const html = renderToStaticMarkup(
      <BackupsView
        status={status({
          warnings: ['No se puede acceder a la copia de reserva.'],
          mirror: { ...status().mirror, state: 'error' },
        })}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('No se puede acceder a la copia de reserva.');
    expect(html).toContain('No se puede escribir en ella');
  });

  it('says so when the copies are not running', () => {
    const html = renderToStaticMarkup(<BackupsView status={status({ enabled: false })} />);
    expect(html).toContain('no están activas');
  });

  it('says the mirror is not configured', () => {
    const html = renderToStaticMarkup(
      <BackupsView
        status={status({ mirror: { ...status().mirror, configured: false, state: 'disabled' } })}
      />,
    );
    expect(html).toContain('No configurada');
  });
});
