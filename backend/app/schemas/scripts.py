from pydantic import BaseModel, Field


class CompileConcept(BaseModel):
    id: str
    term: str
    definition: str
    reps: int = Field(default=1, ge=1)


class CompileScriptRequest(BaseModel):
    deck_title: str = Field(alias="deckTitle")
    concepts: list[CompileConcept]
    pause_sec: float = Field(default=2.5, alias="pauseSec")
    voice_rate: float = Field(default=1.0, alias="voiceRate")
    transcript_override: str | None = Field(default=None, alias="transcriptOverride")
    document_id: str | None = Field(default=None, alias="documentId")
    document_epitome: str | None = Field(default=None, alias="documentEpitome")

    model_config = {"populate_by_name": True}


class ScriptChunk(BaseModel):
    id: str
    title: str
    text: str
    reps: int = 1
    model_config = {"populate_by_name": True}


class CompileScriptResponse(BaseModel):
    deck_title: str = Field(alias="deckTitle")
    pause_sec: float = Field(alias="pauseSec")
    voice_rate: float = Field(alias="voiceRate")
    estimated_sec: float = Field(alias="estimatedSec")
    transcript: str
    chunks: list[ScriptChunk]

    model_config = {"populate_by_name": True}


class PrimerLLMItem(BaseModel):
    concept_id: str
    spoken_text: str = Field(
        description="Spoken text in Primer format: Concept: {term}. {definition} Think of it like this: {simple_analogy}."
    )


class PrimerLLMResponse(BaseModel):
    items: list[PrimerLLMItem]


# LLM script generation
class WriteScriptLLMResponse(BaseModel):
    script: str 
    
class OptimizeScriptLLMResponse(BaseModel):
    optimized_script: str