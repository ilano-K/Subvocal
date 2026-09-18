import logging
import re
from openai import APIConnectionError, APIError
from pydantic import ValidationError

from app.schemas.scripts import (
    CompileConcept,
    CompileScriptRequest,
    CompileScriptResponse,
    PrimerLLMResponse,
    ScriptChunk,
)
from app.core.json_parser import extract_and_parse_json
from app.services.llm_service import client as llm_client
from app.config import settings
from app.core.errors import LLMConnectionError

logger = logging.getLogger("subvocal.compiler")

PRIMER_SYSTEM_PROMPT = """You are an audiobook narrator creating an effortless, engaging study audio track.
The user is listening screen-free (walking, commuting) and wants to absorb the big picture clearly.

RULES:
1. Do NOT ask questions. No quizzing, no testing, no 'Self-Check'.
2. For EVERY concept in the input list, state the concept and definition clearly, followed immediately by an intuitive, grounded real-world analogy starting with 'Think of it like this:'.
3. Required template for each item:
   "Concept: {term}. {definition} Think of it like this: {simple, vivid everyday analogy}."
4. You MUST output an item for EVERY concept provided. Do NOT truncate, do NOT skip any concept, and do NOT stop early.
5. Output ONLY a valid JSON object matching:
   {"items": [{"concept_id": "...", "spoken_text": "Concept: ... Think of it like this: ..."}]}
"""


def _clean_tts(text: str) -> str:
    cleaned = re.sub(r"(?i)\bumbrella\s+rule:\s*", "", text)
    cleaned = re.sub(r"(?i)\bphonetic\s+anchor:\s*", "", cleaned)
    cleaned = re.sub(r"(?i)\bstage\s+direction:\s*", "", cleaned)
    cleaned = re.sub(
        r"\b[A-Za-z](?:-[A-Za-z]){1,7}\b",
        lambda m: ", ".join(re.findall(r"[A-Za-z]", m.group(0))),
        cleaned,
    )
    return cleaned.strip()


def _default_primer_text(concept: CompileConcept) -> str:
    clean_term = concept.term.strip().rstrip(".")
    clean_def = concept.definition.strip().rstrip(".")
    return f"Concept: {clean_term}. {clean_def}."


def _parse_transcript_override(transcript: str, concepts: list[CompileConcept]) -> list[ScriptChunk]:
    pieces = re.split(r"\[pause(?:\s+[0-9.]*s?)?\]", transcript, flags=re.IGNORECASE)
    cleaned_pieces = [p.strip() for p in pieces if p.strip()]

    chunks: list[ScriptChunk] = []
    for i, concept in enumerate(concepts):
        if i < len(cleaned_pieces):
            text = _clean_tts(cleaned_pieces[i])
        else:
            text = _default_primer_text(concept)

        chunks.append(
            ScriptChunk(
                id=f"ch_{i+1}",
                concept_id=concept.id,
                title=concept.term,
                text=text,
                reps=concept.reps,
            )
        )
    return chunks


async def _generate_primer_script(concepts: list[CompileConcept]) -> dict[str, str]:
    concept_lines = "\n".join(
        f"- id={c.id} | term={c.term} | definition={c.definition}"
        for c in concepts
    )

    logger.info("Generating Primer script via single LLM call for %d concepts...", len(concepts))
    try:
        completion = await llm_client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": PRIMER_SYSTEM_PROMPT},
                {"role": "user", "content": f"Concepts to format:\n{concept_lines}"},
            ],
            response_format={"type": "json_object"},
        )
        raw = completion.choices[0].message.content or ""
        parsed = extract_and_parse_json(raw, PrimerLLMResponse)
        return {item.concept_id: _clean_tts(item.spoken_text) for item in parsed.items if item.spoken_text.strip()}
    except (APIConnectionError, APIError) as e:
        logger.warning("LLM API error during primer generation (%s); falling back to default text", e)
        return {}
    except (ValidationError, Exception) as e:
        logger.warning("Validation failed on LLM response (%s); falling back to default text", e)
        return {}


async def compile_script(req: CompileScriptRequest) -> CompileScriptResponse:
    logger.info(
        "Compiling Primer audio script: title='%s', concepts=%d, pause=%.1fs",
        req.deck_title,
        len(req.concepts),
        req.pause_sec,
    )

    if req.transcript_override and req.transcript_override.strip():
        logger.info("Using user transcript override")
        chunks = _parse_transcript_override(req.transcript_override, req.concepts)
    else:
        # Single LLM call for all concepts
        generated_map = await _generate_primer_script(req.concepts)
        chunks = []
        for i, c in enumerate(req.concepts, 1):
            text = generated_map.get(c.id) or _default_primer_text(c)
            chunks.append(
                ScriptChunk(
                    id=f"ch_{i}",
                    concept_id=c.id,
                    title=c.term,
                    text=text,
                    reps=c.reps,
                )
            )

    pause_token = f"[pause {req.pause_sec:.1f}s]"
    transcript = f"\n\n{pause_token}\n\n".join(chunk.text for chunk in chunks)

    total_duration_sec = 0.0
    for chunk in chunks:
        words = len(re.findall(r"\b\w+\b", chunk.text))
        speech_sec = (words / 2.5) / max(0.5, req.voice_rate)
        total_duration_sec += (speech_sec + req.pause_sec) * chunk.reps

    return CompileScriptResponse(
        deck_title=req.deck_title,
        pause_sec=req.pause_sec,
        voice_rate=req.voice_rate,
        estimated_sec=round(total_duration_sec, 1),
        transcript=transcript,
        chunks=chunks,
    )
