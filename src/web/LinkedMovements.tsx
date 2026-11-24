import { useEffect, useState } from 'react';
import type { CategoryDto, MovementSearchDto } from '../shared/api.js';
import { ApiError, NETWORK_ERROR, type ApiClient } from './api.js';
import type { SearchQuery } from './movementSearch.js';
import { SearchResults } from './MovementSearch.js';
import { navigate } from './router.js';

/**
 * The movements behind a debt or a fixed item, across all months. Opened from a link
 * (`#/movements?debt=3`, `#/movements?fixed=2`); clearing the filter returns to the month.
 */
export function LinkedMovements({
  api,
  query,
  categories,
}: {
  api: ApiClient;
  query: SearchQuery;
  categories: CategoryDto[];
}) {
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState<{ key: string; result: MovementSearchDto } | undefined>();
  const [failed, setFailed] = useState<{ key: string; message: string } | undefined>();
  const key = `${JSON.stringify(query)}#${String(page)}`;

  useEffect(() => {
    let active = true;
    api.searchMovements(query, page).then(
      (result) => {
        if (active) {
          setLoaded({ key, result });
        }
      },
      (error: unknown) => {
        if (active) {
          setFailed({ key, message: error instanceof ApiError ? error.message : NETWORK_ERROR });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [api, query, page, key]);

  return (
    <>
      {failed?.key === key && (
        <p className="form-error" role="alert">
          {failed.message} Vuelve a abrir el enlace o quita el filtro.
        </p>
      )}
      {loaded !== undefined && (
        <SearchResults
          result={loaded.result}
          query={query}
          categories={categories}
          busy={loaded.key !== key}
          backLabel="Ver movimientos del mes"
          onPage={setPage}
          onGoToMonth={(movement) => {
            navigate('movements', { month: movement.date.slice(0, 7) });
          }}
          onBack={() => {
            navigate('movements');
          }}
        />
      )}
      {loaded === undefined && failed === undefined && (
        <p className="empty" role="status">
          Buscando…
        </p>
      )}
    </>
  );
}
