export const DEFAULT_PORT = 5310;

/** The server only ever binds to the loopback interface (ADR-0002). */
export const HOST = '127.0.0.1';

export function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${value}": expected an integer between 1 and 65535.`);
  }
  return port;
}
