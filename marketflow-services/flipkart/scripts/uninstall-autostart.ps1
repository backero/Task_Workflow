# Removes the "FKPulse Scheduler" and "FKPulse Dashboard" scheduled tasks.
foreach ($name in 'FKPulse Scheduler', 'FKPulse Dashboard') {
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $name -Confirm:$false
        Write-Host "Removed '$name'."
    } else {
        Write-Host "'$name' was not registered."
    }
}
