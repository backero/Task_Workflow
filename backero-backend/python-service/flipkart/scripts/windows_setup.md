# Windows Setup — Task Scheduler (24/7 autostart)

Registers FK-Pulse's scheduler and dashboard to start automatically at
logon and restart if they crash. Assumes the project is at
`C:\fk-pulse` and Python is on PATH (adjust paths as needed).

## 0. One-time install (PowerShell)

```powershell
cd C:\fk-pulse
pip install -r requirements.txt
playwright install chromium
copy config.example.yaml config.yaml
python scripts\init_db.py
```

## 1. Register tasks from an elevated PowerShell (exact commands)

```powershell
# Scheduler: API sync + rank scans + daily digest
schtasks /Create /TN "FK-Pulse Scheduler" /SC ONLOGON /RL HIGHEST /F `
  /TR "cmd /c cd /d C:\fk-pulse && python run_scheduler.py >> C:\fk-pulse\scheduler.out.log 2>&1"

# Dashboard: Streamlit UI on http://localhost:8501
schtasks /Create /TN "FK-Pulse Dashboard" /SC ONLOGON /RL HIGHEST /F `
  /TR "cmd /c cd /d C:\fk-pulse && python run_dashboard.py >> C:\fk-pulse\dashboard.out.log 2>&1"
```

Start them now without rebooting:

```powershell
schtasks /Run /TN "FK-Pulse Scheduler"
schtasks /Run /TN "FK-Pulse Dashboard"
```

## 2. Equivalent click-by-click (Task Scheduler GUI)

For each of the two tasks (Scheduler / Dashboard):

1. Win + R → `taskschd.msc` → **Create Task…** (not "Basic Task").
2. **General** tab:
   - Name: `FK-Pulse Scheduler` (resp. `FK-Pulse Dashboard`)
   - Select **Run only when user is logged on** (Streamlit needs an
     interactive session; use "Run whether user is logged on or not" only
     if you understand the credential implications)
   - Tick **Run with highest privileges**.
3. **Triggers** tab → New… → **Begin the task: At log on** → OK.
4. **Actions** tab → New… → Action: **Start a program**
   - Program/script: `cmd.exe`
   - Add arguments:
     `/c cd /d C:\fk-pulse && python run_scheduler.py >> C:\fk-pulse\scheduler.out.log 2>&1`
     (use `run_dashboard.py` / `dashboard.out.log` for the second task)
   - Start in: `C:\fk-pulse`
5. **Settings** tab:
   - Tick **If the task fails, restart every:** `1 minute`, attempts: `3`
   - Untick **Stop the task if it runs longer than:** (must run 24/7)
   - **If the running task does not end when requested:** Do not stop.
6. OK → right-click the task → **Run** to start it immediately.

## 3. Verify

```powershell
schtasks /Query /TN "FK-Pulse Scheduler" /V /FO LIST | findstr /C:"Status"
curl http://localhost:8501           # dashboard answers
type C:\fk-pulse\fkpulse.log         # scheduler job activity
```

Open http://localhost:8501 in a browser — the top banner should show the
current `mode` and last-sync time.

## 4. Daily database backup task

```powershell
mkdir C:\fk-pulse\backups
schtasks /Create /TN "FK-Pulse Backup" /SC DAILY /ST 03:30 /F `
  /TR "cmd /c copy /y C:\fk-pulse\fk_pulse.db C:\fk-pulse\backups\fk_pulse_%DATE:~10,4%%DATE:~4,2%%DATE:~7,2%.db & copy /y C:\fk-pulse\vault.enc C:\fk-pulse\backups\"
```

(DATE token slicing assumes a `dd/MM/yyyy` regional format; verify once
with `echo %DATE%` and adjust the offsets if your locale differs, or use
a small PowerShell backup script instead.)

## 5. Updating / removing

```powershell
schtasks /End /TN "FK-Pulse Scheduler"
schtasks /End /TN "FK-Pulse Dashboard"
git pull && pip install -r requirements.txt
schtasks /Run /TN "FK-Pulse Scheduler"
schtasks /Run /TN "FK-Pulse Dashboard"

# remove entirely:
schtasks /Delete /TN "FK-Pulse Scheduler" /F
schtasks /Delete /TN "FK-Pulse Dashboard" /F
schtasks /Delete /TN "FK-Pulse Backup" /F
```

## Notes

- The master password for the vault is entered interactively; if you run
  live mode unattended, keep the vault file backed up — there is no
  password recovery.
- Logs: `fkpulse.log` (scheduler, structured), plus the redirected
  `scheduler.out.log` / `dashboard.out.log` console output.
- If the PC reboots after Windows Update, both tasks come back at logon.
  Consider enabling automatic logon or running under a dedicated user if
  the machine is shared.
