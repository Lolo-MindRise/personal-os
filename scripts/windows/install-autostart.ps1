<#
.SYNOPSIS
  Starts personal-os automatically when you sign in to Windows.

.DESCRIPTION
  Registers a Task Scheduler task for the CURRENT user (no administrator rights) that runs the
  existing start script inside WSL at logon, with no visible window:
      wsl.exe -- bash -lc '$HOME/apps/personal-os/scripts/start.sh'
  Windows may flash a console window for a moment at logon before it is hidden; that is normal.
  Running it again replaces the task, so there is always exactly one. It prints what it did.
  Undo it with uninstall-autostart.ps1. The task only starts the server; open the installed
  app (or http://localhost:<port>) yourself.

.PARAMETER AppDir
  The instance directory INSIDE WSL. Keep the single quotes: $HOME must reach bash unexpanded.

.PARAMETER Distribution
  A WSL distribution name (see `wsl -l -v`). Empty means your default distribution.

.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-autostart.ps1
#>
[CmdletBinding()]
param(
    [string]$AppDir = '$HOME/apps/personal-os',
    [string]$Distribution = ''
)

$ErrorActionPreference = 'Stop'
$TaskName = 'PersonalOS-Autostart'

try {
    # The name ends up inside the task's command line: allow only what a distribution name has.
    if ($Distribution -ne '' -and $Distribution -notmatch '^[\w.-]+$') {
        throw "Invalid -Distribution '$Distribution': use the name shown by 'wsl -l -v' (letters, digits, dot, dash, underscore)."
    }

    # Same for the directory: no spaces or quotes, which would break the task's command line.
    if ($AppDir -notmatch '^[\w$./-]+$') {
        throw "Invalid -AppDir '$AppDir': use a path inside WSL without spaces or quotes, for example '`$HOME/apps/personal-os'."
    }

    $user = "$env:USERDOMAIN\$env:USERNAME"

    # wsl.exe through a hidden PowerShell. The inner command uses single quotes so that bash,
    # not PowerShell, expands $HOME.
    $distroArgs = ''
    if ($Distribution -ne '') {
        $distroArgs = "-d $Distribution "
    }
    $command = "wsl.exe $distroArgs-- bash -lc '" + $AppDir + "/scripts/start.sh'"
    $argument = '-NoProfile -NonInteractive -WindowStyle Hidden -Command "' + $command + '"'

    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    # Interactive + Limited: runs as you, only while you are signed in, without elevation.
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    # -Force replaces a task with the same name, which keeps this script idempotent.
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings `
        -Description 'Starts personal-os inside WSL when you sign in.' -Force | Out-Null

    $count = @(Get-ScheduledTask -TaskName $TaskName).Count
    if ($null -ne $existing) {
        Write-Host "Task '$TaskName' already existed: replaced it with the current settings."
    } else {
        Write-Host "Task '$TaskName' created."
    }
    Write-Host "  User:    $user (no administrator rights)"
    Write-Host '  Trigger: when you sign in to Windows'
    Write-Host "  Runs:    $command"
    Write-Host "There is $count task with that name."
    Write-Host ''
    Write-Host 'Try it now without signing out:  Start-ScheduledTask -TaskName PersonalOS-Autostart'
    Write-Host 'Remove it later with:            uninstall-autostart.ps1'
} catch {
    Write-Host "Could not register the task: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
