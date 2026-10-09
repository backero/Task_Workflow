"""Flask app factory for Meesho Seller Command Center."""

import os

from app.config import load_config, get, DATA_DIR
from app.database import get_conn, init_db

DB_PATH = os.path.join(DATA_DIR, "saas.db")


def create_app():
    from flask import Flask  # lazy import: keeps app.database/app.config flask-free

    app = Flask(__name__)

    # CORS for the unified cross-platform dashboard (a separate app, its own origin) reading /api/* read-only.
    # No extra dependency: this data is already public on the local machine's own network via this same port.
    @app.after_request
    def _allow_unified_dashboard(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        return resp

    # Ensure data dir + config.yaml exist, then DB.
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, "uploads"), exist_ok=True)
    load_config(force=True)
    app.config["database_path"] = DB_PATH
    app.config["SECRET_KEY"] = "meesho-command-center-local"

    conn = get_conn(DB_PATH)
    try:
        init_db(conn)
        empty = conn.execute("SELECT COUNT(*) AS c FROM listings").fetchone()["c"] == 0
    finally:
        conn.close()

    # Seed demo data on first run in demo mode.
    if get("mode", "demo") == "demo" and empty:
        try:
            from app.demo_data import seed_demo
            seed_demo(DB_PATH)
        except Exception as exc:
            conn = get_conn(DB_PATH)
            try:
                from app.database import log_data_event
                log_data_event(conn, "demo", "error", f"seed failed: {exc}")
            finally:
                conn.close()

    # Register blueprints via lazy import so the app still boots if sibling
    # modules are not written yet.
    try:
        from app.routes.views import views
        app.register_blueprint(views)
    except Exception:
        app.logger.exception("pages failed to load - the dashboard pages will be missing")
    try:
        from app.routes.api import api
        app.register_blueprint(api, url_prefix="/api")
    except Exception:
        app.logger.exception("API failed to load - the dashboard will show no data")

    # Background scheduler (auto pull + periodic recompute).
    try:
        from app.scheduler import start_scheduler
        start_scheduler(app)
    except Exception:
        pass

    return app
