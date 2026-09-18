from fastapi import APIRouter

from app.schemas.scripts import CompileScriptRequest, CompileScriptResponse
from app.services import script_compiler

router = APIRouter(prefix="/scripts")


@router.post("/compile", response_model=CompileScriptResponse)
async def compile_script(request: CompileScriptRequest):
    return await script_compiler.compile_script(request)
