# ADR-0003: Operations — Windows host, everything runs in WSL Ubuntu

**Status:** Accepted
**Date:** 2026-11-23
**Deciders:** Manuel Cardoso

## Context

Manuel's PC runs Windows, with Ubuntu 26.04 under WSL (opened from the
terminal). The app (ADR-0002) runs only on this PC. Agents may also work on
this PC through Remote Control (ADR-0001). We need to define where code,
the real instance and the real data live, how the app is started, how it is
updated and how data is backed up.

To verify once: `wsl -l -v` in PowerShell must show the Ubuntu distro with
VERSION 2. Note the exact distro name; the startup shortcut uses it.

## Decision

Everything runs inside WSL Ubuntu, on the Linux filesystem (not under
`/mnt/c`, which is much slower for Node tooling). Windows is only the place
where Manuel clicks a shortcut and uses the browser.

### Directory layout

| Purpose | Path (WSL) | Who touches it |
|---------|-----------|----------------|
| Development clone | `~/dev/personal-os` | Agents and Manuel |
| Real instance (built from `main`) | `~/apps/personal-os` | Deploy script only |
| Real data (`PERSONAL_OS_DATA_DIR`) | `~/.local/share/personal-os` | The real instance only |
| Local backups | `~/.local/share/personal-os/backups` | The real instance only |
| Backup mirror on second SSD | `/mnt/g/apps_personales/personal_os/backups` (`G:\apps_personales\personal_os\backups`) | The real instance only |

Agents never read, write or reference the last four locations.

### Startup

A Windows desktop shortcut runs the start script inside WSL and opens the
browser:

```
wsl.exe -d <distro> -- bash -lc "~/apps/personal-os/scripts/start.sh"
```

The server binds to `127.0.0.1` on a configurable port (default `5310`).
WSL2 forwards `localhost` to Windows, so the browser on Windows reaches it.

### Updating the real instance

Manual, after Manuel merges to `main`: `scripts/deploy-local.sh` pulls
`main` into `~/apps/personal-os`, installs exact dependencies (`npm ci`),
builds, **takes a backup**, then runs database migrations. If any step
fails, the previous build and the backup remain.

### Backups

Run by the app itself, not by cron (WSL shuts down when idle, so scheduled
jobs inside it are unreliable):
- On every app start, and every 24 h while it runs.
- Before every migration.
- SQLite online backup API, so a backup is consistent while the app runs.
- Rotation: keep 14 daily copies locally and the latest 7 in the mirror on
  the second SSD (`G:`), which is a separate physical disk.
- The mirror path is configurable (`PERSONAL_OS_BACKUP_MIRROR_DIR`). If the
  mirror is unreachable, the app logs a visible warning and keeps running.

### Power settings

For local Remote Control sessions, Windows must not sleep while plugged in.
Cloud sessions remain the default for unattended work (ADR-0001 phase plan).

## Options Considered

| Dimension (weight) | Windows native | WSL Ubuntu |
|--------------------|---------------|------------|
| Claude Code, hooks and scripts compatibility (30 %) | 3 | 5 |
| Node tooling performance (20 %) | 3 | 5 |
| Daily startup convenience (20 %) | 5 | 3 |
| Backup simplicity (15 %) | 4 | 4 |
| Separation of real data from agents (15 %) | 3 | 4 |
| **Weighted total** | **3.55** | **4.30** |

Backup scheduling: cron in WSL (unreliable, WSL stops when idle), Windows
Task Scheduler (works, but splits logic across two systems), in-app
scheduler (chosen: one place, runs whenever the app is used).

## Consequences

- Easier: same environment for agents, tests and CI (Linux); real data is
  physically separated from the development clone.
- Harder: startup goes through a shortcut that calls WSL; updates are a
  deliberate manual step.
- Covered: failure of the main disk (mirror lives on a second physical SSD, `G:`).
- **Open:** both disks are in the same PC, so theft, fire or an electrical
  fault can still destroy every copy. Off-site backup (external drive or
  encrypted cloud copy) remains pending Manuel's decision.

## Action Items

1. [ ] Manuel: confirm WSL version and distro name (`wsl -l -v`).
2. [ ] Agent task: `scripts/start.sh`, `scripts/deploy-local.sh`, in-app backups.
3. [ ] Manuel: create the Windows shortcut and set power settings.
4. [ ] Manuel: decide off-site backup (outside the PC).
