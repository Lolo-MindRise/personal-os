# Plan 0003 status

Integration branch: `integration/0003-data-safety-and-daily-use`

| Task | Depends on | State | PR | Notes |
|------|-----------|-------|----|-------|
| 00 rehearse-migration | – | pending | – | alone, first; agents never run the script directly (guard) |
| 01 trash-core | 00 | pending | – | owns the migration slot (0009); touches most server readers |
| 02 csv-account-column | – | pending | – | client only; parallel with 01 |
| 03 trash-ui | 01 | pending | – | |
| 04 budget-alerts | 01 | pending | – | parallel with 03 |
| 05 importer-accounts | 01 | pending | – | shares `importApi.ts` with 01 |
| 06 reconciliation | 01, 03 | pending | – | owns the migration slot (0010) |
| 07 quick-add | 01 | pending | – | |

Order: 00; then 01 and 02; then 03 and 04; then 05 and 06; then 07 (or earlier when a slot is free and files do not overlap).
Only one task with a migration at a time (drizzle journal conflicts).
