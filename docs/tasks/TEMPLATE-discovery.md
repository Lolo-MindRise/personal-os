# Task NNNN: Discovery of an inherited repository

**Branch:** `agent/discovery/initial-report` (or uncommitted, in supervised mode)
**ADRs:** 0008

## Goal

Understand a repository nobody in this system built, before building on it.
Read only: **no changes to code, configuration or dependencies.** The only
output is `docs/discovery/report.md`.

## Scope

Write the report with these sections, each based on evidence (file paths,
command output), never on assumptions:

1. **Stack and versions:** languages, frameworks, runtime, package manager,
   database, hosting (e.g. Vercel config).
2. **How to run it:** try install, build and tests on a clean copy; record
   exactly what worked and what failed, with the error.
3. **Structure:** a short map of folders and their purpose.
4. **Data model:** tables or collections and their relationships.
5. **External services and configuration:** environment variable **names**
   and what uses them. **Never print or copy a secret value.**
6. **Tests and CI:** what exists, what passes, coverage of critical paths.
7. **Documentation versus reality:** every place where the docs say one
   thing and the code another.
8. **Security:**
   - Secrets in the **whole git history**: if `gitleaks` is installed, run
     `gitleaks detect --source . --log-opts="--all" --redact`; otherwise
     search `git log -p --all` for common key patterns. Report only commit,
     file and type of secret, **never the value**. Every finding must be
     rotated, even if the file was later deleted.
   - Real personal or client data committed anywhere (fixtures, seeds, dumps).
   - Dependency audit summary.
9. **Risks**, ranked by impact.
10. **Proposed baseline decisions** for Manuel to confirm as ADRs (stack,
    default branch, autonomy profile, protected paths, how to run locally).
11. **Questions** for Manuel or the previous developer.

## Out of scope

Any fix, refactor or upgrade, even an obvious one: list it under risks or
quick wins instead.

## Done when

The report exists, every section is filled or says why it could not be,
and no secret value appears anywhere in it.
