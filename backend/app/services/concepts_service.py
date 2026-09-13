from openai import APIConnectionError, APIError
from pydantic import ValidationError

from app.services import parse_cache
from app.core.errors import NotFoundError, LLMValidationFailed, LLMConnectionError
from app.services.llm_service import client as llm_client
from app.config import settings
from app.schemas.concepts import ExtractConceptResponse ,ExtractConceptLLMResponse, LLMUsage

async def extract_concepts_service(document_id: str):
    # 1. Fetch source text using document_id
    data = parse_cache.get(document_id)
    
    if data is None:
        raise NotFoundError()
    
    # 2. Call llm service for concept extraction
    concepts, usage = await _extract_concepts_with_llm(data["extracted_text"])
    
    return ExtractConceptResponse(
        document_id=document_id,
        concepts=concepts,
        usage=usage,
    )

async def _extract_concepts_with_llm(text: str):
    try:
        completion = await llm_client.beta.chat.completions.parse(
            model=settings.llm_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You extract the most important study concepts from a document "
                        "into concise, phonetically natural definitions that can be read "
                        "aloud by speech synthesis."
                        "Rules:\n"
                        "- Return only high-value items a student should remember.\n"
                        "- Write definitions as smooth spoken sentences; avoid LaTeX, "
                        "Markdown bullets, symbols, or complex formulas.\n"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Extract study concepts from the following document text.\n\n"
                        f"{text}"
                    ),
                },
            ],
            response_format=ExtractConceptLLMResponse
        )
        return (
            completion.choices[0].message.parsed.concepts,
            LLMUsage(
                prompt_tokens=completion.usage.prompt_tokens,
                completion_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens
            )
        )
    except APIConnectionError as e:
        raise LLMConnectionError() from e
    except APIError as e:
        raise LLMConnectionError() from e
    except ValidationError as e:
        raise LLMValidationFailed() from e