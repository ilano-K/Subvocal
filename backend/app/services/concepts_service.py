import json
import logging
from openai import APIConnectionError, APIError
from pydantic import ValidationError

from app.services import parse_cache
from app.core.errors import NotFoundError, LLMValidationFailed, LLMConnectionError
from app.core.json_parser import extract_and_parse_json
from app.services.llm_service import client as llm_client
from app.config import settings
from app.schemas.concepts import ExtractConceptResponse, ExtractConceptLLMResponse, LLMUsage

logger = logging.getLogger("subvocal.concepts")

async def extract_concepts_service(document_id: str):
    logger.info("Extracting concepts for document_id: %s", document_id)
    # 1. Fetch source text using document_id
    data = parse_cache.get(document_id)
    
    if data is None:
        logger.warning("Document not found in parse cache: %s", document_id)
        raise NotFoundError()
    
    source_text = data["extracted_text"]
    logger.info("Found cached text (%d chars). Dispatching to LLM (%s)...", len(source_text), settings.llm_model)

    # 2. Call llm service for concept extraction
    concepts, usage = await _extract_concepts_with_llm(source_text)
    logger.info("Successfully extracted %d concepts. Usage: prompt=%d, completion=%d, total=%d",
                len(concepts), usage.prompt_tokens, usage.completion_tokens, usage.total_tokens)
    
    return ExtractConceptResponse(
        document_id=document_id,
        concepts=concepts,
        usage=usage,
    )

async def _extract_concepts_with_llm(text: str):
    logger.info("Sending concept extraction prompt to model '%s'...", settings.llm_model)
    messages = [
        {
            "role": "system",
            "content": (
                "You extract the most important study concepts from a document "
                "into concise, phonetically natural definitions that can be read "
                "aloud by speech synthesis.\n\n"
                "Rules:\n"
                "- Return only high-value items a student should remember.\n"
                "- Write definitions as smooth spoken sentences; avoid LaTeX, "
                "Markdown bullets, symbols, or complex formulas.\n"
                "- Output ONLY valid JSON matching this structure: {\"concepts\": [{\"id\": \"c1\", \"term\": \"...\", \"definition\": \"...\"}]}\n"
                "- Do NOT wrap with double braces {{ }}, and do NOT include any commentary outside the JSON."
            ),
        },
        {
            "role": "user",
            "content": f"Extract study concepts from the following document text.\n\n{text}",
        },
    ]

    try:
        completion = await llm_client.chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            response_format={"type": "json_object"},
        )

        raw_content = completion.choices[0].message.content or ""
        logger.info("=== LLM CONCEPT EXTRACTION RAW OUTPUT ===")
        logger.info("\n%s", raw_content)
        logger.info("=========================================")

        parsed_data = extract_and_parse_json(raw_content, ExtractConceptLLMResponse)

        for i, c in enumerate(parsed_data.concepts, 1):
            logger.info("  [%d] %s: %s", i, c.term, c.definition)

        usage = LLMUsage(
            prompt_tokens=completion.usage.prompt_tokens if completion.usage else 0,
            completion_tokens=completion.usage.completion_tokens if completion.usage else 0,
            total_tokens=completion.usage.total_tokens if completion.usage else 0,
        )
        return parsed_data.concepts, usage

    except APIConnectionError as e:
        logger.exception("Failed to connect to LLM provider at: %s", settings.llm_base_url)
        raise LLMConnectionError() from e
    except APIError as e:
        logger.exception("LLM provider returned an API error: %s", e)
        raise LLMConnectionError() from e
    except (ValidationError, Exception) as e:
        logger.exception("Pydantic validation failed on LLM response schema. Raw content was: %s", locals().get("raw_content", "None"))
        raise LLMValidationFailed() from e