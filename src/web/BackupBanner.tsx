import { useEffect, useState } from 'react';
import type { BackupStatusDto } from '../shared/api.js';
import { createApiClient, type ApiClient } from './api.js';

const defaultApi = createApiClient();

/** How often the banner re-checks while the app stays open. */
export const REFRESH_MS = 10 * 60 * 1000;

/** The visible warning when backups have a problem (ADR-0003). Renders nothing when all is well. */
export function BackupWarning({ status }: { status: BackupStatusDto | undefined }) {
  if (status === undefined || status.warnings.length === 0) {
    return null;
  }
  return (
    <aside className="backup-warning" role="status" aria-label="Aviso de copias de seguridad">
      {status.warnings.map((warning) => (
        <p key={warning}>⚠ {warning}</p>
      ))}
    </aside>
  );
}

export function BackupBanner({ api = defaultApi }: { api?: ApiClient }) {
  const [status, setStatus] = useState<BackupStatusDto | undefined>();

  useEffect(() => {
    let active = true;
    const load = () => {
      api.backupStatus().then(
        (next) => {
          if (active) {
            setStatus(next);
          }
        },
        // The status is a nicety: if it cannot be read, say nothing rather than alarm.
        () => undefined,
      );
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);

  return <BackupWarning status={status} />;
}
