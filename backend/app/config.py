from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path 

class Settings(BaseSettings):
    # Application
    service_name: str = "Subvocal Backend"
    api_prefix: str = "/api/v1"
    allowed_document_extensions = {".pdf", ".docx", ".pptx"}
    debug: bool = True
    # CORS
    cors_allowed_origins: list[str] = [
        "http://localhost:5173",
        "tauri://localhost"
    ]
    
    # LLM
    llm_base_url: str 
    llm_api_key: str
    llm_model: str = 'deepseek-v4-flash:free'
    
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
    docling_cache_dir: Path = Path(".data/docling/")
    session_dir: Path = Path(".data/sessions")
    parse_cache_dir: Path = Path(".data/parse")

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )
    
@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()