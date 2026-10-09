import os

from app import create_app

if __name__ == "__main__":
    # Was hardcoded to 8000; the droplet's nginx config and the marketflow
    # supervisor both expect 8010 (matching the other platforms' convention).
    # Defaults to 8000 so standalone/local runs are unaffected.
    port = int(os.environ.get("PORT", 8000))
    create_app().run(host="127.0.0.1", port=port)
