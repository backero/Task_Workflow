# Registers two Windows Scheduled Tasks so FK-Pulse comes back by itself after a reboot:
#   "FKPulse Scheduler"  - API sync, public rank scans, Seller Hub reads, daily digest
#   "FKPulse Dashboard"  - the Streamlit dashboard on http://localhost:8501
# Both start when THIS user logs in, run hidden, restart themselves if they crash, and log to fkpulse\logs\.
# Run from the fkpulse folder:   powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
# Remove with:                   powershell -ExecutionPolicy Bypass -File scripts\uninstall-autostart.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'venv\Scripts\python.exe'))) { throw "No venv found in $root - create it and 'pip install -r requirements.txt' first." }
$vbs = Join-Path $PSScriptRoot 'run-hidden-python.vbs'
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null

$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

function Register-Fk($name, $script, $logName, $description) {
    $log = Join-Path $logDir $logName
    $argument = '//B //Nologo "' + $vbs + '" "' + $root + '" "' + $script + '" "' + $log + '"'
    $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument $argument -WorkingDirectory $root
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $description -Force | Out-Null
    Write-Host "Registered '$name'  (log: $log)"
}

Register-Fk 'FKPulse Scheduler' 'run_scheduler.py' 'scheduler.log' 'FK-Pulse: API sync, rank scans, Seller Hub reads, daily digest. Started at logon.'
# --server.headless true: don't pop a browser tab open at every logon
Register-Fk 'FKPulse Dashboard' 'run_dashboard.py --server.headless true --server.port 8501' 'dashboard.log' 'FK-Pulse Streamlit dashboard (http://localhost:8501). Started at logon.'

Write-Host ""
Write-Host "Start them now without logging out:"
Write-Host "  Start-ScheduledTask -TaskName 'FKPulse Scheduler'; Start-ScheduledTask -TaskName 'FKPulse Dashboard'"
Write-Host "Note: the API sync needs FKPULSE_VAULT_PASSWORD (see scripts\set_credentials.py) - until then the dashboard shows a red banner saying so."
