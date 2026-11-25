import { useState } from 'react';
import { MAX_IMPORT_BYTES } from '../shared/dataFile.js';
import { ApiError, NETWORK_ERROR, type ApiClient } from './api.js';
import { dataFileName, downloadJson, importSummary, readImportText } from './dataTransfer.js';
import { todayISO } from './months.js';

/** The warning above the importer: it moves data to a new installation, it does not restore. */
export function ImportWarning() {
  return (
    <p className="hint" role="note">
      Importar sirve para llevar tus datos a una instalación nueva y vacía. No sirve para restaurar
      una copia de seguridad: para eso sigue la sección «Restore a backup» del README. Si ya hay
      datos guardados, no se importa nada.
    </p>
  );
}

export function DataTransferSection({ api }: { api: ApiClient }) {
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => {
    setError(e instanceof ApiError ? e.message : NETWORK_ERROR);
  };

  const exportAll = async () => {
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const file = await api.exportData();
      downloadJson(dataFileName(todayISO()), JSON.stringify(file, null, 2));
      setMessage(
        'Datos exportados. Guarda el archivo en un lugar seguro: contiene todos tus datos.',
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File | undefined) => {
    if (file === undefined) {
      return;
    }
    setMessage(undefined);
    setError(undefined);
    // Check the size before reading: a huge file is never loaded into memory.
    const readable = file.size > 0 && file.size <= MAX_IMPORT_BYTES;
    const read = readImportText(readable ? await file.text() : '', file.size);
    if (!read.ok) {
      setError(read.error);
      return;
    }
    setBusy(true);
    try {
      setMessage(importSummary(await api.importData(read.data)));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Exportar datos</h2>
      <p className="hint">
        Descarga un archivo con todos tus datos para llevarlos a otra instalación. No se guarda nada
        en el servidor.
      </p>
      <button type="button" onClick={() => void exportAll()} disabled={busy}>
        Exportar datos
      </button>

      <h2>Importar datos</h2>
      <ImportWarning />
      <div className="field">
        <label htmlFor="data-import-file">Archivo de datos (.json)</label>
        <input
          id="data-import-file"
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = '';
            void importFile(chosen);
          }}
        />
      </div>

      {message !== undefined && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
      {error !== undefined && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
