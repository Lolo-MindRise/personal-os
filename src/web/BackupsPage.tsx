import { useEffect, useState } from 'react';
import type { BackupStatusDto, BackupTiersDto } from '../shared/api.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { DataTransferSection } from './DataTransfer.js';
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

function TiersTable({ title, tiers }: { title: string; tiers: BackupTiersDto }) {
  const rows: [string, number][] = [
    ['Últimas 48 horas: todas', tiers.recent],
    ['Una por día, los últimos 60 días', tiers.daily],
    ['Una por mes, para siempre', tiers.monthly],
    ['Antes de migrar o restaurar: las 10 últimas de cada tipo', tiers.preMigration],
  ];
  return (
    <>
      <h2>{title}</h2>
      <dl className="debt-facts">
        {rows.map(([label, count]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
    </>
  );
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
        {status.mirror.configured && status.mirror.state === 'ok' && (
          <div>
            <dt>Copia más antigua en la reserva</dt>
            <dd>{formatTimestamp(status.mirror.oldestBackupAt)}</dd>
          </div>
        )}
      </dl>
      {status.warnings.map((warning) => (
        <p key={warning} className="form-error" role="alert">
          {warning}
        </p>
      ))}
      <TiersTable title="Qué se conserva" tiers={status.tiers} />
      {status.mirror.configured && status.mirror.state === 'ok' && (
        <TiersTable title="Qué se conserva en la copia de reserva" tiers={status.mirror.tiers} />
      )}
      <h2>Cómo restaurar</h2>
      <p className="hint">
        Restaurar se hace con la aplicación parada, desde Ubuntu, y no se puede hacer desde esta
        pantalla. Sigue la sección «Restore a backup» del README: te muestra las copias que puedes
        recuperar y guarda una copia de los datos actuales antes de sustituirlos.
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
      <DataTransferSection api={api} />
    </main>
  );
}
