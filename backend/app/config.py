from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path 

class Settings(BaseSettings):
    # Application
    service_name: str = "Subvocal Backend"
    api_prefix: str = "/api/v1"
    allowed_document_extensions: set[str] = {".pdf", ".docx", ".pptx"}
    debug: bool = True
    # CORS
    cors_allowed_origins: list[str] = [
        "http://localhost:5173",
        "tauri://localhost"
    ]
    
    # LLM
    # Optional fallback model, used when no provider is chosen in Settings
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    llm_providers_path: Path = Path(".data/llm_providers.json")
    
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
    storage_dir: Path = Path(".data/")
    session_dir: Path = Path(".data/sessions")
    parse_cache_dir: Path = Path(".data/parse")
    database_path: Path = Path(".data/subvocal.db")
    
    # TTS (optional narrator)
    tts_models_dir: Path = Path(".data/models/kokoro")
    tts_cache_dir: Path = Path(".data/tts")
    tts_prefs_path: Path = Path(".data/tts_prefs.json")
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
    
@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()