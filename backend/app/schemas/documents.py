from pydantic import BaseModel

class DocumentParseResponse(BaseModel):
    document_id: str 
    extracted_text: str 
    page_count: int  
    