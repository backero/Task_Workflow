"""
Settings, loaded from environment / .env (see .env.example). Pattern mirrors
the Attendance Tracker reference repo's app/core/config.py.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://backero:backero@localhost:5432/backero_workflow"
    secret_key: str = "change-me-in-production"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    bcrypt_rounds: int = 12
    cors_origins: str = "http://localhost:5173"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
