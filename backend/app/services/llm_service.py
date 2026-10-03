"""
One entry point for every AI call: complete(). It talks to whichever provider + model is
active (OpenAI, Gemini or any OpenAI-compatible endpoint through the OpenAI client; Anthropic
through its own messages API), and falls back to the LLM_* values in .env when none is chosen.
"""

import logging
import time
from dataclasses import dataclass

import httpx
from openai import APIConnectionError, APIError, AsyncOpenAI, AuthenticationError, BadRequestError, NotFoundError as OpenAINotFound

from app.config import settings
from app.core.errors import LLMConnectionError
from app.services import llm_providers

logger = logging.getLogger("subvocal.llm")

ANTHROPIC_VERSION = "2023-06-01"


@dataclass
class Target:
    """What a call is sent to."""
    kind: str            # "openai" | "gemini" | "anthropic" | "custom" | "default" (the .env values)
    name: str
    base_url: str
    api_key: str
    model: str


@dataclass
class LLMResult:
    text: str
    finish_reason: str   # "stop" when the answer is complete
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


def default_target() -> Target | None:
    """The model configured in .env, when there is one."""
    if settings.llm_base_url and settings.llm_api_key and settings.llm_model:
        return Target("default", "Default (server settings)", settings.llm_base_url, settings.llm_api_key, settings.llm_model)
    return None


def resolve(provider_id: str | None = None, model: str | None = None) -> Target:
    """The target for a call: the given provider + model, else the active one, else the .env default."""
    if provider_id and model:
        p = llm_providers.get_provider(provider_id)
        return Target(p.kind, p.name, p.base_url, p.api_key, model)
    active = llm_providers.get_active()
    if active:
        p = llm_providers.get_provider(active.provider_id)
        return Target(p.kind, p.name, p.base_url, p.api_key, active.model)
    fallback = default_target()
    if fallback:
        return fallback
    raise LLMConnectionError("No AI model is set up yet. Add a provider and a model in Settings → AI models.")


def label(target: Target | None = None) -> str:
    t = target or resolve()
    return f"{t.name} / {t.model}"


# ---- OpenAI-style providers ----

_clients: dict[tuple[str, str], AsyncOpenAI] = {}


def _openai_client(base_url: str, api_key: str) -> AsyncOpenAI:
    key = (base_url, api_key)
    if key not in _clients:
        _clients[key] = AsyncOpenAI(base_url=base_url, api_key=api_key)
    return _clients[key]


def _friendly(e: Exception, target: Target) -> str:
    if isinstance(e, AuthenticationError):
        return f"{target.name} rejected the API key. Check it in Settings → AI models."
    if isinstance(e, OpenAINotFound):
        return f"{target.name} doesn't know the model '{target.model}' (or the base URL is wrong)."
    if isinstance(e, APIConnectionError):
        return f"Couldn't reach {target.name} at {target.base_url}. Check the base URL and your connection."
    return f"{target.name} returned an error: {str(e)[:300]}"


async def _complete_openai(target: Target, messages: list[dict], max_tokens: int, temperature: float | None, json_mode: bool, default_extra: dict | None) -> LLMResult:
    client = _openai_client(target.base_url, target.api_key)
    # New OpenAI models want max_completion_tokens; most other servers still use max_tokens.
    params: dict = {"model": target.model, "messages": messages}
    params["max_completion_tokens" if target.kind == "openai" else "max_tokens"] = max_tokens
    if temperature is not None:
        params["temperature"] = temperature
    if json_mode:
        params["response_format"] = {"type": "json_object"}
    if target.kind == "default" and default_extra:
        params.update(default_extra)

    try:
        for _ in range(4):
            try:
                completion = await client.chat.completions.create(**params)
                break
            except BadRequestError as e:
                # Models and servers differ on what they accept: drop or swap what they refuse, then retry.
                msg = str(e).lower()
                if "temperature" in msg and "temperature" in params:
                    params.pop("temperature")
                elif "max_tokens" in msg and "max_tokens" in params:
                    params["max_completion_tokens"] = params.pop("max_tokens")
                elif "max_completion_tokens" in msg and "max_completion_tokens" in params:
                    params["max_tokens"] = params.pop("max_completion_tokens")
                elif "response_format" in msg and "response_format" in params:
                    params.pop("response_format")
                else:
                    raise
        else:
            raise LLMConnectionError(f"{target.name} refused the request.")
    except LLMConnectionError:
        raise
    except (APIConnectionError, APIError) as e:
        logger.exception("LLM API error from %s", target.name)
        raise LLMConnectionError(_friendly(e, target)) from e

    choice = completion.choices[0]
    usage = completion.usage
    return LLMResult(
        text=(choice.message.content or "").strip(),
        finish_reason=choice.finish_reason or "stop",
        prompt_tokens=usage.prompt_tokens if usage else 0,
        completion_tokens=usage.completion_tokens if usage else 0,
        total_tokens=usage.total_tokens if usage else 0,
    )


