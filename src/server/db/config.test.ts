import { describe, expect, it } from 'vitest';
import { DB_FILENAME, DEV_DB_PATH, resolveDbPath } from './config.js';

describe('resolveDbPath', () => {
  it('refuses to start in production without PERSONAL_OS_DATA_DIR', () => {
    expect(() => resolveDbPath({ NODE_ENV: 'production' })).toThrow(
      /PERSONAL_OS_DATA_DIR is not set/,
    );
    expect(() => resolveDbPath({ NODE_ENV: 'production', PERSONAL_OS_DATA_DIR: '  ' })).toThrow(
      /PERSONAL_OS_DATA_DIR/,
    );
  });

  it('uses the data directory in production', () => {
    expect(resolveDbPath({ NODE_ENV: 'production', PERSONAL_OS_DATA_DIR: '/fake/data' })).toBe(
      `/fake/data/${DB_FILENAME}`,
    );
  });

  it('uses the gitignored repo file in development, ignoring the data directory', () => {
    expect(resolveDbPath({ PERSONAL_OS_DATA_DIR: '/fake/data' })).toBe(DEV_DB_PATH);
    expect(DEV_DB_PATH).toMatch(/\.dev-data\/personal-os\.sqlite$/);
  });
});
