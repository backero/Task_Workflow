"""Entry point: python run.py

Ensures data/ + config.yaml exist, initialises the DB, seeds demo data if
mode == 'demo' and the listings table is empty, then serves the dashboard at
http://localhost:8000
"""

from app import create_app

if __name__ == "__main__":
    app = create_app()
    app.run(host="127.0.0.1", port=8000)
