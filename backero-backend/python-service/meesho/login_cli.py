"""Standalone CLI trigger for Meesho's OTP login flow.

app.connector.meesho_connector.start_login() was originally only reachable via
a Flask route (the Meesho service no longer runs a web server -- it's
scheduler-only now, see run_scheduler.py). This script calls it directly:
opens a real, visible Chromium window on this machine, you sign in yourself
with your mobile OTP, and the resulting session is saved under data/session
for auto_pull to reuse. This script never sees your OTP or credentials.

Usage: python login_cli.py
"""
import sys
import time

from app.connector.meesho_connector import start_login, login_status, session_exists

def main() -> int:
    if session_exists():
        print("A session already exists under data/session. Logging in again will replace it.")

    start_login()
    print("Opening browser window... log in with your mobile OTP. Waiting up to 10 minutes.", flush=True)

    last_message = None
    while True:
        status = login_status()
        if status["message"] != last_message:
            print(status["message"], flush=True)
            last_message = status["message"]
        if not status["running"]:
            break
        time.sleep(2)

    if status["logged_in"]:
        print("SIGNED_IN - session saved. The scraper's next auto_pull cycle will use it.", flush=True)
        return 0
    print("NOT_SIGNED_IN - nothing saved. Run this again to retry.", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())
