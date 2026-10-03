from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path
import os
import sys


def default_data_dir() -> Path:
    """Where Subvocal keeps its library, audio and settings: one folder per user, the same for the
    desktop app and for running from source, so they share one library."""
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / "Subvocal"


class Settings(BaseSettings):
    # Application
    service_name: str = "Subvocal Backend"
    api_prefix: str = "/api/v1"
    allowed_document_extensions: set[str] = {".pdf", ".docx", ".pptx"}
    debug: bool = True
    # CORS
    cors_allowed_origins: list[str] = [
        "http://localhost:5173",
        "tauri://localhost",          # the desktop app on macOS and Linux
        "http://tauri.localhost",     # the desktop app on Windows
        "https://tauri.localhost",
    ]
    
    # LLM
    # Optional fallback model, used when no provider is chosen in Settings
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    llm_providers_path: Path | None = None
    
    # Uploads
    max_file_size_limit: int = 50 * 1024 * 1024 # 50 mb
    
    allowed_mime_types: set[str] = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/markdown",
    }
    
    # Storage
    # Everything lives under data_dir (set SUBVOCAL_DATA_DIR to move it); each path below can still be overridden.
    data_dir: Path = Field(default_factory=default_data_dir, validation_alias="SUBVOCAL_DATA_DIR")
    storage_dir: Path | None = None
    session_dir: Path | None = None
    parse_cache_dir: Path | None = None
    database_path: Path | None = None
    
    # TTS (optional narrator)
    tts_models_dir: Path | None = None
    tts_cache_dir: Path | None = None
    tts_prefs_path: Path | None = None
    tts_default_voice: str = "af_heart"     # must be a key of VOICES in services/tts/manifest.py
    tts_cache_max_mb: int = 2048
    tts_threads: int | None = None          # None → max(1, cpu_count - 1)
    tts_split_sentences: bool = True
    tts_format: str = "ogg"                 # "ogg" (Vorbis) or "wav"
    tts_autoload: bool = True               # set False in .env during backend dev (skips model load on --reload)

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )

    @model_validator(mode="after")
    def _fill_paths(self):
        d = self.data_dir
        defaults = {
            "storage_dir": d,
            "session_dir": d / "sessions",
            "parse_cache_dir": d / "parse",
            "database_path": d / "subvocal.db",
            "llm_providers_path": d / "llm_providers.json",
            "tts_models_dir": d / "models" / "kokoro",
            "tts_cache_dir": d / "tts",
            "tts_prefs_path": d / "tts_prefs.json",
        }
        for name, value in defaults.items():
            if getattr(self, name) is None:
                setattr(self, name, value)
        return self
    
@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()