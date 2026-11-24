import type { CategoryUsageDto } from '../shared/api.js';
import { KINDS, type Kind } from '../shared/constants.js';

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** Why a category cannot be deleted, in Spanish; undefined when nothing points at it. */
export function usageReason(c: CategoryUsageDto): string | undefined {
  const parts: string[] = [];
  if (c.movements > 0) {
    parts.push(plural(c.movements, 'movimiento', 'movimientos'));
  }
  if (c.recurringItems > 0) {
    parts.push(plural(c.recurringItems, 'fijo', 'fijos'));
  }
  if (c.budgetLines > 0) {
    parts.push(plural(c.budgetLines, 'línea de presupuesto', 'líneas de presupuesto'));
  }
  if (parts.length === 0) {
    return undefined;
  }
  return `En uso: ${parts.join(', ')}. No se puede eliminar mientras tenga datos asociados.`;
}

/** Groups categories by kind, in the fixed kind order; each group keeps the incoming order. */
export function groupByKind(categories: CategoryUsageDto[]): [Kind, CategoryUsageDto[]][] {
  return KINDS.map((kind) => [kind, categories.filter((c) => c.kind === kind)]);
}

export const CATEGORY_ERRORS = {
  name: 'Escribe un nombre.',
} as const;

/** Client-side check of a typed name; the API stays the authority on uniqueness. */
export function validateCategoryName(
  name: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = name.trim();
  return trimmed === '' ? { ok: false, error: CATEGORY_ERRORS.name } : { ok: true, name: trimmed };
}
