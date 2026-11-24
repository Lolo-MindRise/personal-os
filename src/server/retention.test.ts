import { describe, expect, it } from 'vitest';
import { stamp } from './backups.js';
import {
  applyRetention,
  localDay,
  parseBackupName,
  type BackupEntry,
  type BackupType,
} from './retention.js';

const TZ = 'Europe/Andorra';

function entry(iso: string, type: BackupType = 'startup'): BackupEntry {
  const parsed = parseBackupName(`personal-os-${stamp(new Date(iso))}-${type}.sqlite`);
  if (parsed === undefined) {
    throw new Error('bad test entry');
  }
  return parsed;
}

const kept = (entries: BackupEntry[], now: string, protectedName?: string) =>
  applyRetention(entries, new Date(now), TZ, protectedName).keep.map((e) => e.at.toISOString());

describe('parseBackupName', () => {
  it('accepts the four types and rejects anything else', () => {
    for (const type of ['startup', 'daily', 'pre-migration', 'before-restore']) {
      expect(parseBackupName(`personal-os-20261125T030405006Z-${type}.sqlite`)?.type).toBe(type);
    }
    expect(parseBackupName('personal-os-20261125T030405006Z-other.sqlite')).toBeUndefined();
    expect(parseBackupName('notes.txt')).toBeUndefined();
    expect(
      parseBackupName('personal-os-20261125T030405006Z-startup.sqlite.partial'),
    ).toBeUndefined();
  });
});

describe('localDay', () => {
  it('follows Europe/Andorra, including the DST change', () => {
    // Winter (UTC+1): 23:30Z is already the next day. Summer (UTC+2): 22:30Z is.
    expect(localDay(new Date('2026-01-10T23:30:00Z'), TZ)).toBe('2026-01-11');
    expect(localDay(new Date('2026-01-10T22:30:00Z'), TZ)).toBe('2026-01-10');
    expect(localDay(new Date('2026-07-10T22:30:00Z'), TZ)).toBe('2026-07-11');
    expect(localDay(new Date('2026-07-10T21:30:00Z'), TZ)).toBe('2026-07-10');
  });
});

