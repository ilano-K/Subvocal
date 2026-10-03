from typing import Literal, Optional

from pydantic import BaseModel, Field

ProviderKind = Literal["openai", "gemini", "anthropic", "custom"]


class ProviderOut(BaseModel):
    """A saved provider. The API key itself is never sent, only whether one exists and its last four characters."""
    id: str
    kind: ProviderKind
    name: str
    base_url: str = Field(alias="baseUrl")
    models: list[str]
    has_key: bool = Field(alias="hasKey")
    key_hint: str = Field(default="", alias="keyHint")

    model_config = {"populate_by_name": True}


class ProviderCreate(BaseModel):
    kind: ProviderKind
    name: Optional[str] = None
    base_url: Optional[str] = Field(default=None, alias="baseUrl")   # required for "custom"
    api_key: str = Field(alias="apiKey")
    models: list[str] = []

    model_config = {"populate_by_name": True}


class ProviderUpdate(BaseModel):
    """Only the fields that are sent change. An empty or missing apiKey keeps the saved key."""
    name: Optional[str] = None
    base_url: Optional[str] = Field(default=None, alias="baseUrl")
    api_key: Optional[str] = Field(default=None, alias="apiKey")
    models: Optional[list[str]] = None

    model_config = {"populate_by_name": True}


class ActiveModel(BaseModel):
    provider_id: str = Field(alias="providerId")
    model: str

    model_config = {"populate_by_name": True}


class LLMSettings(BaseModel):
    providers: list[ProviderOut]
    active: Optional[ActiveModel] = None
    default_model: Optional[str] = Field(default=None, alias="defaultModel")   # the .env model, used when nothing is chosen

    model_config = {"populate_by_name": True}


class TestRequest(BaseModel):
    model: Optional[str] = None     # no model = the provider's first one


class TestResult(BaseModel):
    ok: bool
    message: str
    latency_ms: int = Field(alias="latencyMs")

    model_config = {"populate_by_name": True}
