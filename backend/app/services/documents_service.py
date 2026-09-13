from docling.document_converter import DocumentConverter
from pathlib import Path 

from app.core.errors import ProcessingError
from app.services import parse_cache
from app.schemas.documents import DocumentParseResponse

converter = DocumentConverter()

def parse_document(file_path: Path) -> DocumentParseResponse:
    # 1. Check if the file has already been cached
    content_hash = parse_cache.compute_content_hash(file_path)
    cached_result = parse_cache.get(content_hash)
    
    # 2. if cache exists, return the payload
    if cached_result is not None:
        return DocumentParseResponse(**cached_result)

    # 3. Run docling conversion
    try:
        conv_result = converter.convert(file_path)
        doc = conv_result.document
    except Exception as e:
        raise ProcessingError() from e
    
    # 4. Export markdown/text 
    extracted_text = doc.export_to_markdown()
    
    # 5. Extract page count 
    page_count = len(doc.pages) if hasattr(doc, "pages") else 1
    
    # 6. construct payload
    payload = DocumentParseResponse(
        document_id=content_hash,
        extracted_text=extracted_text,
        page_count=page_count
    )
    
    # 7. Cache the document 
    parse_cache.save(content_hash, payload.model_dump())
    
    # 6. return payload
    return payload