describe('applyRetention', () => {
  const now = '2026-11-25T12:00:00.000Z';

  it('keeps everything from the last 48 hours: many restarts in one day survive', () => {
    const restarts = Array.from({ length: 30 }, (_, i) =>
      entry(
        `2026-11-25T${String(Math.floor(i / 3)).padStart(2, '0')}:${String((i % 3) * 20).padStart(2, '0')}:00Z`,
      ),
    );
    const yesterday = entry('2026-11-24T20:00:00Z');
    const result = applyRetention([...restarts, yesterday], new Date(now), TZ);
    expect(result.remove).toEqual([]);
    expect(result.tiers.recent).toBe(31);
  });

  it('a day of restarts cannot push out older days', () => {
    const lastWeek = entry('2026-11-18T09:00:00Z');
    const lastMonth = entry('2026-10-20T09:00:00Z');
    const restarts = Array.from({ length: 100 }, (_, i) =>
      entry(
        `2026-11-25T0${String(i % 10)}:${String(i % 60).padStart(2, '0')}:${String(i % 50).padStart(2, '0')}Z`,
      ),
    );
    const result = kept([lastWeek, lastMonth, ...restarts], now);
    expect(result).toContain(lastWeek.at.toISOString());
    expect(result).toContain(lastMonth.at.toISOString());
  });

  it('keeps only the newest of each day between 48 hours and 60 days', () => {
    const a = entry('2026-11-20T08:00:00Z');
    const b = entry('2026-11-20T18:00:00Z');
    const c = entry('2026-11-19T08:00:00Z');
    expect(kept([a, b, c], now)).toEqual([b.at.toISOString(), c.at.toISOString()]);
  });

  it('keeps only the newest of each month beyond 60 days, indefinitely', () => {
    const oct1 = entry('2026-08-01T08:00:00Z');
    const oct2 = entry('2026-08-02T08:00:00Z');
    const jan1 = entry('2026-01-05T08:00:00Z');
    const jan2 = entry('2026-01-20T08:00:00Z');
    const old = entry('2020-03-03T08:00:00Z');
    const result = applyRetention([oct1, oct2, jan1, jan2, old], new Date(now), TZ);
    expect(result.keep.map((e) => e.name)).toEqual([oct2.name, jan2.name, old.name]);
    expect(result.tiers.monthly).toBe(3);
  });

  it('the daily window is 60 calendar days in local time', () => {
    // now = 2026-11-25 local. Day -60 is 2026-09-26: kept as a day; -61 only as a month.
    const d60a = entry('2026-09-26T10:00:00Z');
    const d60b = entry('2026-09-26T08:00:00Z');
    const d61a = entry('2026-09-25T10:00:00Z');
    const d61b = entry('2026-09-25T08:00:00Z');
    const result = applyRetention([d60a, d60b, d61a, d61b], new Date(now), TZ);
    const names = result.keep.map((e) => e.name);
    expect(names).toContain(d60a.name);
    // September's newest is d60a, so d61a is gone and nothing from the 25th is a "daily" any more.
    expect(names).not.toContain(d61a.name);
    expect(names).not.toContain(d60b.name);
  });

  it('day boundaries use local time: 23:30Z in winter belongs to the next local day', () => {
    // 2026-01-10T23:30Z is 2026-01-11 00:30 local; 2026-01-10T22:30Z is 2026-01-10 23:30 local.
    // Evaluated "now" in Jan so both are in the daily window.
    const late = entry('2026-01-10T23:30:00Z');
    const earlier = entry('2026-01-10T22:30:00Z');
    const result = applyRetention([late, earlier], new Date('2026-01-20T12:00:00Z'), TZ);
    // Different local days (10th and 11th): both are the newest of their day.
    expect(result.keep).toHaveLength(2);
    expect(result.tiers.daily).toBe(2);
  });

  it('month boundaries across the DST change use local time', () => {
    // Last Sunday of March 2026 is the 29th. 2026-03-31T22:30Z is 2026-04-01 00:30 local (UTC+2):
    // it starts April, while 2026-03-31T21:30Z is still 31 March.
    const march = entry('2026-03-31T21:30:00Z');
    const april = entry('2026-03-31T22:30:00Z');
    const result = applyRetention([march, april], new Date('2026-11-25T12:00:00Z'), TZ);
    expect(result.tiers.monthly).toBe(2);
    expect(localDay(april.at, TZ)).toBe('2026-04-01');
    expect(localDay(march.at, TZ)).toBe('2026-03-31');
  });

  it('a day with 23 or 25 hours does not break the daily rule (DST days)', () => {
    // 2026-03-29 has 23 local hours; 2026-10-25 has 25.
    const spring = [entry('2026-03-28T23:30:00Z'), entry('2026-03-29T10:00:00Z')];
    const autumn = [entry('2026-10-24T22:30:00Z'), entry('2026-10-25T22:30:00Z')];
    const result = applyRetention([...spring, ...autumn], new Date('2026-11-25T12:00:00Z'), TZ);
    // 28 Mar 23:30Z = 29 Mar 00:30 local, same local day as 29 Mar 10:00Z → one of them is the month's newest only.
    expect(localDay(spring[0]?.at ?? new Date(0), TZ)).toBe('2026-03-29');
    expect(localDay(autumn[0]?.at ?? new Date(0), TZ)).toBe('2026-10-25');
    expect(localDay(autumn[1]?.at ?? new Date(0), TZ)).toBe('2026-10-25');
    // Inside the 60-day window only autumn applies: both are 25 Oct local → newest only.
    expect(result.keep.map((e) => e.name)).toContain(autumn[1]?.name);
    expect(result.keep.map((e) => e.name)).not.toContain(autumn[0]?.name);
  });

  it('keeps the 10 newest pre-migration backups whatever their age, and drops the 11th', () => {
    // One per month in different years would be kept anyway, so put them all in one old month.
    const pre = Array.from({ length: 12 }, (_, i) =>
      entry(
        `2024-05-0${String(i < 9 ? i + 1 : 9)}T${String(i).padStart(2, '0')}:00:00Z`,
        'pre-migration',
      ),
    );
    const result = applyRetention(pre, new Date(now), TZ);
    expect(result.keep).toHaveLength(10);
    // The two oldest are gone.
    const removed = result.remove.map((e) => e.at.toISOString());
    expect(removed).toEqual([pre[1]?.at.toISOString(), pre[0]?.at.toISOString()]);
    expect(result.tiers.preMigration + result.tiers.monthly).toBe(10);
  });

  it('keeps before-restore backups like pre-migration ones, counted separately', () => {
    const pre = Array.from({ length: 10 }, (_, i) =>
      entry(`2024-05-09T${String(i).padStart(2, '0')}:00:00Z`, 'pre-migration'),
    );
    const restores = Array.from({ length: 11 }, (_, i) =>
      entry(`2024-05-10T${String(i).padStart(2, '0')}:00:00Z`, 'before-restore'),
    );
    const result = applyRetention([...pre, ...restores], new Date(now), TZ);
    expect(result.keep.filter((e) => e.type === 'pre-migration')).toHaveLength(10);
    expect(result.keep.filter((e) => e.type === 'before-restore')).toHaveLength(10);
    expect(result.remove).toHaveLength(1);
    expect(result.remove[0]?.type).toBe('before-restore');
  });

  it('never deletes the backup just created, even with a clock that went backwards', () => {
    const newer = entry('2026-11-24T10:00:00Z');
    const created = entry('2026-11-20T08:00:00Z');
    const sameDayNewer = entry('2026-11-20T09:00:00Z');
    const result = applyRetention([newer, created, sameDayNewer], new Date(now), TZ, created.name);
    expect(result.keep.map((e) => e.name)).toContain(created.name);
  });

  it('simulates months of daily use with restarts and ends bounded', () => {
    // From 2026-01-01 to 2026-11-25: 5 restarts a day plus a daily backup, pruning after each one.
    let files: BackupEntry[] = [];
    const start = Date.parse('2026-01-01T06:00:00Z');
    const days = 328;
    for (let d = 0; d < days; d++) {
      for (let k = 0; k < 6; k++) {
        const at = new Date(start + d * 86_400_000 + k * 3_600_000);
        const created = entry(at.toISOString(), k === 0 ? 'daily' : 'startup');
        files = applyRetention([...files, created], at, TZ, created.name).keep;
      }
    }
    const last = new Date(start + (days - 1) * 86_400_000 + 5 * 3_600_000);
    const result = applyRetention(files, last, TZ);
    expect(result.remove).toEqual([]);
    // 48 h of restarts + ≤ 60 dailies + 11 months: well under a hundred files, not 1968.
    expect(files.length).toBeLessThan(100);
    // Every month since January is restorable, and yesterday and last week are too.
    const months = new Set(files.map((e) => localDay(e.at, TZ).slice(0, 7)));
    expect(months.size).toBe(11);
    const dayKeys = new Set(files.map((e) => localDay(e.at, TZ)));
    expect(dayKeys.has(localDay(new Date(last.getTime() - 86_400_000), TZ))).toBe(true);
    expect(dayKeys.has(localDay(new Date(last.getTime() - 7 * 86_400_000), TZ))).toBe(true);
  });
});
