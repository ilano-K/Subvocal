from fastapi import APIRouter

from app.services import concepts_service
from app.schemas.concepts import ExtractConceptsRequest, ExtractConceptResponse
from app.core.errors import NotFoundError

router = APIRouter(prefix="/concepts")

@router.post("/extract", response_model=ExtractConceptResponse)
async def extract_concepts(request: ExtractConceptsRequest):
    return await concepts_service.extract_concepts_service(request.document_id)

