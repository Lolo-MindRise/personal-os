# Review log

One row per task (ADR-0004). Findings by severity as
blocker / major / minor. "Findings by Manuel" counts issues Manuel raised on
the PR after the reviewer ran; it measures what the reviewer missed.

| Task | PR | Reviewer verdict | Findings (B/M/m) | Findings by Manuel after review | Notes |
|------|----|------------------|------------------|---------------------------------|-------|
| 0001 | #2 | before reviewer | – | none recorded | Walking skeleton + CI. |
| 0002 | #4 | before reviewer | – | none recorded | Agent permissions; deviation on `.env.example`. |
| 0003 | #6 | approve | 0/0/0 | pending | First reviewed task; reviewer ran as `opus` agent from `reviewer.md` (not yet registered in session). |
| 0004 | #8 | changes required → fixed | 0/1/4 | pending | Major (SIGTERM left server running) fixed. Minors: 3 fixed, 1 deviation (`git fetch` rule, classifier denied the settings edit). |
| 0005 | #10, fix in #11 | approve; approve on two re-reviews after the fix | 0/0/2, 0/0/2, 0/0/2 (3 passes) | 1 | Manuel's manual test found a blank page in `npm run dev` (`/api.ts` 404: Vite proxy key `/api` is a prefix match). Missed by tests and by the reviewer: nothing in the suite goes through the dev server. #10 was merged before the fix; fixed in #11 with a regression test. First review's 2 minors fixed (English Zod messages; `debtId` error); re-review's 2 minors fixed (recursive glob; test that the config uses `apiProxy`). |
| 0006 | #13 | approve | 0/0/3 | pending | First task with browser tests. 3 minors fixed (CI report never uploaded; dialog assert; temp dir on seed failure). Dev test proven to fail with the old proxy key; capitalization tests proven by mutation. |
| 0007 | #15 | changes required, then approve | 1/0/3 then 0/0/2 | pending | First task with a major caught by the reviewer in UI state (error cleared by reload). Recurring items. All findings fixed; CLAUDE.md line not added (classifier denied the edit, Deviation proposed). Projected savings also subtracts pending repayments (interpretation of the brief). |
| 0008-1 | (overnight 1/6) | changes required → fixed | 1/0/4 | pending | Categories. Blocker was only the handoff missing from the reviewed commit (written after it); N+1 minor fixed; other minors recorded as decisions. |
| 0008-2 | (overnight 2/6) | changes required → fixed | 0/1/5 | pending | Backups. Major: mirror mkdir was recursive (an unmounted disk would silently fill the main one); fixed with a mutation-checked test. Minors fixed. |
| 0008-3 | (overnight 3/6) | changes required → fixed | 0/2/4 | pending | Budget. Major: totals mixed income/repayment rows into the expense totals, and a test asserted it. Fixed; 2 minors fixed, 2 left and recorded. |
| 0008-4 | (overnight 4/6) | changes required → fixed | 0/1/2 | pending | Debts. Major: the `debtId: null` sent when a linked repayment changes kind was untested; now a pure helper plus unit and API tests. Minors fixed (handoff section order, API bounds). |
