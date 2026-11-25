import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DATA_MESSAGES, MAX_IMPORT_BYTES } from '../shared/dataFile.js';
import { createApiClient } from './api.js';
import { DataTransferSection, ImportWarning } from './DataTransfer.js';
import { dataFileName, importSummary, readImportText } from './dataTransfer.js';

describe('data transfer helpers', () => {
  it('names the file with the date', () => {
    expect(dataFileName('2026-03-01')).toBe('personal-os-datos-2026-03-01.json');
  });

  it('reads a JSON file, and refuses bad JSON or a file over the limit', () => {
    expect(readImportText('{"a":1}', 10)).toEqual({ ok: true, data: { a: 1 } });
    expect(readImportText('{ nope', 10)).toEqual({ ok: false, error: DATA_MESSAGES.notJson });
    expect(readImportText('{}', MAX_IMPORT_BYTES + 1)).toEqual({
      ok: false,
      error: DATA_MESSAGES.tooBig,
    });
  });

  it('summarises what was imported', () => {
    expect(importSummary({ imported: { movements: 3, tags: 1 } })).toBe(
      'Datos importados: 3 movimientos, 0 categorías, 0 cuentas, 0 transferencias, 1 marcas, 0 fijos.',
    );
  });
});

describe('Copias: export and import', () => {
  it('warns that import is for a new installation and points to the README restore section', () => {
    const html = renderToStaticMarkup(<ImportWarning />);
    expect(html).toContain('instalación nueva y vacía');
    expect(html).toContain('No sirve para restaurar');
    expect(html).toContain('Restore a backup');
  });

  it('shows both actions', () => {
    const html = renderToStaticMarkup(<DataTransferSection api={createApiClient()} />);
    expect(html).toContain('Exportar datos');
    expect(html).toContain('Importar datos');
    expect(html).toContain('type="file"');
  });

  it('the client calls the export and import endpoints', async () => {
    const calls: { url: string; method: string | undefined }[] = [];
    const fetchFn = ((url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      return Promise.resolve(new Response(JSON.stringify({ imported: {} }), { status: 200 }));
    }) as typeof fetch;
    const api = createApiClient(fetchFn);
    await api.exportData();
    await api.importData({ any: 'file' });
    expect(calls).toEqual([
      { url: '/api/data/export', method: undefined },
      { url: '/api/data/import', method: 'POST' },
    ]);
  });
});
