"""
Saved AI providers (OpenAI, Gemini, Anthropic, or any OpenAI-compatible endpoint) and which
provider + model is active. Kept in one small JSON file next to the other local data.

The API keys are stored in plain text in that file, on this computer only. They are never sent
back to the app: the API only reports whether a key exists and its last four characters.
"""

import json
import threading
import uuid
from dataclasses import asdict, dataclass, field

from app.config import settings
from app.core.errors import NotFoundError, ValidationError

KINDS = ("openai", "gemini", "anthropic", "custom")

DEFAULT_NAMES = {
    "openai": "OpenAI",
    "gemini": "Google Gemini",
    "anthropic": "Anthropic",
    "custom": "Custom endpoint",
}

# Gemini and OpenAI are reached through their OpenAI-style API; Anthropic through its own.
DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/",
    "anthropic": "https://api.anthropic.com/v1",
}


@dataclass
class Provider:
    id: str
    kind: str
    name: str
    base_url: str
    api_key: str
    models: list[str] = field(default_factory=list)


@dataclass
class Active:
    provider_id: str
    model: str


_lock = threading.RLock()


# ---- File ----

def _read() -> tuple[list[Provider], Active | None]:
    try:
        raw = json.loads(settings.llm_providers_path.read_text(encoding="utf-8"))
        providers = [Provider(**p) for p in raw.get("providers", [])]
        active = Active(**raw["active"]) if raw.get("active") else None
        return providers, active
    except (FileNotFoundError, ValueError, TypeError, KeyError, OSError):
        return [], None    # a missing or broken file means "nothing saved yet"


def _write(providers: list[Provider], active: Active | None) -> None:
    path = settings.llm_providers_path
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    payload = {"providers": [asdict(p) for p in providers], "active": asdict(active) if active else None}
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    tmp.replace(path)      # a crash halfway never leaves a half-written file


def _clean_models(models: list[str]) -> list[str]:
    seen: list[str] = []
    for m in models:
        m = m.strip()
        if m and m not in seen:
            seen.append(m)
    return seen


# ---- Queries ----

def list_providers() -> list[Provider]:
    with _lock:
        return _read()[0]


def get_provider(provider_id: str) -> Provider:
    with _lock:
        for p in _read()[0]:
            if p.id == provider_id:
                return p
    raise NotFoundError("That provider doesn't exist.")


def get_active() -> Active | None:
    """The chosen provider + model, or None when nothing is chosen or the choice no longer exists."""
    with _lock:
        providers, active = _read()
        if active is None:
            return None
        for p in providers:
            if p.id == active.provider_id and active.model in p.models:
                return active
        return None


# ---- Changes ----

def add_provider(kind: str, name: str | None, base_url: str | None, api_key: str, models: list[str]) -> Provider:
    if kind not in KINDS:
        raise ValidationError(f"Unknown provider type: {kind}")
    url = (base_url or DEFAULT_BASE_URLS.get(kind, "")).strip()
    if not url:
        raise ValidationError("A custom endpoint needs a base URL.")
    provider = Provider(
        id=uuid.uuid4().hex[:12],
        kind=kind,
        name=(name or "").strip() or DEFAULT_NAMES[kind],
        base_url=url,
        api_key=api_key.strip(),
        models=_clean_models(models),
    )
    with _lock:
        providers, active = _read()
        providers.append(provider)
        _write(providers, active)
    return provider


def update_provider(
    provider_id: str,
    name: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    models: list[str] | None = None,
) -> Provider:
    """Only the fields that are given change; an empty api_key keeps the saved one."""
    with _lock:
        providers, active = _read()
        for p in providers:
            if p.id != provider_id:
                continue
            if name is not None and name.strip():
                p.name = name.strip()
            if base_url is not None:
                if not base_url.strip():
                    raise ValidationError("The base URL can't be empty.")
                p.base_url = base_url.strip()
            if api_key is not None and api_key.strip():
                p.api_key = api_key.strip()
            if models is not None:
                p.models = _clean_models(models)
            _write(providers, active)
            return p
    raise NotFoundError("That provider doesn't exist.")


def delete_provider(provider_id: str) -> None:
    with _lock:
        providers, active = _read()
        remaining = [p for p in providers if p.id != provider_id]
        if len(remaining) == len(providers):
            raise NotFoundError("That provider doesn't exist.")
        if active and active.provider_id == provider_id:
            active = None
        _write(remaining, active)


def set_active(provider_id: str, model: str) -> Active:
    provider = get_provider(provider_id)
    if model not in provider.models:
        raise ValidationError(f"'{model}' isn't one of {provider.name}'s models. Add it first.")
    active = Active(provider_id, model)
    with _lock:
        providers, _ = _read()
        _write(providers, active)
    return active


def clear_active() -> None:
    with _lock:
        providers, _ = _read()
        _write(providers, None)
