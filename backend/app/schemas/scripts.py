from pydantic import BaseModel, Field
from typing import Literal


Style = Literal[
    "term-definition", "mnemonics", "active-recall",
    "leitner", "socratic", "speed-sprint",
]

CREATIVE_STYLES = {"mnemonics", "active-recall", "socratic", "tricks"}
TEMPLATE_STYLES = {"term-definition", "leitner", "speed-sprint"}


class CompileConcept(BaseModel):
    id: str
    term: str
    definition: str
    reps: int = Field(default=1, ge=1)


class CompileScriptRequest(BaseModel):
    deck_title: str = Field(alias="deckTitle")
    concepts: list[CompileConcept]
    style: Style
    pause_sec: float = Field(alias="pauseSec", ge=0.5, le=5.0)
    voice_rate: float = Field(alias="voiceRate", default=1.0)
    transcript_override: str | None = Field(default=None, alias="transcriptOverride")

    model_config = {"populate_by_name": True}


class ScriptChunk(BaseModel):
    id: str
    concept_id: str = Field(alias="conceptId")
    title: str
    text: str
    reps: int

    model_config = {"populate_by_name": True}


class CompileScriptResponse(BaseModel):
    deck_title: str = Field(alias="deckTitle")
    style: Style
    pause_sec: float = Field(alias="pauseSec")
    voice_rate: float = Field(alias="voiceRate")
    estimated_sec: float = Field(alias="estimatedSec")
    transcript: str
    chunks: list[ScriptChunk]

    model_config = {"populate_by_name": True}


class CreativeLLMChunk(BaseModel):
    concept_id: str
    text: str


class CreativeLLMResponse(BaseModel):
    chunks: list[CreativeLLMChunk]
