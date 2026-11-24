import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open/close state of a screen's side panel. */
export function usePanel(): { open: boolean; show: () => void; hide: () => void } {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => {
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
  }, []);
  return { open, show, hide };
}

function PanelBody({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);

  // Focus moves into the panel when it opens and returns to the element that opened it.
  useEffect(() => {
    const opener = document.activeElement;
    const first = panel.current?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    (first ?? panel.current)?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      } else {
        // The opener is gone (a pending row that was confirmed): land on the page title.
        document.querySelector<HTMLElement>('h1')?.focus();
      }
    };
  }, []);

  // The page behind is out of reach: focus that lands outside is pulled back in.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const panelEl = panel.current;
      if (panelEl !== null && event.target instanceof Node && !panelEl.contains(event.target)) {
        const first = panelEl.querySelector<HTMLElement>(FOCUSABLE);
        (first ?? panelEl).focus();
      }
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  // Esc closes the panel wherever the focus is (a disabled button, for one, drops it).
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close.current();
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab' || panel.current === null) {
      return;
    }
    // Focus stays inside the panel while it is open.
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <div className="panel-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panel}
        className="side-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <button type="button" className="panel-close" onClick={onClose}>
          Cerrar
        </button>
        {children}
      </aside>
    </>
  );
}

/**
 * A panel that slides in from the right with a form. Esc, the overlay or "Cerrar" close it;
 * focus stays inside and goes back to the element that opened it.
 */
export function SidePanel({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }
  return (
    <PanelBody title={title} onClose={onClose}>
      {children}
    </PanelBody>
  );
}
