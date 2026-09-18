import json
import logging
import re
from typing import Type, TypeVar
from pydantic import BaseModel

logger = logging.getLogger("subvocal.json_parser")
T = TypeVar("T", bound=BaseModel)

def _clean_candidates(text: str) -> list[str]:
    """Generates candidate cleaned strings from potentially malformed LLM outputs."""
    candidates = []
    cleaned = text.strip()

    # 1. Strip markdown code fences
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

    candidates.append(cleaned)

    # 2. Fix quote-brace prefix corruptions (e.g., {"{"items" or '{"items' or {\n{"items")
    fixed_quotes = re.sub(r'^{\s*["\']\{', '{', cleaned)
    fixed_quotes = re.sub(r'\}\s*["\']\}$', '}', fixed_quotes)
    if fixed_quotes != cleaned and fixed_quotes not in candidates:
        candidates.append(fixed_quotes)

    fixed_leading_brace = re.sub(r'^{\s*\{', '{', cleaned)
    fixed_leading_brace = re.sub(r'\}\s*\}$', '}', fixed_leading_brace)
    if fixed_leading_brace not in candidates:
        candidates.append(fixed_leading_brace)

    # 3. Strip double curly braces {{ ... }}
    unwrapped = cleaned
    while unwrapped.startswith("{{") and unwrapped.endswith("}}"):
        unwrapped = unwrapped[1:-1].strip()
    if unwrapped not in candidates:
        candidates.append(unwrapped)

    # 4. Search for valid JSON root boundary with (items|chunks|concepts)
    for c in list(candidates):
        match = re.search(r'\{\s*"(?:items|chunks|concepts)"\s*:', c)
        if match:
            start_pos = match.start()
            end_pos = c.rfind("}")
            if end_pos > start_pos:
                sub = c[start_pos : end_pos + 1].strip()
                # Balance any extra trailing closing braces
                while sub.count("{") < sub.count("}") and sub.endswith("}"):
                    sub = sub[:-1].strip()
                if sub not in candidates:
                    candidates.append(sub)

    return candidates


def extract_and_parse_json(raw_text: str, model_cls: Type[T]) -> T:
    """Extracts and validates JSON from LLM output across various provider quirks."""
    candidates = _clean_candidates(raw_text)

    # Attempt parsing each candidate
    for cand in candidates:
        try:
            return model_cls.model_validate_json(cand)
        except Exception:
            pass

        try:
            parsed_dict = json.loads(cand)
            return model_cls.model_validate(parsed_dict)
        except Exception:
            pass

    # Fallback to direct validation on the first candidate to raise the standard validation error
    return model_cls.model_validate_json(candidates[0])
