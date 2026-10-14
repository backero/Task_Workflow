"""alerts.py — alert dispatch via email (SMTP_SSL) and WhatsApp (CallMeBot).

No Flask imports; app.config / app.database are lazy-imported inside
functions so this module is import-safe anywhere. Every send path is
wrapped so a missing/broken config can never crash the caller.

Contract:
    dispatch_unsent(conn) -> int   (alerts with sent==0 processed & marked)
    send_email(cfg, subject, body) -> bool
    send_whatsapp(cfg, text) -> bool
    test_alert() -> dict           (per-channel success report)
"""

CALLMEBOT_URL = "https://api.callmebot.com/whatsapp.php"


def _load_cfg():
    """Load full config dict; never raises."""
    try:
        from app.config import load_config  # lazy import
        cfg = load_config()
        return cfg if isinstance(cfg, dict) else {}
    except Exception:
        return {}


def _alerts_cfg(cfg):
    """Extract the alerts.* section; never raises."""
    if not isinstance(cfg, dict):
        return {}
    alerts = cfg.get("alerts")
    return alerts if isinstance(alerts, dict) else {}


def _section(cfg, name):
    """Accept either the full config dict or an already-extracted section."""
    if not isinstance(cfg, dict):
        return {}
    if "alerts" in cfg:
        section = _alerts_cfg(cfg).get(name, {})
        return section if isinstance(section, dict) else {}
    return cfg


def send_email(cfg, subject, body):
    """Send an email via SMTP over SSL. cfg is the full config dict or the
    alerts.email section {smtp_host, smtp_port, username, password, to}.
    Returns True on success, False otherwise (never raises)."""
    import smtplib
    from email.message import EmailMessage

    ecfg = _section(cfg, "email")
    host = ecfg.get("smtp_host") or ""
    to = ecfg.get("to") or ""
    if not host.strip() or not to.strip():
        return False
    try:
        port = int(ecfg.get("smtp_port") or 465)
    except (TypeError, ValueError):
        port = 465

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = ecfg.get("username") or to
    msg["To"] = to
    msg.set_content(body)

    try:
        with smtplib.SMTP_SSL(host.strip(), port, timeout=15) as smtp:
            username = ecfg.get("username") or ""
            if username.strip():
                smtp.login(username, ecfg.get("password") or "")
            smtp.send_message(msg)
        return True
    except Exception:
        return False


def send_whatsapp(cfg, text):
    """Send a WhatsApp message via CallMeBot. cfg is the full config dict or
    the alerts.whatsapp section {phone, apikey}. Returns True on success,
    False otherwise (never raises)."""
    wcfg = _section(cfg, "whatsapp")
    phone = str(wcfg.get("phone") or "").strip()
    apikey = str(wcfg.get("apikey") or "").strip()
    if not phone or not apikey:
        return False
    try:
        import requests
        resp = requests.get(
            CALLMEBOT_URL,
            params={"phone": phone, "text": text, "apikey": apikey},
            timeout=10,
        )
        return resp.status_code == 200
    except Exception:
        return False


def dispatch_unsent(conn):
    """Send every alert row with sent==0 through the configured channels,
    then mark sent=1. Failures are logged to data_log and never propagate.
    Returns the number of alerts processed."""
    from app import database as db  # lazy import

    cfg = _load_cfg()
    alerts_cfg = _alerts_cfg(cfg)
    email_cfg = alerts_cfg.get("email") if isinstance(alerts_cfg.get("email"), dict) else {}
    wa_cfg = alerts_cfg.get("whatsapp") if isinstance(alerts_cfg.get("whatsapp"), dict) else {}
    email_on = bool(email_cfg.get("enabled"))
    wa_on = bool(wa_cfg.get("enabled"))

    try:
        rows = conn.execute(
            "SELECT * FROM alerts WHERE sent = 0 ORDER BY id"
        ).fetchall()
    except Exception:
        return 0

    processed = 0
    for row in rows:
        alert_id = row["id"]
        severity = (row["severity"] or "info").upper()
        code = row["code"] or "ALERT"
        message = row["message"] or ""
        subject = f"[{severity}] Meesho Seller Command Center — {code}"
        body = f"{subject}\n\n{message}"

        channel_results = []
        if email_on:
            ok = send_email(email_cfg, subject, body)
            channel_results.append(("email", ok))
        if wa_on:
            ok = send_whatsapp(wa_cfg, body)
            channel_results.append(("whatsapp", ok))

        if not channel_results:
            try:
                db.log_data_event(
                    conn, "alerts", "no_channel",
                    f"alert {alert_id} ({code}): no alert channel enabled; "
                    "marked sent")
            except Exception:
                pass
        else:
            for channel, ok in channel_results:
                if not ok:
                    try:
                        db.log_data_event(
                            conn, "alerts", f"{channel}_failed",
                            f"alert {alert_id} ({code}): {channel} send "
                            "failed")
                    except Exception:
                        pass

        try:
            conn.execute("UPDATE alerts SET sent = 1 WHERE id = ?",
                         (alert_id,))
            processed += 1
        except Exception:
            pass

    try:
        conn.commit()
    except Exception:
        pass
    return processed


def test_alert():
    """Send a test message through every enabled channel. Returns a dict
    reporting per-channel success, e.g.
    {"ok": True, "channels": {"email": True, "whatsapp": "disabled"}}."""
    cfg = _load_cfg()
    alerts_cfg = _alerts_cfg(cfg)
    email_cfg = alerts_cfg.get("email") if isinstance(alerts_cfg.get("email"), dict) else {}
    wa_cfg = alerts_cfg.get("whatsapp") if isinstance(alerts_cfg.get("whatsapp"), dict) else {}

    subject = "Meesho Seller Command Center — test alert"
    body = ("This is a test alert from your Meesho Seller Command Center. "
            "If you are reading this, alert delivery is working.")

    channels = {}
    if email_cfg.get("enabled"):
        channels["email"] = send_email(email_cfg, subject, body)
    else:
        channels["email"] = "disabled"
    if wa_cfg.get("enabled"):
        channels["whatsapp"] = send_whatsapp(wa_cfg, body)
    else:
        channels["whatsapp"] = "disabled"

    return {"ok": any(v is True for v in channels.values()),
            "channels": channels}
