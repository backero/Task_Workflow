@echo off
REM Meesho Seller Command Center - Windows launcher
REM Double-click this file. It installs dependencies (first run) and starts the app.
cd /d "%~dp0"

echo Installing dependencies (only needed the first time)...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo Python was not found. Please install Python 3.10 or newer from
    echo https://www.python.org/downloads/ and tick "Add Python to PATH".
    pause
    exit /b 1
)
python -m playwright install chromium

echo.
echo Starting Meesho Seller Command Center...
echo Open http://localhost:8000 in your browser.
echo.
python run.py
pause
