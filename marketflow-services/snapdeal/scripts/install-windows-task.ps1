# Registers a Windows Scheduled Task that starts SD Pulse (FastAPI app + snapdeal_keeper) at logon.
# snapdeal_keeper drives a visible Chrome window for sign-in, so this must run in the logged-in user's desktop
# session ("Interactive") - same pattern as amazon/edge-agent/scripts/install-windows-task.ps1.
# Run from this folder:  powershell -ExecutionPolicy Bypass -File scripts\install-windows-task.ps1
$ErrorActionPreference = 'Stop'

$taskName = 'SD Pulse'
$projectDir = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectDir 'venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "venv not found at $python - create it first (python -m venv venv; pip install -r requirements.txt)." }

$logDir = Join-Path $projectDir 'data'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir 'sd_stdout.log'

$argument = '/c ""' + $python + '" run.py >> "' + $log + '" 2>&1"'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $argument -WorkingDirectory $projectDir

$user = "$env:USERDOMAIN\$env:USERNAME"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings -Description 'Starts SD Pulse (dashboard + sync + snapdeal_keeper) at logon. Remove with: Unregister-ScheduledTask' -Force | Out-Null

Write-Host "Registered '$taskName' (starts at logon for $user)."
Write-Host "Start it now without logging out:  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Logs:                              $log"
