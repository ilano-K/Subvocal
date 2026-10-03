"""Handles loading/saving of user's tts settings """

from pydantic import BaseModel, ValidationError
from app.config import settings
from pathlib import Path
from app.schemas.tts import TTSPrefs

def load():
    path = settings.tts_prefs_path
    """ 
    Loads saved preferences from disk.
    """
    try:
        raw_text = path.read_text(encoding="utf-8")
        prefs = TTSPrefs.model_validate_json(raw_text)
        return prefs     
    except (ValidationError, FileNotFoundError, ValueError, OSError):
        return TTSPrefs()
    

def save(prefs: TTSPrefs):
    target_path: Path = settings.tts_prefs_path
    
    # Ensure path exists
    target_path.parent.mkdir(parents=True, exist_ok=True)
    
    tmp_path = target_path.with_name(target_path.name + ".tmp")

    # 1. Write the full payload to a temp file
    tmp_path.write_text(
        prefs.model_dump_json(indent=2), 
        encoding="utf-8"
    )
    
    # 2. atomic filesystem rename
    tmp_path.replace(target_path)
    
    
    