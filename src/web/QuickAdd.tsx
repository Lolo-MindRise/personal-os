import { useEffect, useRef, useState } from 'react';
import type { AccountDto, CategoryDto, DebtDto, TagDto } from '../shared/api.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { MovementForm, type FieldErrors } from './MovementForm.js';
import {
  emptyForm,
  mapApiFieldErrors,
  unmappedApiMessage,
  type MovementFormValues,
  type MovementPayload,
} from './movementForm.js';
import {
  MOVEMENT_SAVED_EVENT,
  notifyMovementSaved,
  QUICK_ADD_OPEN_EVENT,
  shouldOpenQuickAdd,
  SUGGEST_DEBOUNCE_MS,
  suggestionToShow,
  targetFacts,
  type SuggestionResult,
} from './quickAdd.js';
import { SidePanel } from './SidePanel.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

/** How long the "saved" confirmation stays on screen. */
const SAVED_MESSAGE_MS = 5000;

/**
 * The new-movement panel, available on every screen: key N, the sidebar button or the button of
 * Movimientos open it. Saving refreshes the list when the screen shows one.
 */
export function QuickAdd({ api = defaultApi }: { api?: ApiClient }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MovementFormValues>(() => emptyForm());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [debts, setDebts] = useState<DebtDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [suggestion, setSuggestion] = useState<SuggestionResult | undefined>();
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });

  const show = () => {
    if (openRef.current) {
      return;
    }
    setForm(emptyForm());
    setFieldErrors({});
    setFormError(undefined);
    setSuggestion(undefined);
    setSaved(false);
    setOpen(true);
  };
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shouldOpenQuickAdd(event, targetFacts(document))) {
        event.preventDefault();
        showRef.current();
      }
    };
    const onOpen = () => {
      showRef.current();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener(QUICK_ADD_OPEN_EVENT, onOpen);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener(QUICK_ADD_OPEN_EVENT, onOpen);
    };
  }, []);

  // The lists the form needs are read when the panel opens, so they are never stale.
  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    const fail = (error: unknown) => {
      if (active) {
        setFormError(messageOf(error));
      }
    };
    const keep =
      <T,>(set: (rows: T) => void) =>
      (rows: T) => {
        if (active) {
          set(rows);
        }
      };
    api.categories().then(keep(setCategories), fail);
    api.debts().then(keep(setDebts), fail);
    api.accounts().then(keep(setAccounts), fail);
    // Only a convenience (suggestions while typing a marca): the form works without it.
    api.tags().then(keep(setTags), () => undefined);
    return () => {
      active = false;
    };
  }, [api, open]);

  // The suggestion: asked a moment after the last keystroke, income and expense only.
  const { kind, concept } = form;
  useEffect(() => {
    const wanted = concept.trim();
    if (!open || wanted === '' || (kind !== 'income' && kind !== 'expense')) {
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      api.suggestCategory(kind, wanted).then(
        (answer) => {
          if (active) {
            setSuggestion({ kind, concept: wanted, categoryId: answer.categoryId });
          }
        },
        // A suggestion is a nicety: no answer, no suggestion.
        () => undefined,
      );
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, open, kind, concept]);

  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = setTimeout(() => {
      setSaved(false);
    }, SAVED_MESSAGE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [saved]);

  // A movement saved elsewhere does not concern this panel; the event is for the screens.
  const close = () => {
    setOpen(false);
  };

  const save = async (payload: MovementPayload) => {
    setBusy(true);
    setFormError(undefined);
    setFieldErrors({});
    try {
      await api.createMovement(payload);
      setOpen(false);
      setSaved(true);
      notifyMovementSaved();
    } catch (error) {
      setFieldErrors(error instanceof ApiError ? mapApiFieldErrors(error.fields) : {});
      setFormError(
        (error instanceof ApiError ? unmappedApiMessage(error.fields) : undefined) ??
          messageOf(error),
      );
    } finally {
      setBusy(false);
    }
  };

  const offered = suggestionToShow(suggestion, form, categories);

  return (
    <>
      <p className="quick-add-saved" role="status" aria-live="polite">
        {saved ? 'Movimiento guardado.' : ''}
      </p>
      <SidePanel open={open} title="Añadir movimiento" onClose={close}>
        <MovementForm
          values={form}
          categories={categories}
          debts={debts}
          accounts={accounts}
          tagNames={tags.map((t) => t.name)}
          errors={fieldErrors}
          formError={formError}
          mode="add"
          busy={busy}
          suggestionName={offered?.name}
          onUseSuggestion={() => {
            if (offered !== undefined) {
              setForm({ ...form, categoryId: String(offered.id) });
            }
          }}
          onChange={(values) => {
            setForm(values);
            setFieldErrors({});
          }}
          onSubmit={(payload) => void save(payload)}
          onInvalid={setFieldErrors}
          onCancel={close}
        />
      </SidePanel>
    </>
  );
}

/** Calls `onSaved` whenever a movement is saved through the quick-add panel. */
export function useMovementSaved(onSaved: () => void): void {
  const latest = useRef(onSaved);
  useEffect(() => {
    latest.current = onSaved;
  });
  useEffect(() => {
    const handler = () => {
      latest.current();
    };
    window.addEventListener(MOVEMENT_SAVED_EVENT, handler);
    return () => {
      window.removeEventListener(MOVEMENT_SAVED_EVENT, handler);
    };
  }, []);
}
