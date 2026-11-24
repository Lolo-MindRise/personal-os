// Backup retention policy (task 0012). Pure functions: file names and a clock in,
// the set to keep out. Nothing here touches the disk.
//
// Applied after every backup, locally and in the mirror:
// - every backup from the last 48 hours;
// - the newest backup of each calendar day for the last 60 days;
// - the newest backup of each calendar month, indefinitely;
// - the 10 newest `-pre-migration` backups and the 10 newest `-before-restore` backups;
// - the backup just created is never deleted.
// Ages come from the time stamp in the file name, never from file modification times.
// Calendar days and months follow the configured time zone.

export const DEFAULT_TIME_ZONE = 'Europe/Andorra';
export const RECENT_HOURS = 48;
export const DAILY_DAYS = 60;
export const KEEP_SAFETY = 10;

export type BackupType = 'startup' | 'daily' | 'pre-migration' | 'before-restore';

export const BACKUP_FILE_PATTERN =
  /^personal-os-(\d{8}T\d{9}Z)-(startup|daily|pre-migration|before-restore)\.sqlite$/;

export interface BackupEntry {
  name: string;
  type: BackupType;
  at: Date;
}

/** Tier names in the order a file is counted: each file is counted once, in the first that keeps it. */
export interface TierCounts {
  recent: number;
  daily: number;
  monthly: number;
  /** Kept only by the safety rule (`-pre-migration` and `-before-restore`). */
  preMigration: number;
}

/** `20261125T030405006Z` → a Date; undefined when the text is not a stamp. */
export function stampToDate(text: string): Date | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/.exec(text);
  if (m === null) {
    return undefined;
  }
  const [, y, mo, d, h, mi, s, ms] = m.map(Number);
  return new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1, h, mi, s, ms));
}

/** Parses a backup file name; undefined for any other file (which is never touched). */
export function parseBackupName(name: string): BackupEntry | undefined {
  const m = BACKUP_FILE_PATTERN.exec(name);
  const at = m === null ? undefined : stampToDate(m[1] ?? '');
  return m === null || at === undefined ? undefined : { name, type: m[2] as BackupType, at };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The local calendar day of an instant as `YYYY-MM-DD` in the given time zone. */
export function localDay(at: Date, timeZone: string): string {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  return `${parts.year ?? ''}-${parts.month ?? ''}-${parts.day ?? ''}`;
}

/** `YYYY-MM-DD` minus `days` calendar days (pure date arithmetic, no time zone involved). */
function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) - days));
  return shifted.toISOString().slice(0, 10);
}

export interface RetentionResult {
  keep: BackupEntry[];
  remove: BackupEntry[];
  tiers: TierCounts;
}

/**
 * Decides what to keep. `protectedName` (the backup just created) is always kept.
 * Entries may come in any order.
 */
export function applyRetention(
  entries: BackupEntry[],
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
  protectedName?: string,
): RetentionResult {
  const newestFirst = [...entries].sort(
    (a, b) => b.at.getTime() - a.at.getTime() || (a.name < b.name ? 1 : -1),
  );
  const recentSince = now.getTime() - RECENT_HOURS * 3_600_000;
  const oldestDay = shiftDay(localDay(now, timeZone), DAILY_DAYS);

  const recent = new Set<string>();
  const daily = new Set<string>();
  const monthly = new Set<string>();
  const safety = new Set<string>();
  const seenDays = new Set<string>();
  const seenMonths = new Set<string>();
  const safetyCount = new Map<BackupType, number>();

  for (const entry of newestFirst) {
    if (entry.at.getTime() >= recentSince) {
      recent.add(entry.name);
    }
    const day = localDay(entry.at, timeZone);
    if (!seenDays.has(day)) {
      seenDays.add(day);
      if (day >= oldestDay) {
        daily.add(entry.name);
      }
    }
    const month = day.slice(0, 7);
    if (!seenMonths.has(month)) {
      seenMonths.add(month);
      monthly.add(entry.name);
    }
    if (entry.type === 'pre-migration' || entry.type === 'before-restore') {
      const n = (safetyCount.get(entry.type) ?? 0) + 1;
      safetyCount.set(entry.type, n);
      if (n <= KEEP_SAFETY) {
        safety.add(entry.name);
      }
    }
  }

  const keep: BackupEntry[] = [];
  const remove: BackupEntry[] = [];
  const tiers: TierCounts = { recent: 0, daily: 0, monthly: 0, preMigration: 0 };
  for (const entry of newestFirst) {
    const n = entry.name;
    if (recent.has(n)) {
      tiers.recent++;
    } else if (daily.has(n)) {
      tiers.daily++;
    } else if (monthly.has(n)) {
      tiers.monthly++;
    } else if (safety.has(n)) {
      tiers.preMigration++;
    } else if (n !== protectedName) {
      remove.push(entry);
      continue;
    }
    keep.push(entry);
  }
  return { keep, remove, tiers };
}
