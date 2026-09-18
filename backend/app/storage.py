from app.config import settings

def initialize_storage() -> None:
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    settings.docling_cache_dir.mkdir(parents=True, exist_ok=True)
    settings.session_dir.mkdir(parents=True, exist_ok=True)
    settings.parse_cache_dir.mkdir(parents=True, exist_ok=True)