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
| 0005 | #10 | approve | 0/0/2 | pending | Both minors fixed (English Zod messages reaching the UI; `debtId` error not shown). Brief was on open PR #9. |
