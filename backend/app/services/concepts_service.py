import logging
from pydantic import ValidationError

from app.services import parse_cache
from app.core.errors import NotFoundError, LLMValidationFailed, LLMConnectionError
from app.services import llm_service
from app.config import settings
from app.schemas.concepts import ExtractConceptResponse, ExtractConceptLLMResponse, LLMUsage
from app.prompts.concepts import SYSTEM_PROMPT

logger = logging.getLogger("subvocal.concepts")

async def extract_concepts_service(document_id: str):
    logger.info("Extracting concepts for document_id: %s", document_id)
    # 1. Fetch source text using document_id
    data = parse_cache.get(document_id)
    
    if data is None:
        logger.warning("Document not found in parse cache: %s", document_id)
        raise NotFoundError()
    
    source_text = data["extracted_text"]
    logger.info("Found cached text (%d chars). Dispatching to LLM (%s)...", len(source_text), llm_service.label())

    # 2. Call llm service for concept extraction
    document_epitome, modules, usage = await _extract_concepts_with_llm(source_text)
    logger.info("Successfully extracted %d concepts. Usage: prompt=%d, completion=%d, total=%d",
                len(modules), usage.prompt_tokens, usage.completion_tokens, usage.total_tokens)
    
    # 3. Cache the extracted rich modules and epitome for downstream script compilation
    parse_cache.save(f"concepts_{document_id}", {
        "document_epitome": document_epitome,
        "modules": [m.model_dump() for m in modules]
    })
    
    return ExtractConceptResponse(
        document_id=document_id,
        document_epitome=document_epitome,
        modules=modules,
        usage=usage
    )

async def _extract_concepts_with_llm(text: str):
    logger.info("Sending concept extraction prompt to model '%s'...", llm_service.label())
    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        },
        {
            "role": "user",
            "content": f"Extract study concepts from the following document text.\n\n{text}",
        },
    ]

    raw_content = ""
    try:
        completion = await llm_service.complete(
            messages,
            max_tokens=32000,  # explicit budget; the provider default can truncate the JSON
            json_mode=True,
            default_extra={"reasoning_effort": "none"},  # only the .env model gets this: faster response
        )

        raw_content = completion.text
        logger.info("=== LLM CONCEPT EXTRACTION RAW OUTPUT ===")
        logger.info("\n%s", raw_content)
        logger.info("=========================================")

        result = ExtractConceptLLMResponse.model_validate_json(raw_content)
        
        usage = LLMUsage(
            prompt_tokens=completion.prompt_tokens,
            completion_tokens=completion.completion_tokens,
            total_tokens=completion.total_tokens,
        )
        return result.document_epitome, result.modules, usage

    except LLMConnectionError:
        raise
    except (ValidationError, Exception) as e:
        logger.exception("Pydantic validation failed on LLM response schema. Raw content was: %s", raw_content)
        raise LLMValidationFailed() from e