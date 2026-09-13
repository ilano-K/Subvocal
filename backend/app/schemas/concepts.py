from pydantic import BaseModel, Field
from typing import List

class Concept(BaseModel):
    id: str = Field(
        ...,
        description="Unique identifier string. Starts with 1",
    )
    term: str = Field(
        ...,
        description="Core concept, term, or acronym name.",
    )
    definition: str = Field(
        ...,
        description="Concise, speakable definition or explanation.",
    )


class ExtractConceptsRequest(BaseModel):
    document_id: str

class LLMUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

class ExtractConceptResponse(BaseModel):
    document_id: str
    concepts: list[Concept]
    usage: LLMUsage


class ExtractConceptLLMResponse(BaseModel):
    concepts: list[Concept]


