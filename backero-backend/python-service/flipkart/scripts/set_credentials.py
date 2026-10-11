"""Re-enter the Flipkart API credentials and (optionally) make the password available to the scheduler.

Why this exists: the vault master password was lost, and a Fernet vault cannot be recovered without it. The
scheduler also needs that password to run unattended — the original runbook said "never written to disk", which
cannot work for a background job, so every sync failed for six days.

Usage (run it yourself — it asks for secrets; nothing is echoed or logged):

    python scripts/set_credentials.py --persist-password

  --persist-password  also stores the master password as a Windows *user* environment variable
                      (FKPULSE_VAULT_PASSWORD) so `run_scheduler.py` can unlock the vault without you.
                      Anything running as your Windows user can read it; that is the trade-off of unattended
                      operation on a local machine. Skip the flag to keep it strictly in your head/password manager.
  --no-verify         don't test the credentials against Flipkart after saving them.
"""
from __future__ import annotations

import argparse
import getpass
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

ENV_NAME = "FKPULSE_VAULT_PASSWORD"


def _persist_windows_user_env(name: str, value: str) -> None:
    """Write a user-level environment variable without putting the value on any command line."""
    import ctypes
    import winreg

    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment", 0, winreg.KEY_SET_VALUE) as key:
        winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)
    # tell running programs (Explorer, new terminals) the environment changed
    ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x001A, 0, "Environment", 0x0002, 5000, None)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--persist-password", action="store_true")
    ap.add_argument("--no-verify", action="store_true")
    ap.add_argument("--vault", default=str(ROOT / "vault.enc"))
    args = ap.parse_args()

    from fkpulse.vault import Vault, VaultPasswordError

    vault_path = Path(args.vault)
    if vault_path.exists():
        print(f"\nAn existing vault was found at {vault_path}.")
        known = input("Do you still know its master password? [y/N] ").strip().lower() == "y"
        if not known:
            backup = vault_path.with_name(f"{vault_path.name}.bak-{datetime.now():%Y%m%d-%H%M%S}")
            shutil.move(str(vault_path), str(backup))
            print(f"Moved the old vault to {backup.name} (kept, in case the password turns up). Creating a new one.")

    app_id = input("\nFlipkart App ID: ").strip()
    app_secret = getpass.getpass("Flipkart App Secret (hidden): ").strip()
    if not app_id or not app_secret:
        print("Both the App ID and the App Secret are required.")
        return 1

    while True:
        pw = getpass.getpass("Choose a master password for the vault (hidden): ")
        if len(pw) < 8:
            print("  Use at least 8 characters.")
            continue
        if pw != getpass.getpass("Type it again: "):
            print("  They didn't match — try again.")
            continue
        break

    try:
        vault = Vault(str(vault_path), pw)
    except VaultPasswordError:
        print("That is not the password of the existing vault. Run again and answer 'N' to start a fresh one.")
        return 1
    vault.set("fk_app_id", app_id)
    vault.set("fk_app_secret", app_secret)
    vault.delete("fk_access_token")  # any cached token belongs to the old credentials
    print(f"\nSaved the credentials, encrypted, in {vault_path.name}.")

    if not args.no_verify:
        print("Checking them with Flipkart...")
        try:
            from fkpulse.api_client import FlipkartSellerClient
            from fkpulse.config import load_config

            client = FlipkartSellerClient(load_config(), vault=vault)
            client._access_token()  # performs the OAuth2 token exchange
            print("  OK — Flipkart accepted the App ID/Secret.")
        except Exception as exc:  # noqa: BLE001
            print(f"  Flipkart did NOT accept them: {exc}")
            print("  The vault is saved; re-run this script once you have the right App ID/Secret.")
            return 2

    if args.persist_password:
        if os.name != "nt":
            print(f"\nNot Windows — set {ENV_NAME} yourself in the environment that runs run_scheduler.py.")
        else:
            _persist_windows_user_env(ENV_NAME, pw)
            print(f"\nStored the master password as the Windows user variable {ENV_NAME}.")
            print("Open a NEW terminal (or sign out and in) before starting `python run_scheduler.py`,")
            print("or it won't see the variable. Also keep the password in your password manager.")
    else:
        print(f"\nThe scheduler needs {ENV_NAME} set to unlock the vault unattended. Either re-run with")
        print("--persist-password, or set it yourself. Write the master password down somewhere safe —")
        print("a vault cannot be recovered without it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
