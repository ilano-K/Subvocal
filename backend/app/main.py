from contextlib import asynccontextmanager
from pathlib import Path
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.logger import setup_logging
from app.routers import api_router
from app.core.errors import AppError
from app.core.handlers import app_error_handler
from app.database.db import engine, Base

setup_logging()
logger = logging.getLogger("subvocal")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Subvocal backend directories and database...")
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    settings.docling_cache_dir.mkdir(parents=True, exist_ok=True)
    settings.session_dir.mkdir(parents=True, exist_ok=True)
    settings.parse_cache_dir.mkdir(parents=True, exist_ok=True)
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Subvocal backend ready. DB initialized at: %s", settings.database_path)
    yield


app = FastAPI(title='Subvocal backend', version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.add_exception_handler(AppError, app_error_handler)