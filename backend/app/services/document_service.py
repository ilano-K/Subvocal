import anydoc

from pathlib import Path 
import logging 

from app.schemas.documents import DocumentParseResponse
from app.services import parse_cache
from app.core.errors import ProcessingError

logger = logging.getLogger("subvocal.anydoc")

def parse_document(file_path: Path) -> DocumentParseResponse:
    # 1. Check if the file has already been cached.
    content_hash = parse_cache.compute_content_hash(file_path)
    cached_result = parse_cache.get(content_hash)
    
    # 2. if cache exists, return the payload 
    if cached_result is not None:
        logger.info("Cache hit for document: %s", content_hash)
        return DocumentParseResponse(**cached_result)
    
    # 3. Run anydoc conversion
    try:
        markdown_content = anydoc.to_markdown(file_path)
    except Exception as e:
        logger.exception("Anydoc converter failed on file: %s", file_path)
        raise ProcessingError() from e 
    
    logger.info("Anydoc completed extraction for: %s", file_path)
    
    # 4. Construct payload 
    payload = DocumentParseResponse(
        document_id=content_hash,
        extracted_text=markdown_content
    )
    
    # 5. Cache the document
    parse_cache.save(content_hash, payload.model_dump())
    logger.info("Saved parse results to cache: %s", content_hash)
    
    return payload 