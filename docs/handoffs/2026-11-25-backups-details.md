# Handoff 2026-11-25: Backups screen details (plan 0001, task 03)

Branch `agent/ui/03-backups-details` (from `integration/0001-polish`).

## Done
- Copias screen: retention tiers (local, and mirror when it is ok), mirror oldest copy, and a
  "Cómo restaurar" section pointing to the README "Restore a backup" (no steps duplicated).
- All data came from the existing `/api/backups/status` (`tiers`, `oldestBackupAt`): no API change.
  The oldest date is the oldest file stamp, the same set `restore.sh` lists.
- Glossary: copia más antigua, qué se conserva.
- Tests: fixture payloads for mirror ok, mirror error, no backups yet.

## Not done
- The `reviewer` subagent could not be run from this implementer session (no tool to launch it).

## Decisions taken
- Mirror tiers/oldest shown only when the mirror state is `ok`.