# ---- Anthropic ----

def _anthropic_error(r: httpx.Response, target: Target) -> str:
    if r.status_code in (401, 403):
        return f"{target.name} rejected the API key. Check it in Settings → AI models."
    if r.status_code == 404:
        return f"{target.name} doesn't know the model '{target.model}' (or the base URL is wrong)."
    try:
        detail = r.json().get("error", {}).get("message", "")
    except ValueError:
        detail = r.text
    return f"{target.name} returned an error ({r.status_code}): {detail[:300]}"


async def _complete_anthropic(target: Target, messages: list[dict], max_tokens: int, temperature: float | None, json_mode: bool) -> LLMResult:
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    if json_mode:
        system += "\n\nRespond with one valid JSON object only. No markdown, no code fences, no text around it."
    chat = [m for m in messages if m["role"] != "system"]

    payload: dict = {"model": target.model, "max_tokens": max_tokens, "messages": chat}
    if system:
        payload["system"] = system
    if temperature is not None:
        payload["temperature"] = temperature
    headers = {"x-api-key": target.api_key, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json"}
    url = target.base_url.rstrip("/") + "/messages"

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=15.0)) as http:
            r = await http.post(url, json=payload, headers=headers)
            # Some models allow fewer output tokens than we ask for: retry once with a smaller budget.
            if r.status_code == 400 and "max_tokens" in r.text and max_tokens > 8192:
                payload["max_tokens"] = 8192
                r = await http.post(url, json=payload, headers=headers)
    except httpx.HTTPError as e:
        logger.exception("Could not reach %s", target.name)
        raise LLMConnectionError(f"Couldn't reach {target.name} at {target.base_url}. Check the base URL and your connection.") from e

    if r.status_code >= 400:
        raise LLMConnectionError(_anthropic_error(r, target))

    data = r.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    stop = data.get("stop_reason") or "end_turn"
    usage = data.get("usage", {})
    prompt, completion = usage.get("input_tokens", 0), usage.get("output_tokens", 0)
    return LLMResult(
        text=text,
        finish_reason={"end_turn": "stop", "stop_sequence": "stop", "max_tokens": "length"}.get(stop, stop),
        prompt_tokens=prompt,
        completion_tokens=completion,
        total_tokens=prompt + completion,
    )


# ---- Entry point ----

def extract_json(text: str) -> str:
    """The JSON object inside an answer, ignoring code fences or chatter around it."""
    start, end = text.find("{"), text.rfind("}")
    return text[start:end + 1] if start != -1 and end > start else text


async def complete(
    messages: list[dict],
    *,
    max_tokens: int,
    temperature: float | None = None,
    json_mode: bool = False,
    default_extra: dict | None = None,
    target: Target | None = None,
) -> LLMResult:
    """
    Sends the messages (system first) to the active model and returns its answer.
    `default_extra` is only sent to the .env default model (for its own special options).
    Raises LLMConnectionError with a readable message when the provider can't be used.
    """
    target = target or resolve()
    logger.info("LLM call to %s (%s)", label(target), target.kind)
    if target.kind == "anthropic":
        result = await _complete_anthropic(target, messages, max_tokens, temperature, json_mode)
    else:
        result = await _complete_openai(target, messages, max_tokens, temperature, json_mode, default_extra)
    if json_mode:
        result.text = extract_json(result.text)
    return result


async def test_connection(target: Target) -> tuple[bool, str, int]:
    """A tiny call to check the key, URL and model. Returns (ok, message, milliseconds)."""
    started = time.perf_counter()
    try:
        result = await complete(
            [{"role": "user", "content": "Reply with the single word: OK"}],
            max_tokens=32,
            target=target,
        )
    except LLMConnectionError as e:
        return False, str(e), int((time.perf_counter() - started) * 1000)
    except Exception as e:  # anything unexpected is still just "it didn't work"
        logger.exception("Unexpected error while testing %s", target.name)
        return False, f"Unexpected error: {str(e)[:200]}", int((time.perf_counter() - started) * 1000)
    ms = int((time.perf_counter() - started) * 1000)
    return True, f"Connected. {target.model} answered in {ms} ms.", ms
