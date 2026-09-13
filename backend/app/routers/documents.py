from fastapi import APIRouter, UploadFile, File 
from pathlib import Path
import tempfile
import shutil

from app.schemas.documents import DocumentParseResponse
from app.services import documents_service
from app.config import settings
from app.core.errors import ProcessingError, UnsupportedFileType, FileTooLarge

router = APIRouter(prefix="/documents")

@router.post("/parse", response_model=DocumentParseResponse)
async def parse_document(
    file: UploadFile = File(..., description="The document file (PDF, DOCX, PPTX)")
):
    # 1. Grab file extension (.pdf, .pptx, .docx)
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    
    if suffix not in settings.allowed_document_extensions:
        raise UnsupportedFileType()
    
    # 2. Check file limit
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > settings.max_file_size_limit:
        raise FileTooLarge()
    
    # 3. Write UploadFile to a temporary file on disk 
    session_dir = Path(settings.session_dir)
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=session_dir) as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = Path(tmp_file.name)
            
            # 4. Pass the temporary path
            result = documents_service.parse_document(tmp_path)
            
    # for now
    except ProcessingError as e:
        raise ProcessingError() from e
    
    finally:
        # 5. Clean the temporary file
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)
    
    # 6. Return response
    return result
 