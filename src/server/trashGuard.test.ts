import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Structural guard for the trash (plan 0003, task 01): a server file that imports the `movements`
// or `transfers` table must also use the helpers of db/live.ts, so a new reader cannot forget the
// exclusion of trashed rows. (The behaviour itself is tested by trashEquivalence.test.ts.)

const SERVER = join(import.meta.dirname);

/** Files that touch the tables but never read them for the app's figures, and why. */
const EXEMPT: Record<string, string> = {
  'db/live.ts': 'defines the helpers',
  'db/schema.ts': 'defines the tables',
  'db/seed.ts': 'only inserts the development seed',
  'recurringApi.ts': 'only inserts; reads go through confirmedItemIds (db/recurring.ts)',
};

function sourceFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      return sourceFiles(join(dir, entry.name), `${name}/`);
    }
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [name] : [];
  });
}

const importsTable = (text: string, table: 'movements' | 'transfers'): boolean =>
  new RegExp(`import\\s*\\{[^}]*\\b${table}\\b[^}]*\\}\\s*from\\s*'\\./(db/)?schema\\.js'`).test(
    text,
  );

describe('trash guard', () => {
  it('every file reading movements or transfers uses the live/trashed helpers', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SERVER)) {
      if (file in EXEMPT) {
        continue;
      }
      const text = readFileSync(join(SERVER, file), 'utf8');
      if (importsTable(text, 'movements') && !/\b(live|trashed)Movements\(/.test(text)) {
        offenders.push(`${file}: reads movements without liveMovements()/trashedMovements()`);
      }
      if (importsTable(text, 'transfers') && !/\b(live|trashed)Transfers\(/.test(text)) {
        offenders.push(`${file}: reads transfers without liveTransfers()/trashedTransfers()`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the exemptions exist and still import a table (remove stale ones)', () => {
    for (const file of Object.keys(EXEMPT)) {
      expect(sourceFiles(SERVER)).toContain(file);
    }
  });

  it('the matcher sees the imports it is meant to see', () => {
    expect(importsTable("import { a, movements, b } from './db/schema.js';", 'movements')).toBe(
      true,
    );
    expect(importsTable("import { a } from './schema.js';", 'movements')).toBe(false);
    expect(importsTable("import { transfers } from './db/schema.js';", 'movements')).toBe(false);
  });
});
