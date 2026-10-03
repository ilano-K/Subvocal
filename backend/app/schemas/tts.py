from pydantic import BaseModel, Field
from typing import Optional

from app.config import settings
from app.enums.tts import EngineState, InstallerState, JobStatus

# ---- Prefs ----

class TTSPrefs(BaseModel):
    enabled: bool = True
    voice: str = settings.tts_default_voice


class TTSPrefsUpdate(BaseModel):
    enabled: Optional[bool] = None
    voice: Optional[str] = None


# ---- Health ----

class Voice(BaseModel):
    key: str
    name: str
    grade: str


class InstallStatus(BaseModel):
    state: InstallerState
    error: str | None = None
    done_bytes: int = Field(alias="doneBytes")
    total_bytes: int = Field(alias="totalBytes")
    bytes_per_sec: float | None = Field(default=None, alias="bytesPerSec")
    installed_bytes: int = Field(alias="installedBytes")
    download_bytes: int = Field(alias="downloadBytes")

    model_config = {"populate_by_name": True}

class DeckActivity(BaseModel):
    """A deck that still has audio being prepared."""
    deck_key: str = Field(alias="deckKey")
    deck_title: str = Field(alias="deckTitle")
    total: int                       # sections in the deck when it was queued
    pending: int                     # of those, waiting or rendering
    current_title: str | None = Field(default=None, alias="currentTitle")    # section rendering right now
    current_index: int | None = Field(default=None, alias="currentIndex")

    model_config = {"populate_by_name": True}


class HealthResponse(BaseModel):
    state: EngineState
    error: str | None = None
    settings: TTSPrefs
    voices: list[Voice]
    install_status: InstallStatus = Field(alias="install")
    rtf: float | None = None                                     # smoothed render speed
    pending_words: int = Field(default=0, alias="pendingWords")
    cache_bytes: int = Field(default=0, alias="cacheBytes")
    activity: list[DeckActivity] = []

    model_config = {"populate_by_name": True}


# ---- Clips ----

class Chunk(BaseModel):
    id: str
    text: str
    title: Optional[str] = None

class PrepareClipsRequest(BaseModel):
    chunks: list[Chunk]
    startIndex: int = 0
    voice: Optional[str] = None
    deckKey: Optional[str] = None      # which deck these chunks belong to, shown while they are prepared
    deckTitle: Optional[str] = None

class ClipStatus(BaseModel):
    id: str | None = None
    audio_id: str = Field(alias="audioId")
    status: JobStatus
    durationSec: Optional[float] = None 
    error: Optional[str] = None
    
    model_config = {"populate_by_name": True}

class ClipStatusRequest(BaseModel):
    audio_ids: list[str] = Field(alias="audioIds")

    model_config = {"populate_by_name": True}


class PrioritizeRequest(BaseModel):
    audio_ids: list[str] = Field(alias="audioIds")   # first = NOW, the rest = NEXT

    model_config = {"populate_by_name": True}


class PreviewRequest(BaseModel):
    voice: str


class CoverageDeck(BaseModel):
    id: str                  # the frontend's own name for the deck, echoed back
    texts: list[str]         # the text of each section, in order


class CoverageRequest(BaseModel):
    decks: list[CoverageDeck]
    voice: Optional[str] = None   # no voice given = use the saved one


class DeckCoverage(BaseModel):
    id: str
    total: int               # sections that have something to say
    ready: int               # of those, how many are already rendered

