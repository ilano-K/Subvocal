from openai import APIConnectionError, APIError
from pydantic import ValidationError

from app.schemas.scripts import (
    CompileConcept,
    CompileScriptRequest,
    CompileScriptResponse,
    CreativeLLMResponse,
    ScriptChunk,
    CREATIVE_STYLES,
)
from app.services.llm_service import client as llm_client
from app.config import settings
from app.core.errors import CompileFailed, LLMConnectionError, LLMValidationFailed


STYLE_PROMPTS = {
    "mnemonics": (
        "For each concept, invent a memorable mnemonic, acronym, or memory cue. "
        "Output spoken text that introduces the term, gives the cue, then the definition."
    ),
    "active-recall": (
        "For each concept, write a question that tests recall, followed by "
        "the marker [pause 1s], then the answer. Make it conversational and speakable."
    ),
    "socratic": (
        "For each concept, create a short Socratic dialogue: a probing question, "
        "a [pause 1s] marker for thinking, then a clear answer. Keep it natural."
    ),
    "tricks": (
        "For each concept, create a clever memory trick or association. "
        "Output spoken text with the term, the trick, and the definition."
    ),
}


def _estimate_duration(concepts: list[CompileConcept], pause_sec: float) -> float:
    n = len(concepts)
    reps_extra = sum(c.reps - 1 for c in concepts)
    return (n * 22) + (reps_extra * 8) + (pause_sec * n)


def _build_template_chunks(
    concepts: list[CompileConcept], style: str, pause_sec: float,
) -> list[ScriptChunk]:
    chunks: list[ScriptChunk] = []
    for i, c in enumerate(concepts, 1):
        if style == "term-definition":
            text = f"{c.term}. {c.definition}"
        elif style == "leitner":
            text = f"Card {i}. {c.term}. {c.definition}"
        elif style == "speed-sprint":
            text = f"{c.term}. {c.definition}"
        else:
            text = f"{c.term}. {c.definition}"

        chunks.append(ScriptChunk(
            id=f"ch_{i}",
            concept_id=c.id,
            title=c.term,
            text=text,
            reps=c.reps,
        ))
    return chunks


def _build_transcript(chunks: list[ScriptChunk], pause_sec: float) -> str:
    parts: list[str] = []
    for chunk in chunks:
        for r in range(chunk.reps):
            parts.append(chunk.text)
        parts.append(f"[pause {pause_sec}s]")
    return "\n".join(parts)


async def _generate_creative_chunks(
    concepts: list[CompileConcept], style: str,
) -> list[CreativeLLMResponse]:
    concept_block = "\n".join(
        f"- id={c.id} | term={c.term} | definition={c.definition}"
        for c in concepts
    )
    try:
        completion = await llm_client.beta.chat.completions.parse(
            model=settings.llm_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"{STYLE_PROMPTS[style]}\n\n"
                        "Rules:\n"
                        "- Write smooth spoken sentences suitable for text-to-speech.\n"
                        "- No Markdown, no bullets, no LaTeX.\n"
                        "- Return one chunk per concept, preserving the concept_id.\n"
                    ),
                },
                {
                    "role": "user",
                    "content": f"Concepts:\n{concept_block}",
                },
            ],
            response_format=CreativeLLMResponse,
        )
        return completion.choices[0].message.parsed
    except APIConnectionError as e:
        raise LLMConnectionError() from e
    except APIError as e:
        raise LLMConnectionError() from e
    except ValidationError as e:
        raise LLMValidationFailed() from e


async def compile_script(req: CompileScriptRequest) -> CompileScriptResponse:
    if req.transcript_override is not None:
        chunks = _build_template_chunks(req.concepts, "term-definition", req.pause_sec)
        transcript = req.transcript_override
    elif req.style in CREATIVE_STYLES:
        llm_result = await _generate_creative_chunks(req.concepts, req.style)
        reps_map = {c.id: c.reps for c in req.concepts}
        chunks = []
        for i, llm_chunk in enumerate(llm_result.chunks, 1):
            chunks.append(ScriptChunk(
                id=f"ch_{i}",
                concept_id=llm_chunk.concept_id,
                title=next(
                    (c.term for c in req.concepts if c.id == llm_chunk.concept_id),
                    f"Concept {i}",
                ),
                text=llm_chunk.text,
                reps=reps_map.get(llm_chunk.concept_id, 1),
            ))
        transcript = _build_transcript(chunks, req.pause_sec)
    else:
        chunks = _build_template_chunks(req.concepts, req.style, req.pause_sec)
        transcript = _build_transcript(chunks, req.pause_sec)

    estimated_sec = _estimate_duration(req.concepts, req.pause_sec)

    return CompileScriptResponse(
        deck_title=req.deck_title,
        style=req.style,
        pause_sec=req.pause_sec,
        voice_rate=req.voice_rate,
        estimated_sec=estimated_sec,
        transcript=transcript,
        chunks=chunks,
    )
