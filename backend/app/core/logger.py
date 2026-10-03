import logging
import sys
from logging.handlers import RotatingFileHandler

from app.config import settings

LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
LOG_FILE = "backend.log"


def log_dir():
    return settings.data_dir / "logs"


def setup_logging(level: int = logging.INFO) -> None:
    """Logs to the console and to a file (data folder / logs / backend.log, 1 MB x 3 files kept)."""
    handlers: list[logging.Handler] = []
    if sys.stdout is not None:
        handlers.append(logging.StreamHandler(sys.stdout))
    try:
        log_dir().mkdir(parents=True, exist_ok=True)
        handlers.append(
            RotatingFileHandler(log_dir() / LOG_FILE, maxBytes=1_000_000, backupCount=2, encoding="utf-8")
        )
    except OSError:
        pass  # logging to a file is a convenience; never stop the backend over it

    logging.basicConfig(level=level, format=LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S", handlers=handlers, force=True)

    # uvicorn keeps its own handlers; send its lines to the file too
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        for h in handlers:
            if isinstance(h, RotatingFileHandler) and h not in lg.handlers:
                lg.addHandler(h)

    # Quiet overly chatty third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.INFO)

    def log_uncaught(exc_type, exc, tb):
        logging.getLogger("subvocal").critical("Uncaught exception", exc_info=(exc_type, exc, tb))

    sys.excepthook = log_uncaught
