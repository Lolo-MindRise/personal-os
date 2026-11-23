import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, parsePort } from './config.js';

describe('parsePort', () => {
  it('defaults to 5310 when PORT is not set', () => {
    expect(DEFAULT_PORT).toBe(5310);
    expect(parsePort(undefined)).toBe(5310);
    expect(parsePort('')).toBe(5310);
  });

  it('accepts a valid port', () => {
    expect(parsePort('8080')).toBe(8080);
  });

  it.each(['abc', '0', '65536', '80.5', '-1'])('rejects %s', (value) => {
    expect(() => parsePort(value)).toThrow(/Invalid PORT/);
  });
});
