/** How long «Deshacer» stays available after deleting a movement or a transfer. */
export const UNDO_MS = 10_000;

/** Calls `onExpire` after `ms`. Returns the function that cancels it. */
export function startUndoTimer(onExpire: () => void, ms: number = UNDO_MS): () => void {
  const timer = setTimeout(onExpire, ms);
  return () => {
    clearTimeout(timer);
  };
}

/** What the toast needs: a message and what undoing does. `id` is new for every deletion. */
export interface UndoToastState {
  id: number;
  message: string;
  restore: () => Promise<unknown>;
}

let nextToastId = 1;

export function newToast(message: string, restore: () => Promise<unknown>): UndoToastState {
  nextToastId += 1;
  return { id: nextToastId, message, restore };
}
