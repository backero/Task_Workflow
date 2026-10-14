# Meesho Seller Command Center

A local dashboard for Meesho sellers. It runs entirely on your office PC —
your data stays on your computer — and shows listings, quality scores,
recommendations and alerts in one place.

## Setup (Windows, no technical knowledge needed)

1. **Install Python 3.10 or newer**
   - Go to https://www.python.org/downloads/ and click the big yellow
     "Download Python" button.
   - Run the installer. **Important:** on the first screen, tick the box
     **"Add Python to PATH"**, then click "Install Now".

2. **Start the app**
   - Double-click **`run.bat`** in this folder.
   - The first time, it will download some components (this can take a few
     minutes — a black window will show progress). Later starts are instant.

3. **Open the dashboard**
   - Open your web browser and go to: **http://localhost:8000**

That's it. The app starts in **demo mode** with realistic sample data so you
can explore every screen safely.

## Using your real data

Open the **Sources** tab in the dashboard:

- **Manual mode** — export a catalog/orders report (CSV or Excel) from the
  Meesho Supplier Panel and upload it here.
- **Auto mode** — click *Connect*. A browser window opens on THIS computer;
  log in with your mobile OTP (we never see or store your OTP). After that
  the app refreshes your numbers automatically.
- **Demo mode** — sample data; use *Regenerate demo data* to reset it.

## Settings

The **Settings** tab lets you tune thresholds (quality-score warning level,
low-stock level, etc.) and enable email/WhatsApp alerts. These are stored in
`data/config.yaml` — you can also edit that file with Notepad while the app
is stopped.

## Troubleshooting

- *"Python was not found"* → reinstall Python and tick "Add Python to PATH".
- *Port already in use* → close other copies of the app (black windows), then
  double-click `run.bat` again.
- Everything is stored in the `data/` folder next to `run.bat`. Deleting it
  resets the app to a fresh demo.

## For developers

- `python run.py` — entry point (serves on 127.0.0.1:8000).
- Stack: Flask + sqlite3 (stdlib) + APScheduler + Playwright (auto mode) +
  Chart.js (CDN). See `SPEC.md` for the full architecture contract.
