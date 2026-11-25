# UI glossary (es-ES)

One name per concept. Every label, button, message and heading uses these words. When a new
screen needs a concept, add it here first.

## Screens (sidebar)

| Concept | UI name |
|---|---|
| Home | Inicio |
| Daily | Día a día → Movimientos, Importar |
| Planning | Planificar → Presupuesto, Fijos, Proyección |
| Tracking | Seguimiento → Deudas, Informes, Objetivos y resumen, Hitos |
| Settings | Ajustes → Categorías, Copias |

## Things

| Concept | UI name | Do not use |
|---|---|---|
| An income, expense or repayment of money that happened | movimiento | transacción, apunte |
| Income / expense / extra debt repayment | ingreso / gasto / amortización | cobro, pago |
| What a movement is about (text) | concepto | descripción |
| Amount of money | importe | cantidad, monto |
| A category of movements | categoría | etiqueta |
| Where money is kept (a movement belongs to one) | cuenta | banco, monedero |
| Account type: bank account / cash in hand / savings account | cuenta bancaria / efectivo / ahorro | corriente, caja |
| The account every movement gets unless another is chosen | Principal | por defecto, general |
| A monthly recurring income or expense | fijo (plural fijos) | gasto fijo, recurrente, suscripción |
| A fixed item waiting to be confirmed this month | pendiente | previsto |
| The amount and date a fixed item is expected to have | importe previsto, fecha prevista | |
| Turn a pending fixed item into a movement | confirmar | aprobar, registrar |
| Skip a fixed item for one month | saltar | omitir |
| The planned monthly amount for a category | presupuesto | límite |
| Budget minus actual | diferencia | desvío |
| Money owed | deuda | préstamo (only in fixture names) |
| A debt's regular payment | cuota | mensualidad |
| A debt's recorded balance and date | saldo registrado, fecha del saldo | |
| Balance computed from the recorded one | saldo estimado | |
| Money set aside, month by month | ahorro | |
| Savings summed over time | ahorro acumulado | ahorro total |
| Savings plus what is still pending this month | ahorro previsto | |
| Starting amount of savings and its date | saldo inicial | capital inicial |
| A savings target with an amount and a date | objetivo | meta |
| A dated step towards the goals | hito | tarea |
| Year table of monthly figures | resumen (del año) | informe |
| Screen with spending charts over several months | Informes | reportes, estadísticas |
| One category's spending month by month, as a line chart | evolución de una categoría | tendencia, histórico |
| Table with the figures of a chart, folded under it | Ver los datos | detalle, tabla de datos |
| Number of months an Informes screen covers | periodo | rango |
| Average spending of a category per month over the period | media mensual | promedio |
| Spending change of a category versus the previous period | cambio respecto al periodo anterior | variación, desvío |
| What the money will do in the future | proyección | previsión |
| Download movements as a spreadsheet file (CSV) | Exportar mes / Exportar mes (categoría) / Exportar resultados | descargar, volcar |
| Automatic safety copies of the data | copias | backups, respaldos |
| Where a copy is also stored | copia de reserva | espejo (in user text) |
| Oldest backup you can still restore | copia más antigua | backup más viejo |
| Which backups are kept, and why | qué se conserva | retención, tiers |

## Verbs on buttons and links

| Action | Verb |
|---|---|
| Create something | Añadir … (never "Crear", "Registrar", "Nuevo") |
| Save a form | Guardar … (what: "Guardar movimiento") |
| Change an existing thing | Editar |
| Remove | Eliminar |
| Close a form without saving | Cancelar |
| Go to the filtered screen behind a figure | the name of the thing ("Supermercado"), or "Ver …" |
| Clear a filter | Quitar filtro |
| Month-over-month change (amounts) | `+120,00 € respecto a octubre`, `-50,00 € respecto a octubre` |
| Month-over-month change (goal progress) | `+5 puntos respecto a octubre` (`+1 punto`) |
| Month-over-month, no difference | `Sin cambios respecto a octubre` (no previous data: show nothing) |

## Style

- Sentence case everywhere; no all-caps.
- Amounts: `1.234,56 €` through the money helpers. Dates: `dd/mm/aaaa`. Months: `enero de 2026`
  (or `01/2026` inside tables).
- Errors say what happened and how to fix it.
- Empty states say what is missing and link to where it is set up.
