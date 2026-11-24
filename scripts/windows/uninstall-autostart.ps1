<#
.SYNOPSIS
  Stops personal-os from starting automatically when you sign in to Windows.

.DESCRIPTION
  Removes the Task Scheduler task created by install-autostart.ps1 (current user, no
  administrator rights). Safe to run when the task does not exist. It prints what it did.
  It does not stop an app that is already running: use personal-os-stop.cmd for that.

.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\uninstall-autostart.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$TaskName = 'PersonalOS-Autostart'

try {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Write-Host "No task named '$TaskName': nothing to remove."
        exit 0
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    $left = @(Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue).Count
    Write-Host "Task '$TaskName' removed. Tasks left with that name: $left."
    Write-Host 'personal-os will no longer start when you sign in. An app already running keeps running.'
} catch {
    Write-Host "Could not remove the task: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
