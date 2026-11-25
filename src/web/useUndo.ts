import { useRef, useState } from 'react';
import { ApiError, NETWORK_ERROR } from './api.js';
import { afterExpire, newToast, performUndo, type UndoToastState } from './undo.js';

/**
 * State behind the «Deshacer» toast. `onChange` refreshes the screen after an undo; `onError`
 * shows why an undo failed (the row then stays in the papelera). The transitions live in
 * `undo.ts` as plain functions.
 */
export function useUndo(onChange: () => void, onError: (message: string) => void) {
  const [toast, setToast] = useState<UndoToastState | undefined>();
  const [busy, setBusy] = useState(false);
  const flight = useRef({ current: false });

  const show = (message: string, restore: () => Promise<unknown>) => {
    setToast(newToast(message, restore));
  };

  const undo = async (current: UndoToastState) => {
    if (flight.current.current) {
      return;
    }
    setBusy(true);
    await performUndo(current, flight.current, {
      onError: (error) => {
        onError(error instanceof ApiError ? error.message : NETWORK_ERROR);
      },
      onSettled: () => {
        setBusy(false);
        setToast(undefined);
        onChange();
      },
    });
  };

  const expire = (current: UndoToastState) => {
    setToast((now) => afterExpire(now, current));
  };

  return { toast, busy, show, undo, expire };
}
