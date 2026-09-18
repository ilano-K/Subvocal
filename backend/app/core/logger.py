import logging
import sys

LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"

def setup_logging(level: int = logging.INFO) -> None:
    logging.basicConfig(
        level=level,
        format=LOG_FORMAT,
        datefmt="%H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )
    # Quiet overly chatty third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.INFO)
