import logging
from fastapi import APIRouter, UploadFile, File 
from pathlib import Path
import tempfile
import shutil

from app.schemas.documents import DocumentParseResponse
from app.services import document_service
from app.config import settings
from app.core.errors import ProcessingError, UnsupportedFileType, FileTooLarge

logger = logging.getLogger("subvocal.documents")
router = APIRouter(prefix="/documents")

@router.post("/parse", response_model=DocumentParseResponse)
async def parse_document(
    file: UploadFile = File(..., description="The document file (PDF, DOCX, PPTX)")
):
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    logger.info("Received parse request for file: %s (suffix: %s)", filename, suffix)
    
    if suffix not in settings.allowed_document_extensions:
        logger.warning("Unsupported file extension: %s", suffix)
        raise UnsupportedFileType()
    
    # 2. Check file limit
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    logger.info("File size: %d bytes (limit: %d bytes)", file_size, settings.max_file_size_limit)

    if file_size > settings.max_file_size_limit:
        logger.warning("File %s exceeds size limit (%d > %d)", filename, file_size, settings.max_file_size_limit)
        raise FileTooLarge()
    
    # 3. Write UploadFile to a temporary file on disk 
    session_dir = Path(settings.session_dir)
    session_dir.mkdir(parents=True, exist_ok=True)
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=session_dir) as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = Path(tmp_file.name)
            logger.info("Stored temporary upload at: %s", tmp_path)
            
            # 4. Pass the temporary path
            result = document_service.parse_document(tmp_path)
            logger.info("Document parsed successfully. doc_id=%s, pages=%s, text_len=%d",
                        result.document_id, result.page_count, len(result.extracted_text))
            
    except ProcessingError as e:
        logger.exception("Failed to process document: %s", filename)
        raise ProcessingError() from e
    
    finally:
        # 5. Clean the temporary file
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)
            logger.debug("Cleaned up temporary upload file: %s", tmp_path)
    
    # 6. Return response
    return result
 