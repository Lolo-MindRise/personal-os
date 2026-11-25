// Category suggestion for a new movement (plan 0003, task 07). Pure: the server feeds it the
// past live movements of one kind. The suggestion only ever proposes; the form never applies it
// without the user choosing it.

/** Past movements scanned at most (newest first). A local single-user app: 2000 is years of use. */
export const SUGGEST_SCAN_LIMIT = 2000;

/** Words shorter than this are ignored when comparing concepts. */
export const MIN_TOKEN_LENGTH = 3;

export interface SuggestionSource {
  id: number;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  concept: string;
  categoryId: number;
}

/**
 * Lower case, accents stripped, punctuation and digits turned into spaces, single spaces.
 * "Mercadona 0123, Valencia!" becomes "mercadona valencia".
 */
export function normalizeConcept(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}]+/gu, ' ')
    .trim();
}

/** The words of three or more letters of a concept. */
export function conceptTokens(text: string): Set<string> {
  return new Set(
    normalizeConcept(text)
      .split(' ')
      .filter((word) => word.length >= MIN_TOKEN_LENGTH),
  );
}

const isNewer = (a: SuggestionSource, b: SuggestionSource): boolean =>
  a.date > b.date || (a.date === b.date && a.id > b.id);

/**
 * The category most often used with similar concepts, or undefined when nothing is similar.
 * Similar means: the same normalised concept (if any movement has it, only those count), else
 * sharing at least one word of three or more letters. The most frequent category wins; a tie goes
 * to the category used most recently. The caller passes movements of the right kind only and
 * never trashed ones.
 */
export function suggestCategory(
  concept: string,
  past: readonly SuggestionSource[],
): number | undefined {
  const wanted = normalizeConcept(concept);
  if (wanted === '') {
    return undefined;
  }
  let matches = past.filter((m) => normalizeConcept(m.concept) === wanted);
  if (matches.length === 0) {
    const tokens = conceptTokens(concept);
    if (tokens.size === 0) {
      return undefined;
    }
    matches = past.filter((m) => [...conceptTokens(m.concept)].some((t) => tokens.has(t)));
  }
  const stats = new Map<number, { count: number; latest: SuggestionSource }>();
  for (const m of matches) {
    const entry = stats.get(m.categoryId);
    if (entry === undefined) {
      stats.set(m.categoryId, { count: 1, latest: m });
    } else {
      entry.count += 1;
      if (isNewer(m, entry.latest)) {
        entry.latest = m;
      }
    }
  }
  let best: { categoryId: number; count: number; latest: SuggestionSource } | undefined;
  for (const [categoryId, entry] of stats) {
    if (
      best === undefined ||
      entry.count > best.count ||
      (entry.count === best.count && isNewer(entry.latest, best.latest))
    ) {
      best = { categoryId, ...entry };
    }
  }
  return best?.categoryId;
}
