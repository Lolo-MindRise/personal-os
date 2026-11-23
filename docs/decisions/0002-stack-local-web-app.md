# ADR-0002: Stack — self-hosted local web app (TypeScript + SQLite)

**Status:** Accepted
**Date:** 2026-11-23
**Deciders:** Manuel Cardoso

## Context

The app is for personal use on Manuel's PC only. Financial data must never
leave that machine. It is opened in the browser (`localhost`); a native
window is not required.

The stack must also serve the development system (ADR-0001): agents must be
able to build and test it unattended, including in cloud sessions with no
display, and Manuel must be able to read and supervise the code.

## Decision

A single Node.js process that serves both the API and the built frontend,
bound to `127.0.0.1`, with data in one SQLite file outside the repository.

| Layer | Choice |
|-------|--------|
| Runtime | Node.js LTS |
| Language | TypeScript, `strict` mode, everywhere |
| Frontend | React + Vite |
| Backend | Fastify (serves the API and the built frontend) |
| Database | SQLite via `better-sqlite3`, schema and migrations with Drizzle ORM |
| Validation | Zod, shared between frontend and backend |
| Tests | Vitest (unit, integration), Playwright headless (end-to-end) |
| Package manager | npm |

Every package above still needs its entry in `docs/dependencies.md` in the
PR that adds it (ADR-0001).

## Options Considered

Weighted score (1–5): agent productivity and headless testing 25 %,
simplicity 20 %, readability for Manuel 15 %, data stays local 15 %,
native feel 10 %, future flexibility 15 %.

| Option | Score | Main reason for / against |
|--------|-------|---------------------------|
| A. Local web app, TypeScript + SQLite | **4.65** | Most reliable for agents, fewest moving parts, can later be opened from another device at home or wrapped in Tauri |
| B. Desktop app, Tauri | 3.75 | Best native feel, but Rust core and harder CI/cloud builds |
| C. Desktop app, Electron | 3.80 | Familiar web stack, but heavy and adds packaging work |
| D. .NET (C#) | 3.95 | Most readable for Manuel (Unity background), less efficient for agents |

## Rules that come with this decision

1. **Real data lives outside the repository.** The production database path
   comes from the `PERSONAL_OS_DATA_DIR` environment variable. Agents never
   read, write or reference that location. Development and tests use
   fixture databases inside the repo (gitignored when generated).
2. **Local only.** The server binds to `127.0.0.1`. Exposing it to the home
   network is a future decision with its own ADR (authentication first).
3. **Money is stored as integer cents.** Never floating point. Currency EUR.
4. **Dates are stored as ISO 8601.** Display format is a UI concern.
5. **Daily backups** of the SQLite file using SQLite's online backup, with
   rotation. Destination and scheduling depend on the OS and are defined in
   the first operations task.

## Trade-off Analysis

A gives up a native window and icon in exchange for the setup where agents
are most productive and tests run everywhere. That trade can be reversed
later: the same app can be wrapped in Tauri without a rewrite. D was the
strongest alternative because Manuel reads C# comfortably; it lost on agent
throughput and ecosystem weight for this kind of app.

## Consequences

- Easier: unattended development in cloud sessions, end-to-end tests in CI,
  later access from another device at home.
- Harder: Manuel starts the app with a shortcut instead of a regular
  installed program; no offline installer.
- Revisit: native wrapper (Tauri) if the browser experience falls short;
  home-network access when a second user joins.

## Action Items

1. [ ] Scaffold the project (first agent task, after branch protection and CI exist).
2. [ ] Define the data model from the existing spreadsheet: movements,
       categories, monthly budget, debts, milestones.
3. [ ] Startup shortcut and backup job for Manuel's OS.
