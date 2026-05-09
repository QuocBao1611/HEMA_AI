import os
from dataclasses import dataclass

from backend.app.core.paths import DATA_DIR, PROJECT_ROOT
from backend.app.core.security import DEFAULT_CORS_ALLOW_ORIGINS, parse_cors_allow_origins


def _strip_wrapping_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _load_env_file() -> None:
    env_path = PROJECT_ROOT / ".env"
    if not env_path.is_file():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue

        os.environ[key] = _strip_wrapping_quotes(value.strip())


_load_env_file()


DEFAULT_SQLITE_DATABASE_URL = f"sqlite:///{(DATA_DIR / 'hemavision.sqlite3').as_posix()}"


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "TestModel Web System")
    cors_allow_origins: tuple[str, ...] = parse_cors_allow_origins(
        os.getenv("CORS_ALLOW_ORIGINS", ",".join(DEFAULT_CORS_ALLOW_ORIGINS))
    )
    database_url: str = os.getenv(
        "DATABASE_URL",
        DEFAULT_SQLITE_DATABASE_URL,
    )
    database_echo: bool = os.getenv("DATABASE_ECHO", "false").strip().lower() == "true"
    database_auto_create: bool = os.getenv("DATABASE_AUTO_CREATE", "true").strip().lower() != "false"
    history_page_size: int = int(os.getenv("HISTORY_PAGE_SIZE", "20"))
    inference_rate_limit: str = os.getenv("INFERENCE_RATE_LIMIT", "10/minute").strip() or "10/minute"
    log_level: str = os.getenv("LOG_LEVEL", "INFO").strip().upper()
    
    # Auth settings
    secret_key: str = os.getenv("SECRET_KEY", "hema_vision_super_secret_key_change_in_prod")
    algorithm: str = os.getenv("ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")) # Default 24h
    frontend_url: str = os.getenv("FRONTEND_URL", "http://127.0.0.1:3000").rstrip("/")


settings = Settings()
