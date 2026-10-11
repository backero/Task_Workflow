#!/usr/bin/env python3
"""SD Pulse — one-command startup.  python run.py  ->  http://127.0.0.1:8300"""
import os, sys, webbrowser, threading, time

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
os.chdir(BASE)
os.makedirs(os.path.join(BASE, "data"), exist_ok=True)

from dotenv import load_dotenv
load_dotenv(os.path.join(BASE, ".env"))

def _open():
    time.sleep(2)
    webbrowser.open("http://127.0.0.1:8300")

if __name__ == "__main__":
    import uvicorn
    if os.environ.get("SD_NO_BROWSER") != "1":
        threading.Thread(target=_open, daemon=True).start()
    uvicorn.run("app.main:app", host="127.0.0.1", port=8300, reload=False)
