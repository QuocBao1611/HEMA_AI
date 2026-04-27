from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from backend.app.core.config import settings
from backend.app.core.paths import DATA_DIR
from backend.app.core.security import sanitize_error_message


DATA_DIR.mkdir(parents=True, exist_ok=True)
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(
    settings.database_url,
    echo=settings.database_echo,
    future=True,
    pool_pre_ping=True,
    connect_args=_connect_args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

DATABASE_READY = False
DATABASE_LAST_ERROR: str | None = None


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def open_session() -> Generator[Session, None, None]:
    """Context manager that guarantees the session is always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def mark_database_ready(value: bool, error: str | None = None) -> None:
    global DATABASE_READY, DATABASE_LAST_ERROR
    DATABASE_READY = value
    DATABASE_LAST_ERROR = sanitize_error_message(error)


def database_health() -> dict[str, str | bool | None]:
    return {
        "enabled": True,
        "ready": DATABASE_READY,
        "last_error": DATABASE_LAST_ERROR,
    }


def ping_database() -> tuple[bool, str | None]:
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
        mark_database_ready(True, None)
        return True, None
    except SQLAlchemyError:
        message = "Không thể kết nối cơ sở dữ liệu."
        mark_database_ready(False, message)
        return False, message
