from fastapi import APIRouter

from app.core.errors import ValidationError
from app.schemas.llm import (
    ActiveModel, LLMSettings, ProviderCreate, ProviderOut, ProviderUpdate, TestRequest, TestResult,
)
from app.services import llm_providers, llm_service

router = APIRouter(prefix="/llm")


def _out(p: llm_providers.Provider) -> ProviderOut:
    return ProviderOut(
        id=p.id,
        kind=p.kind,
        name=p.name,
        base_url=p.base_url,
        models=p.models,
        has_key=bool(p.api_key),
        key_hint=p.api_key[-4:] if len(p.api_key) >= 8 else "",
    )


def _settings() -> LLMSettings:
    active = llm_providers.get_active()
    default = llm_service.default_target()
    return LLMSettings(
        providers=[_out(p) for p in llm_providers.list_providers()],
        active=ActiveModel(provider_id=active.provider_id, model=active.model) if active else None,
        default_model=default.model if default else None,
    )


@router.get("/providers", response_model=LLMSettings)
def get_settings():
    return _settings()


@router.post("/providers", response_model=ProviderOut, status_code=201)
def add_provider(body: ProviderCreate):
    if not body.api_key.strip():
        raise ValidationError("An API key is required.")
    provider = llm_providers.add_provider(body.kind, body.name, body.base_url, body.api_key, body.models)
    return _out(provider)


@router.put("/providers/{provider_id}", response_model=ProviderOut)
def update_provider(provider_id: str, body: ProviderUpdate):
    provider = llm_providers.update_provider(
        provider_id, name=body.name, base_url=body.base_url, api_key=body.api_key, models=body.models
    )
    return _out(provider)


@router.delete("/providers/{provider_id}", status_code=204)
def delete_provider(provider_id: str):
    llm_providers.delete_provider(provider_id)


@router.put("/active", response_model=LLMSettings)
def set_active(body: ActiveModel):
    llm_providers.set_active(body.provider_id, body.model)
    return _settings()


@router.delete("/active", response_model=LLMSettings)
def clear_active():
    """Go back to the model set in .env."""
    llm_providers.clear_active()
    return _settings()


@router.post("/providers/{provider_id}/test", response_model=TestResult)
async def test_provider(provider_id: str, body: TestRequest):
    provider = llm_providers.get_provider(provider_id)
    model = body.model or (provider.models[0] if provider.models else None)
    if not model:
        raise ValidationError("Add a model to this provider first, then test it.")
    ok, message, ms = await llm_service.test_connection(llm_service.resolve(provider_id, model))
    return TestResult(ok=ok, message=message, latency_ms=ms)
