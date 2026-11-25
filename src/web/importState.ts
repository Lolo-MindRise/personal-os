import type { CategoryDto, ImportPreviewRowDto } from '../shared/api.js';
import type { Kind } from '../shared/constants.js';
import type { ParsedImportRow } from '../shared/csvImport.js';
import { isOutsideAccountBalance } from '../shared/importAccount.js';
import { kindsForAmount } from '../shared/importClassify.js';

// State of the import preview, as plain data so it can be tested without a browser.

/** One row of the file as the preview shows it. */
export interface PreviewLine {
  /** Line of the file. */
  line: number;
  /** Why the row cannot be imported (a parsing problem); null for a readable row. */
  error: string | null;
  date: string | null;
  concept: string;
  /** Signed, as in the file. Null for an unreadable row. */
  amountCents: number | null;
  /** The server's classification; null for an unreadable row. */
  proposal: ImportPreviewRowDto | null;
  checked: boolean;
  /** The category that will be used: the proposal's, or the one the user picked. */
  categoryId: number | null;
  /** Dated on or before the target account's opening date: its balance will not count the row. */
  outOfBalance: boolean;
  /** The user checked or unchecked the row by hand; a change of account keeps that choice. */
  touched: boolean;
}

export const STATUS_LABELS: Record<ImportPreviewRowDto['status'], string> = {
  new: 'Nuevo',
  duplicate: 'Duplicado',
  recurring: 'Confirma un fijo',
  noCategory: 'Falta la categoría',
};

/**
 * Merges the readable rows (in order) with the server's proposals. Unreadable rows stay in place
 * with their error. Default selection: new rows with a category and fixed items are checked;
 * duplicates and rows without category are not.
 */
export function buildLines(
  parsed: ParsedImportRow[],
  proposals: ImportPreviewRowDto[],
  openingDate?: string,
): PreviewLine[] {
  let next = 0;
  const built = parsed.map((row): PreviewLine => {
    if (row.error !== null || row.date === null || row.amountCents === null) {
      return {
        line: row.line,
        error: row.error ?? 'Fila no válida.',
        date: row.date,
        concept: row.concept,
        amountCents: row.amountCents,
        proposal: null,
        checked: false,
        categoryId: null,
        outOfBalance: false,
        touched: false,
      };
    }
    const proposal = proposals[next++] ?? null;
    return {
      line: row.line,
      error: proposal === null ? 'No se pudo clasificar la fila.' : null,
      date: row.date,
      concept: row.concept,
      amountCents: row.amountCents,
      proposal,
      checked: proposal !== null && (proposal.status === 'new' || proposal.status === 'recurring'),
      categoryId: proposal?.categoryId ?? null,
      outOfBalance: false,
      touched: false,
    };
  });
  return openingDate === undefined ? built : applyOpeningDate(built, openingDate);
}

/** The default selection of a row before any manual choice, ignoring the account. */
function defaultChecked(line: PreviewLine): boolean {
  return (
    line.proposal !== null &&
    line.categoryId !== null &&
    (line.proposal.status === 'new' || line.proposal.status === 'recurring')
  );
}

/**
 * Evaluates every row against the target account's opening date. Rows the balance would not count
 * are flagged and unchecked by default; rows whose check the user set by hand keep it. Call it
 * again when the account changes. `undefined` clears every flag (no account known yet).
 */
export function applyOpeningDate(
  lines: PreviewLine[],
  openingDate: string | undefined,
): PreviewLine[] {
  return lines.map((line) => {
    if (line.proposal === null) {
      return line;
    }
    const outOfBalance =
      openingDate !== undefined &&
      line.date !== null &&
      isOutsideAccountBalance(line.date, openingDate);
    const checked = line.touched ? line.checked : defaultChecked(line) && !outOfBalance;
    return { ...line, outOfBalance, checked };
  });
}

/** Categories a row may use: the kinds its sign allows (money out: expense or repayment). */
export function categoriesFor(line: PreviewLine, categories: CategoryDto[]): CategoryDto[] {
  if (line.amountCents === null) {
    return [];
  }
  const kinds = kindsForAmount(line.amountCents);
  return categories.filter((c) => kinds.includes(c.kind));
}

/** Picks a category by hand. A row that was waiting for one becomes checked. Fixed items are locked. */
export function withCategory(line: PreviewLine, categoryId: number | null): PreviewLine {
  if (line.proposal === null || line.proposal.status === 'recurring') {
    return line;
  }
  const waiting = line.categoryId === null;
  // Picking a category for a waiting row checks it (unless the account will not count it), and
  // clearing it unchecks it: both are the user's choice and survive a change of account.
  const changesCheck = waiting || categoryId === null;
  return {
    ...line,
    categoryId,
    checked: categoryId === null ? false : waiting ? !line.outOfBalance : line.checked,
    touched: line.touched || changesCheck,
  };
}

export function withChecked(line: PreviewLine, checked: boolean): PreviewLine {
  return line.proposal === null || (checked && line.categoryId === null)
    ? line
    : { ...line, checked, touched: true };
}

/** The kind the row will have: the category's, or the fixed item's. */
export function kindOf(line: PreviewLine, categories: CategoryDto[]): Kind | null {
  if (line.proposal === null) {
    return null;
  }
  if (line.proposal.status === 'recurring') {
    return line.proposal.kind;
  }
  return categories.find((c) => c.id === line.categoryId)?.kind ?? null;
}

export interface CommitRow {
  date: string;
  concept: string;
  amountCents: number;
  kind: Kind;
  categoryId: number;
  recurringItemId: number | null;
}

/** The checked rows that can be imported, as the commit request wants them. */
export function commitRows(lines: PreviewLine[], categories: CategoryDto[]): CommitRow[] {
  return lines.flatMap((line): CommitRow[] => {
    const kind = kindOf(line, categories);
    if (
      !line.checked ||
      line.proposal === null ||
      line.date === null ||
      line.amountCents === null ||
      line.categoryId === null ||
      kind === null ||
      !kindsForAmount(line.amountCents).includes(kind)
    ) {
      return [];
    }
    return [
      {
        date: line.date,
        concept: line.concept,
        amountCents: Math.abs(line.amountCents),
        kind,
        categoryId: line.categoryId,
        recurringItemId:
          line.proposal.status === 'recurring' ? line.proposal.recurringItemId : null,
      },
    ];
  });
}

export interface LineCounts {
  total: number;
  errors: number;
  new: number;
  duplicate: number;
  recurring: number;
  noCategory: number;
  selected: number;
  /** Rows the target account's balance will not count. */
  outOfBalance: number;
}

export function countLines(lines: PreviewLine[], categories: CategoryDto[]): LineCounts {
  const counts: LineCounts = {
    total: lines.length,
    errors: 0,
    new: 0,
    duplicate: 0,
    recurring: 0,
    noCategory: 0,
    selected: 0,
    outOfBalance: 0,
  };
  for (const line of lines) {
    if (line.outOfBalance) {
      counts.outOfBalance++;
    }
    if (line.proposal === null) {
      counts.errors++;
    } else {
      counts[line.proposal.status]++;
    }
  }
  counts.selected = commitRows(lines, categories).length;
  return counts;
}

/**
 * Bank exports are often Latin-1 (Windows-1252), not UTF-8: try UTF-8 strictly and fall back,
 * so accents never turn into replacement characters.
 */
export function decodeCsvBytes(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
