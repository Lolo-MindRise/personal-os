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

/** The toast after a timer fired for `expired`: a newer toast (other id) is left alone. */
export function afterExpire(
  now: UndoToastState | undefined,
  expired: UndoToastState,
): UndoToastState | undefined {
  return now?.id === expired.id ? undefined : now;
}

/** Marks an undo as running, so a second click in the same render tick is ignored. */
export interface UndoFlight {
  current: boolean;
}

/**
 * Runs the restore behind «Deshacer». Ignored while another undo is in flight (a double click
 * would send the restore twice and the second would fail with a 404). A failure goes to `onError`
 * (the row then stays in the papelera); `onSettled` always runs: close the toast and reload.
 * Returns whether the restore worked.
 */
export async function performUndo(
  toast: UndoToastState,
  flight: UndoFlight,
  hooks: { onError: (error: unknown) => void; onSettled: () => void },
): Promise<boolean> {
  if (flight.current) {
    return false;
  }
  flight.current = true;
  try {
    await toast.restore();
    return true;
  } catch (error) {
    hooks.onError(error);
    return false;
  } finally {
    flight.current = false;
    hooks.onSettled();
  }
}

let nextToastId = 1;

export function newToast(message: string, restore: () => Promise<unknown>): UndoToastState {
  nextToastId += 1;
  return { id: nextToastId, message, restore };
}
