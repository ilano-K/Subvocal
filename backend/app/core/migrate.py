import logging
import shutil
from pathlib import Path

from app.config import settings

logger = logging.getLogger("subvocal")

MARKER = ".migrated-from-legacy"
EMPTY_DB_BYTES = 16 * 1024   # a database with no decks is only a few KB


def migrate_legacy_data() -> None:
    """Earlier versions kept data in a .data folder next to where the backend was started.
    Once, on the first run with the per-user folder, copy it over (the old folder is left untouched).
    Files already in the new folder win, except an empty database."""
    legacy = Path(".data").resolve()
    target = settings.data_dir.resolve()
    marker = target / MARKER
    if legacy == target or not legacy.is_dir() or marker.exists():
        return
    logger.info("Copying existing data from %s to %s", legacy, target)
    db = settings.database_path
    keep_new_db = db.exists() and db.stat().st_size > EMPTY_DB_BYTES

    def skip(directory: str, names: list[str]) -> list[str]:
        return [n for n in names if (Path(directory) / n) == legacy / db.name and keep_new_db]

    try:
        target.mkdir(parents=True, exist_ok=True)
        shutil.copytree(legacy, target, dirs_exist_ok=True, ignore=skip)
        marker.write_text("done", encoding="utf-8")
    except OSError:
        logger.exception("Could not copy the old data folder; starting with an empty library")
