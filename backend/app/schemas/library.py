from pydantic import BaseModel, Field
from typing import List, Optional

from app.schemas.scripts import ScriptChunk, CompileConcept


class StudyDeckCreate(BaseModel):
    filename: str
    deck_title: str = Field(alias="deckTitle")
    pause_sec: float = Field(alias="pauseSec")
    voice_rate: float = Field(alias="voiceRate")
    estimated_sec: float = Field(alias="estimatedSec")
    transcript: str
    style: Optional[str] = "primer"
    chunks: List[ScriptChunk]
    concepts: List[CompileConcept]

    model_config = {"populate_by_name": True}


class StudyDeckResponse(BaseModel):
    id: int | str
    filename: str
    deck_title: str = Field(alias="deckTitle")
    pause_sec: float = Field(alias="pauseSec")
    voice_rate: float = Field(alias="voiceRate")
    estimated_sec: float = Field(alias="estimatedSec")
    transcript: str
    style: Optional[str] = "primer"
    chunks: List[ScriptChunk]
    concepts: List[CompileConcept]

    model_config = {"populate_by_name": True, "from_attributes": True}


class StudyDeckUpdate(BaseModel):
    filename: Optional[str] = None
    deck_title: Optional[str] = Field(default=None, alias="deckTitle")
    pause_sec: Optional[float] = Field(default=None, alias="pauseSec")
    voice_rate: Optional[float] = Field(default=None, alias="voiceRate")
    estimated_sec: Optional[float] = Field(default=None, alias="estimatedSec")
    transcript: Optional[str] = None
    style: Optional[str] = None
    chunks: Optional[list[ScriptChunk]] = None
    concepts: Optional[list[CompileConcept]] = None

    model_config = {"populate_by_name": True}
