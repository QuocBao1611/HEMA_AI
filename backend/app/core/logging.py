import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from backend.app.core.config import settings


def setup_logging() -> None:
    # Create logs directory if it doesn't exist
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    log_file = log_dir / "hemavision.log"
    
    # Configure root logger
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            RotatingFileHandler(
                filename=log_file,
                maxBytes=10 * 1024 * 1024,  # 10 MB
                backupCount=5,
                encoding="utf-8"
            ),
        ],
    )
    
    # Setup standard app logger
    logger = logging.getLogger("hemavision")
    logger.setLevel(settings.log_level)
    
    # Mute noisy third-party loggers if needed
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO if settings.database_echo else logging.WARNING)
    
    # Suppress matplotlib fontManager noise (regenerated each startup)
    logging.getLogger("matplotlib.font_manager").setLevel(logging.WARNING)
    logging.getLogger("matplotlib").setLevel(logging.WARNING)
    
    # Suppress TensorFlow/Keras compile metrics warnings
    logging.getLogger("tensorflow").setLevel(logging.ERROR)
    logging.getLogger("keras").setLevel(logging.ERROR)
    logging.getLogger("absl").setLevel(logging.ERROR)
    
    # Suppress PIL debug messages
    logging.getLogger("PIL").setLevel(logging.WARNING)

def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"hemavision.{name}")
