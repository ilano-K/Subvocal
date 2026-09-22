from pydantic import BaseModel
from typing import Optional

class DocumentParseResponse(BaseModel):
    document_id: str 
    extracted_text: str 
    page_count: Optional[int]  = None
    