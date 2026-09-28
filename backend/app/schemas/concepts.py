from pydantic import BaseModel, Field, field_validator
from typing import List, Literal, Union, Optional, Any

def _normalize_item_to_str(item: Any) -> str:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        if "child_term" in item and "definition" in item:
            return f"{item['child_term']}: {item['definition']}"
        if "cause" in item and "effect" in item:
            return f"{item['cause']} -> {item['effect']}"
        if "condition" in item and "action" in item:
            return f"{item['condition']} -> {item['action']}"
        if "step" in item and "description" in item:
            return f"Step {item['step']}: {item['description']}"
        # Fallback: join values
        return " - ".join(str(v) for v in item.values() if v)
    return str(item)

def _normalize_str_list(v: Any) -> Any:
    if isinstance(v, list):
        return [_normalize_item_to_str(x) for x in v]
    return v

def _normalize_to_str(v: Any) -> str:
    if isinstance(v, str):
        return v
    if isinstance(v, list):
        return "; ".join(_normalize_item_to_str(x) for x in v)
    if isinstance(v, dict):
        return _normalize_item_to_str(v)
    return str(v)

# ---------------------------------------------------------
# 1. Shape-Specific Schemas (Macro-Segmentation)
# ---------------------------------------------------------

class FactualSchema(BaseModel):
    shape: Literal["factual"] = "factual"
    canonical_term: str = Field(description="The core concept or acronym.")
    definition: str = Field(description="Single-sentence core definition.")
    synonyms: List[str] = Field(default_factory=list)
    examples: List[str] = Field(
        default_factory=list,
        description="Verbatim worked examples from the source: code snippets, token tables, regex patterns, derivations, sample values. Never paraphrased.",
    )

    @field_validator("synonyms", mode="before")
    @classmethod
    def validate_synonyms(cls, v: Any):
        return _normalize_str_list(v)

    @field_validator("examples", mode="before")
    @classmethod
    def validate_examples(cls, v: Any):
        return _normalize_str_list(v)

class ConceptualSchema(BaseModel):
    shape: Literal["conceptual"] = "conceptual"
    parent_concept: str = Field(description="The master concept.")
    categorical_taxonomy: str = Field(description="The structural relationship (e.g., 'subdivided into').")
    child_definitions: List[str] = Field(description="Definitions of the constituent categories.")
    examples: List[str] = Field(
        default_factory=list,
        description="Verbatim worked examples from the source: code snippets, token tables, regex patterns, derivations, sample values. Never paraphrased.",
    )

    @field_validator("examples", mode="before")
    @classmethod
    def validate_examples(cls, v: Any):
        return _normalize_str_list(v)

    @field_validator("child_definitions", mode="before")
    @classmethod
    def validate_child_definitions(cls, v: Any):
        return _normalize_str_list(v)

    @field_validator("categorical_taxonomy", mode="before")
    @classmethod
    def validate_taxonomy(cls, v: Any):
        return _normalize_to_str(v)

class ProceduralSchema(BaseModel):
    shape: Literal["procedural"] = "procedural"
    goal_state: str = Field(description="The final target state of the workflow.")
    ordered_steps: List[str] = Field(description="Strict sequential steps.")
    decision_branches: List[str] = Field(description="Conditional execution logic (if X then Y).")
    examples: List[str] = Field(
        default_factory=list,
        description="Verbatim worked examples from the source: code snippets, token tables, regex patterns, derivations, sample values. Never paraphrased.",
    )

    @field_validator("examples", mode="before")
    @classmethod
    def validate_examples(cls, v: Any):
        return _normalize_str_list(v)

    @field_validator("ordered_steps", "decision_branches", mode="before")
    @classmethod
    def validate_procedural_lists(cls, v: Any):
        return _normalize_str_list(v)

class TheoreticalSchema(BaseModel):
    shape: Literal["theoretical"] = "theoretical"
    principle_statement: str = Field(description="The primary causal law or theorem.")
    cause_effect_variables: List[str] = Field(description="The independent and dependent variables.")
    boundary_conditions: str = Field(description="Limits where this principle holds true.")
    examples: List[str] = Field(
        default_factory=list,
        description="Verbatim worked examples from the source: code snippets, token tables, regex patterns, derivations, sample values. Never paraphrased.",
    )

    @field_validator("examples", mode="before")
    @classmethod
    def validate_examples(cls, v: Any):
        return _normalize_str_list(v)

    @field_validator("cause_effect_variables", mode="before")
    @classmethod
    def validate_cause_effect(cls, v: Any):
        return _normalize_str_list(v)

    @field_validator("boundary_conditions", mode="before")
    @classmethod
    def validate_boundary(cls, v: Any):
        return _normalize_to_str(v)

# ---------------------------------------------------------
# 2. The Isolated Micro-Learning Module
# ---------------------------------------------------------

class LearningModule(BaseModel):
    id: str = Field(..., description="Unique identifier string, e.g., 'module-1'.")

    # Polymorphic field handling Bloom's/Merrill's shapes
    knowledge_schema: Union[FactualSchema, ConceptualSchema, ProceduralSchema, TheoreticalSchema] = Field(
        ...,
        discriminator='shape',
        description="The specific structural representation. MUST match the content type."
    )

    # Stage 2: Semantic Isolation
    prepended_context: str = Field(
        ..., description="Document-level background to make this module 100% self-contained."
    )

    # Stage 3: Cognitive Load & Signal Optimization
    locked_keywords: List[str] = Field(
        ..., description="Essential domain terminology that must not be altered."
    )

    # Stage 4: Scaffolding
    prerequisite_ids: List[str] = Field(
        default_factory=list, description="IDs of modules that must be learned before this one."
    )

    @field_validator("locked_keywords", "prerequisite_ids", mode="before")
    @classmethod
    def validate_module_lists(cls, v: Any):
        return _normalize_str_list(v)

# ---------------------------------------------------------
# 3. Request Schemas
# ---------------------------------------------------------

class ExtractConceptsRequest(BaseModel):
    document_id: str

# ---------------------------------------------------------
# 4. Document-Level Responses
# ---------------------------------------------------------

class LLMUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

class ExtractConceptLLMResponse(BaseModel):
    document_epitome: str = Field(
        ..., description="A concrete, simplified overview representing the whole task/domain."
    )
    modules: List[LearningModule]
    
class ExtractConceptResponse(BaseModel):
    document_id: str
    document_epitome: str = Field(
        ..., description="A concrete, simplified overview representing the whole task/domain."
    )
    modules: List[LearningModule]
    usage: LLMUsage