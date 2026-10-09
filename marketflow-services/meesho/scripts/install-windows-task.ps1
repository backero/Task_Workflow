# Registers a Windows Scheduled Task that starts the Meesho Command Center (Flask app + meesho_keeper) at logon.
# meesho_keeper drives a visible Chrome window for sign-in, so this must run in the logged-in user's desktop
# session ("Interactive") - same pattern as amazon/edge-agent/scripts/install-windows-task.ps1.
# Run from this folder:  powershell -ExecutionPolicy Bypass -File scripts\install-windows-task.ps1
$ErrorActionPreference = 'Stop'

$taskName = 'Meesho Command Center'
$projectDir = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectDir 'venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "venv not found at $python - create it first (python -m venv venv; pip install -r requirements.txt)." }

$logDir = Join-Path $projectDir 'data'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir 'meesho_stdout.log'

$argument = '/c ""' + $python + '" run_app.py >> "' + $log + '" 2>&1"'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $argument -WorkingDirectory $projectDir

$user = "$env:USERDOMAIN\$env:USERNAME"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings -Description 'Starts the Meesho Command Center (dashboard + auto-pull + meesho_keeper) at logon. Remove with: Unregister-ScheduledTask' -Force | Out-Null

Write-Host "Registered '$taskName' (starts at logon for $user)."
Write-Host "Start it now without logging out:  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Logs:                              $log"
