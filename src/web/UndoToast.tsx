import { useEffect, useRef } from 'react';
import { startUndoTimer, type UndoToastState } from './undo.js';

interface Props {
  toast: UndoToastState | undefined;
  /** The user pressed «Deshacer». */
  onUndo: (toast: UndoToastState) => void;
  /** The time ran out (the row stays in the papelera). */
  onExpire: (toast: UndoToastState) => void;
  busy?: boolean;
}

/**
 * «Deshacer» for 10 seconds after a deletion. The live region is always rendered so that screen
 * readers announce the message when it appears. The text says what happened, not only a colour,
 * and the button takes focus (the button that deleted the row is gone).
 */
export function UndoToast({ toast, onUndo, onExpire, busy = false }: Props) {
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = toast?.id;
  useEffect(() => {
    if (toast === undefined) {
      return;
    }
    buttonRef.current?.focus();
    return startUndoTimer(() => {
      expire.current(toast);
    });
    // The timer belongs to one toast: a new deletion (new id) restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return (
    <div className="undo-region" role="status" aria-live="polite">
      {toast !== undefined && (
        <div className="undo-toast">
          <span>{toast.message}</span>
          <button
            ref={buttonRef}
            type="button"
            disabled={busy}
            onClick={() => {
              onUndo(toast);
            }}
          >
            Deshacer
          </button>
        </div>
      )}
    </div>
  );
}
