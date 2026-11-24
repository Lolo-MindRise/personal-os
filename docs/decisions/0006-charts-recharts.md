# ADR-0006: Charts with Recharts

**Status:** Accepted
**Date:** 2026-11-24
**Deciders:** Manuel Cardoso

## Context

The home dashboard needs several chart types (bars, a line over bars,
horizontal comparison bars, progress bars) with axes, legends and tooltips,
so Manuel can understand his financial situation at a glance. Until now the
only charts were simple CSS bars, built by hand because the overnight run
was not allowed to add dependencies.

## Decision

Use **Recharts** for charts. Simple progress bars may stay as plain CSS.

## Options Considered

| Dimension (weight) | A. Hand-drawn SVG | B. Recharts |
|---|---|---|
| Visual quality and interactivity (30 %) | 3 | 5 |
| Reliability of agent work (25 %) | 3 | 5 |
| No new dependencies (20 %) | 5 | 3 |
| Maintenance (15 %) | 3 | 4 |
| Bundle size (10 %) | 5 | 3 |
| **Weighted total** | **3.60** | **4.25** |

Several chart types with axes, legends and tooltips are a lot of hand-written
code, each one a new place to fail. Recharts is the most widely used React
chart library and well known to the agents. The dependency is controlled by
the existing safeguards: `docs/dependencies.md`, `npm audit` and the
install-script allow list (task 0010).

## Consequences

- Easier: rich, consistent charts with little code.
- Harder: one more runtime dependency and a larger frontend bundle.
- Rule: Recharts and anything it pulls in must not need install scripts;
  if it does, stop and ask.

## Action Items

1. [ ] Task 0011: home dashboard.
