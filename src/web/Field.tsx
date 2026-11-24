import type { ReactNode } from 'react';

/** A labelled form field with its error message right under it, linked for screen readers. */
export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={error === undefined ? 'field' : 'field has-error'}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error !== undefined && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
