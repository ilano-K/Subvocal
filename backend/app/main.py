from contextlib import asynccontextmanager
import logging
import threading
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.logger import setup_logging
from app.routers import api_router
from app.core.errors import AppError
from app.core.handlers import app_error_handler
from app.database.db import engine as db_engine, Base
from app.services.tts import cache as tts_cache
from app.services.tts import prefs as tts_prefs
from app.services.tts.engine import engine as tts_engine
from app.services.tts.installer import installer as tts_installer
from app.services.tts.render_queue import queue as tts_queue

setup_logging()
logger = logging.getLogger("subvocal")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Subvocal backend directories and database...")
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    settings.session_dir.mkdir(parents=True, exist_ok=True)
    settings.parse_cache_dir.mkdir(parents=True, exist_ok=True)
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Subvocal backend ready. DB initialized at: %s", settings.database_path)

    # Optional narrator: nothing here may slow the startup or stop the API
    settings.tts_cache_dir.mkdir(parents=True, exist_ok=True)
    tts_cache.remove_leftovers()
    tts_engine.refresh_state()
    if settings.tts_autoload and tts_installer.is_installed() and tts_prefs.load().enabled:
        # loading takes 10-30 s, so it runs on its own thread
        threading.Thread(target=tts_engine.load, name="tts-loader", daemon=True).start()
    tts_queue.start()     # the worker just waits until the engine is ready

    yield

    tts_installer.cancel()
    tts_queue.stop()


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