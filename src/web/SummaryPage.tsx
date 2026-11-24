import { useEffect, useState, type SubmitEvent } from 'react';
import type { SettingsDto, YearSummaryDto } from '../shared/api.js';
import { formatCents } from '../shared/money.js';
import { ApiError, createApiClient, NETWORK_ERROR, type ApiClient } from './api.js';
import { Field } from './Field.js';
import { monthLabel } from './months.js';
import {
  barPercent,
  formFromSettings,
  mapSettingsApiErrors,
  validateSettingsForm,
  type SettingsField,
  type SettingsFormValues,
} from './summaryForms.js';

const defaultApi = createApiClient();

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : NETWORK_ERROR);

/** A number with a simple CSS bar under it. The bar is decoration: the figure carries the meaning. */
function Bar({ percent, tone }: { percent: number; tone: string }) {
  return (
    <span className="bar-track" aria-hidden="true">
      <span className={`bar bar-${tone}`} style={{ width: `${String(percent)}%` }} />
    </span>
  );
}

export function YearTable({ summary }: { summary: YearSummaryDto }) {
  const { rows, totals } = summary;
  // Income, expenses and repayments share a scale; savings and the accumulated balance have their own.
  const flowMax = Math.max(
    0,
    ...rows.flatMap((r) => [r.incomeCents, r.expenseCents, r.repaymentCents]),
  );
  const savingsMax = Math.max(0, ...rows.map((r) => Math.abs(r.savingsCents)));
  const accumulatedMax = Math.max(0, ...rows.map((r) => Math.abs(r.accumulatedCents ?? 0)));
  return (
    <table className="movements summary-year">
      <thead>
        <tr>
          <th>Mes</th>
          <th className="amount">Ingresos</th>
          <th className="amount">Gastos</th>
          <th className="amount">Amortizaciones</th>
          <th className="amount">Ahorro</th>
          <th className="amount">Ahorro acumulado</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.month}>
            <th scope="row">{monthLabel(row.month).replace(/ de \d+$/, '')}</th>
            <td className="amount">
              {formatCents(row.incomeCents)}
              <Bar percent={barPercent(row.incomeCents, flowMax)} tone="income" />
            </td>
            <td className="amount">
              {formatCents(row.expenseCents)}
              <Bar percent={barPercent(row.expenseCents, flowMax)} tone="expense" />
            </td>
            <td className="amount">
              {formatCents(row.repaymentCents)}
              <Bar percent={barPercent(row.repaymentCents, flowMax)} tone="repayment" />
            </td>
            <td className={row.savingsCents < 0 ? 'amount negative' : 'amount'}>
              {formatCents(row.savingsCents)}
              <Bar
                percent={barPercent(Math.abs(row.savingsCents), savingsMax)}
                tone={row.savingsCents < 0 ? 'negative' : 'income'}
              />
            </td>
            <td
              className={
                row.accumulatedCents !== null && row.accumulatedCents < 0
                  ? 'amount negative'
                  : 'amount'
              }
            >
              {row.accumulatedCents === null ? (
                <span className="muted">—</span>
              ) : (
                <>
                  {formatCents(row.accumulatedCents)}
                  <Bar
                    percent={barPercent(Math.abs(row.accumulatedCents), accumulatedMax)}
                    tone={row.accumulatedCents < 0 ? 'negative' : 'accent'}
                  />
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total {summary.year}</th>
          <td className="amount">{formatCents(totals.incomeCents)}</td>
          <td className="amount">{formatCents(totals.expenseCents)}</td>
          <td className="amount">{formatCents(totals.repaymentCents)}</td>
          <td className={totals.savingsCents < 0 ? 'amount negative' : 'amount'}>
            {formatCents(totals.savingsCents)}
          </td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

export function SettingsForm(props: {
  values: SettingsFormValues;
  errors: Partial<Record<SettingsField, string>>;
  formError: string | undefined;
  saved: boolean;
  busy: boolean;
  onChange: (values: SettingsFormValues) => void;
  onSubmit: (values: SettingsFormValues) => void;
}) {
  const { values, errors } = props;
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    props.onSubmit(values);
  };
  return (
    <form className="movement-form" onSubmit={submit} noValidate>
      <h2>Saldo inicial de ahorro</h2>
      <p className="hint form-hint">
        El ahorro acumulado parte de este saldo y suma el ahorro de los movimientos posteriores a su
        fecha. Los meses que terminan antes de esa fecha no tienen acumulado.
      </p>
      <div className="form-grid">
        <Field id="settings-balance" label="Saldo inicial (€)" error={errors.balance}>
          <input
            id="settings-balance"
            type="text"
            inputMode="decimal"
            placeholder="2.500,00"
            value={values.balance}
            aria-describedby={errors.balance === undefined ? undefined : 'settings-balance-error'}
            onChange={(e) => {
              props.onChange({ ...values, balance: e.target.value });
            }}
          />
        </Field>
        <Field id="settings-date" label="Saldo a fecha de" error={errors.date}>
          <input
            id="settings-date"
            type="date"
            value={values.date}
            aria-describedby={errors.date === undefined ? undefined : 'settings-date-error'}
            onChange={(e) => {
              props.onChange({ ...values, date: e.target.value });
            }}
          />
        </Field>
      </div>
      {props.formError !== undefined && (
        <p className="form-error" role="alert">
          {props.formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={props.busy}>
          Guardar saldo inicial
        </button>
        {props.saved && <span className="saved-note">Guardado.</span>}
      </div>
    </form>
  );
}

/** The "Resumen" screen: a year month by month, and the initial savings balance. */
export function SummaryPage({ api = defaultApi }: { api?: ApiClient }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [summary, setSummary] = useState<YearSummaryDto | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  /** Kept apart from `loadError`: a good summary load must not hide a failed settings load. */
  const [settingsError, setSettingsError] = useState<string | undefined>();
  const [reloads, setReloads] = useState(0);

  const [form, setForm] = useState<SettingsFormValues>({ balance: '', date: '' });
  const [errors, setErrors] = useState<Partial<Record<SettingsField, string>>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.settings().then(
      (settings: SettingsDto) => {
        setForm(formFromSettings(settings));
      },
      (error: unknown) => {
        setSettingsError(messageOf(error));
      },
    );
  }, [api]);

  useEffect(() => {
    let active = true;
    api.yearSummary(year).then(
      (next) => {
        if (active) {
          setSummary(next);
          setLoadError(undefined);
        }
      },
      (error: unknown) => {
        if (active) {
          setLoadError(messageOf(error));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [api, year, reloads]);

  const save = async (values: SettingsFormValues) => {
    const result = validateSettingsForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setSaved(false);
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(undefined);
    try {
      await api.saveSettings(result.payload);
      setSaved(true);
      setReloads((n) => n + 1);
    } catch (error) {
      const mapped = mapSettingsApiErrors(error instanceof ApiError ? error.fields : {});
      setErrors(mapped);
      setFormError(Object.keys(mapped).length === 0 ? messageOf(error) : undefined);
      setSaved(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <h1>Resumen</h1>
      <p className="hint">
        Ingresos, gastos, amortizaciones y ahorro de cada mes del año, con el ahorro acumulado. Solo
        cuentan los movimientos confirmados.
      </p>

      <nav className="month-picker" aria-label="Año">
        <button
          type="button"
          aria-label="Año anterior"
          onClick={() => {
            setYear(year - 1);
          }}
        >
          ←
        </button>
        <span className="month-label year-label">{year}</span>
        <button
          type="button"
          aria-label="Año siguiente"
          onClick={() => {
            setYear(year + 1);
          }}
        >
          →
        </button>
      </nav>

      {[loadError, settingsError].map(
        (message) =>
          message !== undefined && (
            <p key={message} className="form-error" role="alert">
              {message}
            </p>
          ),
      )}

      {summary !== undefined && <YearTable summary={summary} />}

      <SettingsForm
        values={form}
        errors={errors}
        formError={formError}
        saved={saved}
        busy={busy}
        onChange={(values) => {
          setForm(values);
          setErrors({});
          setSaved(false);
        }}
        onSubmit={(values) => void save(values)}
      />
    </main>
  );
}
