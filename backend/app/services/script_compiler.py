from app.services.llm_service import client as llm_client
from app.config import settings
from app.prompts.script_writing import SCRIPT_WRITING_PROMPT, SCRIPT_OPTIMIZATION_PROMPT
from app.schemas.scripts import (
    ScriptChunk,
    CompileScriptRequest, CompileScriptResponse
)

from openai import APIConnectionError, APIError
from app.core.errors import LLMConnectionError, LLMValidationFailed
from app.services import parse_cache

import json
import logging 
import re 

logger = logging.getLogger("subvocal.compiler")

# The writer starts every section with this marker; each section becomes one chunk.
SECTION_RE = re.compile(r"^\s*\[SECTION:\s*(.+?)\]\s*$", re.MULTILINE)
LLM_MAX_TOKENS = 32000

def _split_sections(script: str, deck_title: str) -> list[ScriptChunk]:
    parts = SECTION_RE.split(script)
    sections = []
    if parts[0].strip():
        sections.append((deck_title, parts[0]))
    sections += list(zip(parts[1::2], parts[2::2]))

    chunks = []
    for title, text in sections:
        text = _clean_chunk_text(text)
        if text:
            chunks.append(ScriptChunk(id=f"ch_{len(chunks)}", title=title.strip(), text=text))
    return chunks

def _clean_chunk_text(text: str) -> str:
    cleaned = re.sub(r"\[pause(?:\s+[0-9.]*s?)?\]", "", text, flags=re.IGNORECASE)
    return cleaned.strip()

def _parse_transcript_override(transcript: str, deck_title: str) -> list[ScriptChunk]:
    pieces = re.split(r"\[pause(?:\s+[0-9.]*s?)?\]", transcript, flags=re.IGNORECASE)
    cleaned_pieces = [p.strip() for p in pieces if p.strip()]
    if not cleaned_pieces:
        return [ScriptChunk(id="ch_0", title=deck_title, text=_clean_chunk_text(transcript))]
    
    chunks = []
    for i, p in enumerate(cleaned_pieces):
        first_line = p.split("\n")[0].strip()
        title = first_line[:50] if len(first_line) > 5 else f"Section {i + 1}"
        chunks.append(ScriptChunk(id=f"ch_{i}", title=title, text=_clean_chunk_text(p)))
    return chunks

async def compile_script(req: CompileScriptRequest):
    """Separate tasks to different LLM calls for maximum possible quality of output. """
    # If transcript already exists (e.g., from Generate Preview or user edit), reuse it instantly without LLM calls!
    if req.transcript_override and req.transcript_override.strip():
        logger.info("Using existing transcript override (%d chars); skipping all LLM calls", len(req.transcript_override))
        chunks = _parse_transcript_override(req.transcript_override.strip(), req.deck_title)
    else:
        # 1. Audio Script Writing (returns raw text, with epitome and modules)
        raw_script = await _generate_script(req)

        # 2. Audio Script Optimization (returns clean TTS-optimized text, section markers intact)
        optimized_script = await _generate_optimized_script(raw_script)

        # 3. Chunking: split on the writer's [SECTION: Title] markers
        chunks = _split_sections(optimized_script, req.deck_title)
        logger.info("Split optimized script into %d section chunks", len(chunks))
        if not chunks:
            chunks = [ScriptChunk(id="ch_0", title=req.deck_title, text=_clean_chunk_text(optimized_script))]
    
    # 5. Compute estimated total duration
    total_duration_sec = 0.0
    for chunk in chunks:
        words = len(re.findall(r"\b\w+\b", chunk.text))
        speech_sec = (words / 2.5) / max(0.5, req.voice_rate)
        total_duration_sec += (speech_sec + req.pause_sec) * chunk.reps
    
    # 6. Parse transcript to include user requested pause length
    pause_token = f"[pause {req.pause_sec:.1f}s]"
    transcript = f"\n\n{pause_token}\n\n".join(chunk.text for chunk in chunks)
    
    return CompileScriptResponse(
        deck_title=req.deck_title,
        pause_sec=req.pause_sec,
        voice_rate=req.voice_rate,
        estimated_sec=round(total_duration_sec, 1),
        transcript=transcript,
        chunks=chunks,
    )

async def _generate_script(req: CompileScriptRequest) -> str:
    # 1. Resolve document epitome
    epitome = req.document_epitome or ""
    
    # 2. Check if rich modules were cached during concept extraction
    modules_payload = None
    module_count = len(req.concepts)
    
    if req.document_id:
        cached_data = parse_cache.get(f"concepts_{req.document_id}")
        if cached_data:
            if not epitome:
                epitome = cached_data.get("document_epitome", "")
            cached_modules = cached_data.get("modules", [])
            if cached_modules:
                active_ids = {c.id for c in req.concepts}
                filtered = [m for m in cached_modules if m.get("id") in active_ids]
                modules_to_use = filtered if filtered else cached_modules
                modules_payload = json.dumps(modules_to_use, indent=2)
                module_count = len(modules_to_use)
    
    # Fallback to serializing request concepts if no cache exists
    if not modules_payload:
        modules_payload = json.dumps([
            {"id": c.id, "term": c.term, "definition": c.definition}
            for c in req.concepts
        ], indent=2)
    
    if not epitome:
        epitome = f"Comprehensive study guide covering core concepts for {req.deck_title}."

    user_content = "\n\n".join([
        f"document_epitome:\n{epitome}",
        f"modules ({module_count} total, every one must be addressed):\n{modules_payload}",
        "Write the audio instructional script.",
    ])
    
    logger.info("Generating script via single LLM call for %d modules (epitome='%s')...", module_count, epitome[:60])
    return await _call_llm_text(SCRIPT_WRITING_PROMPT, user_content)
    
async def _generate_optimized_script(script: str) -> str:
    logger.info("Generating optimized script for tts via single LLM call (%d chars)", len(script))
    return await _call_llm_text(SCRIPT_OPTIMIZATION_PROMPT, script)

async def _call_llm_text(system_prompt: str, user_content: str) -> str:
    try:
        completion = await llm_client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            temperature=0.2,
            max_tokens=LLM_MAX_TOKENS,
        )
        finish_reason = completion.choices[0].finish_reason
        if finish_reason != "stop":
            logger.warning("Script LLM call ended with finish_reason=%s; output may be truncated", finish_reason)
        return (completion.choices[0].message.content or "").strip()
    except (APIConnectionError, APIError) as e:
        logger.exception("LLM API error during script text generation (%s)", e)
        raise LLMConnectionError() from e
    except Exception as e:
        logger.exception("Unexpected error during script text generation: %s", e)
        raise LLMValidationFailed() from e