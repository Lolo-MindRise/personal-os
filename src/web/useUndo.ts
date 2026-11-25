import { useState } from 'react';
import { ApiError, NETWORK_ERROR } from './api.js';
import { newToast, type UndoToastState } from './undo.js';

/**
 * State behind the «Deshacer» toast. `onChange` refreshes the screen after an undo; `onError`
 * shows why an undo failed (the row then stays in the papelera).
 */
export function useUndo(onChange: () => void, onError: (message: string) => void) {
  const [toast, setToast] = useState<UndoToastState | undefined>();
  const [busy, setBusy] = useState(false);

  const show = (message: string, restore: () => Promise<unknown>) => {
    setToast(newToast(message, restore));
  };

  const undo = async (current: UndoToastState) => {
    setBusy(true);
    try {
      await current.restore();
    } catch (error) {
      onError(error instanceof ApiError ? error.message : NETWORK_ERROR);
    } finally {
      setBusy(false);
      setToast(undefined);
      onChange();
    }
  };

  const expire = (current: UndoToastState) => {
    setToast((now) => (now?.id === current.id ? undefined : now));
  };

  return { toast, busy, show, undo, expire };
}
