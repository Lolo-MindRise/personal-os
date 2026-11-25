// Quick add (task 0003-07): key N opens the new-movement panel from any screen. The decision is a
// pure function so every case is tested; the DOM is only read by `targetFacts`.

export const QUICK_ADD_OPEN_EVENT = 'personal-os:quick-add-open';
export const MOVEMENT_SAVED_EVENT = 'personal-os:movement-saved';

/** What the handler needs to know about the key press and where it happened. */
export interface QuickAddKey {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
}

export interface QuickAddTarget {
  /** Upper-case tag name of the focused element, or '' when there is none. */
  tag: string;
  editable: boolean;
  /** The focus is inside the undo toast (its «Deshacer» button). */
  inToast: boolean;
  /** A panel or dialog is open (the page behind is out of reach). */
  dialogOpen: boolean;
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True when the key press must open the quick-add panel. */
export function shouldOpenQuickAdd(event: QuickAddKey, target: QuickAddTarget): boolean {
  if (event.key.toLowerCase() !== 'n') {
    return false;
  }
  if (
    event.repeat ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.isComposing ||
    event.defaultPrevented
  ) {
    return false;
  }
  return !(TYPING_TAGS.has(target.tag) || target.editable || target.inToast || target.dialogOpen);
}

/** Reads the facts the decision needs from the document. */
export function targetFacts(doc: Document): QuickAddTarget {
  const active = doc.activeElement;
  return {
    tag: active?.tagName ?? '',
    editable: active instanceof HTMLElement && active.isContentEditable,
    inToast: active?.closest('.undo-region') != null,
    dialogOpen: doc.querySelector('[role="dialog"], dialog[open]') !== null,
  };
}

/** The answer of the server, with what it was asked. */
export interface SuggestionResult {
  kind: string;
  concept: string;
  categoryId: number | null;
}

/** Wait after the last keystroke before asking for a suggestion. */
export const SUGGEST_DEBOUNCE_MS = 300;

/**
 * The category to offer, or undefined. It is shown only while the answer still matches what is
 * in the form (same kind, same concept), when the category exists for that kind, and while it is
 * not already the chosen one. Showing it never changes the form.
 */
export function suggestionToShow(
  result: SuggestionResult | undefined,
  form: { kind: string; concept: string; categoryId: string },
  categories: readonly { id: number; name: string; kind: string }[],
): { id: number; name: string } | undefined {
  if (
    result?.categoryId == null ||
    result.kind !== form.kind ||
    result.concept !== form.concept.trim()
  ) {
    return undefined;
  }
  const { categoryId } = result;
  const category = categories.find((c) => c.id === categoryId && c.kind === form.kind);
  return category === undefined || String(category.id) === form.categoryId ? undefined : category;
}

/** Asks the app to open the quick-add panel (the key, the sidebar button and the page button). */
export function openQuickAdd(): void {
  window.dispatchEvent(new Event(QUICK_ADD_OPEN_EVENT));
}

/** Tells the screens a movement was saved elsewhere, so the one showing a list refreshes. */
export function notifyMovementSaved(): void {
  window.dispatchEvent(new Event(MOVEMENT_SAVED_EVENT));
}
