from fastapi import APIRouter
from app.routers.health import router as health_router
from app.routers.documents import router as documents_router
from app.routers.concepts import router as concepts_router
from app.routers.scripts import router as scripts_router
from app.config import settings

api_router = APIRouter(prefix=settings.api_prefix)

api_router.include_router(health_router)
api_router.include_router(documents_router)
api_router.include_router(concepts_router)
api_router.include_router(scripts_router)


