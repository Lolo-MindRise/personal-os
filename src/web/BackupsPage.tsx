import { useEffect, useState } from 'react';
import type { BackupStatusDto } from '../shared/api.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { formatDate } from './months.js';
import { PageHeader } from './PageHeader.js';

const defaultApi = createApiClient();

/** `2026-01-05T09:30:00.000Z` → `05/01/2026 09:30` (local time). */
export function formatTimestamp(iso: string | null): string {
  if (iso === null) {
    return 'Ninguna todavía';
  }
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${formatDate(day)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function BackupsView({ status }: { status: BackupStatusDto }) {
  if (!status.enabled) {
    return (
      <p className="empty">
        Las copias no están activas en este modo. Se hacen solas cuando la aplicación se ejecuta con
        su carpeta de datos.
      </p>
    );
  }
  return (
    <>
      <dl className="debt-facts">
        <div>
          <dt>Última copia</dt>
          <dd>{formatTimestamp(status.lastBackupAt)}</dd>
        </div>
        <div>
          <dt>Copia más antigua</dt>
          <dd>{formatTimestamp(status.oldestBackupAt)}</dd>
        </div>
        <div>
          <dt>Copias guardadas</dt>
          <dd>{status.localCount}</dd>
        </div>
        <div>
          <dt>Copia de reserva</dt>
          <dd>
            {status.mirror.configured
              ? status.mirror.state === 'ok'
                ? `Correcta (${String(status.mirror.count)} copias)`
                : 'No se puede escribir en ella'
              : 'No configurada'}
          </dd>
        </div>
      </dl>
      {status.warnings.map((warning) => (
        <p key={warning} className="form-error" role="alert">
          {warning}
        </p>
      ))}
      <p className="hint">
        Para restaurar una copia, sigue la sección «Restore a backup» del README desde Ubuntu.
      </p>
    </>
  );
}

export function BackupsPage({ api = defaultApi }: { api?: ApiClient }) {
  const [status, setStatus] = useState<BackupStatusDto | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    api.backupStatus().then(setStatus, (e: unknown) => {
      setError(e instanceof ApiError ? e.message : NETWORK_ERROR);
    });
  }, [api]);

  return (
    <main className="page">
      <PageHeader
        title="Copias"
        hint="Las copias de seguridad de tus datos se hacen solas al arrancar, cada día y antes de cambiar la base de datos."
      />
      {error !== undefined && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {status !== undefined && <BackupsView status={status} />}
    </main>
  );
}
