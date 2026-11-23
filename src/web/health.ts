export type HealthState = 'loading' | 'ok' | 'error';

/** Asks the server for its health and maps the answer to a UI state. */
export async function fetchHealth(fetchFn: typeof fetch = fetch): Promise<HealthState> {
  try {
    const response = await fetchFn('/api/health');
    if (!response.ok) {
      return 'error';
    }
    const body: unknown = await response.json();
    const isOk =
      typeof body === 'object' && body !== null && 'status' in body && body.status === 'ok';
    return isOk ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export const HEALTH_MESSAGES: Record<HealthState, string> = {
  loading: 'Comprobando el servidor…',
  ok: 'El servidor funciona correctamente.',
  error: 'No se ha podido conectar con el servidor.',
};
