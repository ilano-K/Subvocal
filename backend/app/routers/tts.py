from fastapi import APIRouter, Query, BackgroundTasks
from fastapi.responses import FileResponse

from app.services.tts.manifest import VOICES
from app.services.tts.installer import installer
from app.services.tts.engine import engine
from app.services.tts import prefs as prefs_service
from app.services.tts.render_queue import queue, JobOrigin
from app.services.tts import cache
from app.services.tts.text import clean_text, create_audio_id

from app.schemas.tts import (
    InstallStatus, HealthResponse, 
    Voice, TTSPrefsUpdate, 
    PrepareClipsRequest, ClipStatus,
    TTSPrefs, ClipStatusRequest, PrioritizeRequest, PreviewRequest,
    CoverageRequest, DeckCoverage, DeckActivity
)

from app.core.errors import TTSInstallConflict, TTSUnavailable, TTSVoiceNotFound, NotFoundError
from app.enums.tts import InstallerState, EngineState, Priority, JobStatus

from app.config import settings 


router = APIRouter(prefix="/tts")

PREVIEW_TEXT = "Hello, this is how I will read your study material."

def _install_progress() -> InstallStatus:
    download_bytes = sum(f.size for f in installer.files())
    return InstallStatus(
        state=installer.state,
        error=installer.error,
        done_bytes=installer.done_bytes,
        total_bytes=installer.total_bytes,
        bytes_per_sec=installer.bytes_per_sec,
        installed_bytes=installer.installed_bytes(),
        download_bytes=download_bytes
    )
    
@router.get("/health", response_model=HealthResponse)
def check_health():
    voices = []
    for voice_key, (_, name, grade) in VOICES.items():
        voices.append(
            Voice(
                key=voice_key,
                name=name,
                grade=grade,
            )
        )
    return HealthResponse(
        state=engine.state,
        error=engine.error,
        settings=prefs_service.load(),
        voices=voices,
        install_status=_install_progress(),
        rtf=engine.rtf_ema,
        pending_words=queue.pending_words(),
        cache_bytes=cache.size(),
        activity=[DeckActivity(**d) for d in queue.activity()],
    )

@router.post("/install")
def install() -> InstallStatus:
    # Download and start the engine in the background
    installer.start(on_installed=engine.load)
    return _install_progress()
    
@router.post("/install/cancel", status_code=204)
def cancel_install():
    # Cancel installation
    installer.cancel()
    return 
    
@router.delete("/install", status_code=204)
def delete_install(clear_audio: bool = Query(False, alias="clearAudio")):
    state = installer.state 

    # Refuse delete if download is running
    if state in (InstallerState.DOWNLOADING, InstallerState.VERIFYING):
        raise TTSInstallConflict("Cancel the download before removing the narrator")
    
    # unload the engine and delete
    engine.unload()
        
    queue.fail_all_pending()
    installer.uninstall()
    
    if clear_audio:
        cache.clear()
    engine.refresh_state()

@router.delete("/cache", status_code=204)
def delete_cache():
    cache.clear()
    
@router.put("/settings", response_model=TTSPrefs)
def save_settings(request: TTSPrefsUpdate, background_tasks: BackgroundTasks):
    voice = request.voice 
    
    # verify the voice 
    if voice is not None and voice not in VOICES:
        raise TTSVoiceNotFound(f"Unknown voice: {request.voice}")
    
    current = prefs_service.load()
    updated = current.model_copy(update=request.model_dump(exclude_unset=True, exclude_none=True))
        
    prefs_service.save(updated)
    
    # enabled to disabled
    if current.enabled and not updated.enabled:
        engine.unload()
    
    # disabled to enabled
    elif not current.enabled and updated.enabled:
        background_tasks.add_task(engine.load)
    
    return updated

@router.post("/status", response_model=list[ClipStatus])
def get_status(request: ClipStatusRequest):
    clip_statuses = []
    for audio_id in request.audio_ids:
        duration = None
        error = None

        # a malformed id counts as "not cached" so one bad id can't fail the whole list
        try:
            cached = cache.is_ready(audio_id)
        except ValueError:
            cached = False

        if cached:
            # the cache is the source of truth for "ready"
            status = JobStatus.READY
            info = cache.read_info(audio_id)
            duration = info["durationSec"] if info else None
        else:
            job = queue.get_job(audio_id)
            if job is not None:
                status = job.status
                error = job.error
            else:
                status = JobStatus.FAILED
                error = "unknown audio id"

        clip_statuses.append(ClipStatus(
            audio_id=audio_id,
            status=status,
            durationSec=duration,
            error=error,
        ))

    return clip_statuses


@router.post("/prepare", response_model=list[ClipStatus])
def prepare_clips(request: PrepareClipsRequest):
    # 1. Check the engine 
    if engine.state not in (EngineState.LOADING, EngineState.READY):
        raise TTSUnavailable("The narrator engine is not available")
    
    # 2. Pick the voice (The request may not pass a voice)
    voice = request.voice or prefs_service.load().voice
    if voice not in VOICES:
        raise TTSVoiceNotFound(f"Unknown voice: {voice}")
    
    clip_statuses = []
    
    # 3. For each chunk:
    for i, chunk in enumerate(request.chunks):
         # work out the priority
        offset = i - request.startIndex
        if offset == 0:
            priority = Priority.NOW
        elif 1 <= offset <= 2:
            priority = Priority.NEXT
        else:
            priority = Priority.DECK
        
        # clean text and create audio id with (clean text, voice)
        clean = clean_text(chunk.text)
        audio_id = create_audio_id(clean, voice)
    
        # ask the queue
        origin = None
        if request.deckKey:
            origin = JobOrigin(
                deck_key=request.deckKey,
                deck_title=request.deckTitle or "Untitled audio",
                title=chunk.title or f"Section {i + 1}",
                index=i,
                total=len(request.chunks),
            )
        job_status = queue.request(
            audio_id,
            clean,
            voice,
            priority,
            origin,
        )
        
        duration = None
        error = None
        
        if job_status == JobStatus.READY:
            info = cache.read_info(audio_id)
            duration = info["durationSec"] if info else None
        
        if job_status == JobStatus.FAILED:
            job = queue.get_job(audio_id)
            error = job.error if job else None
            
        # build a clip status
        clip_status = ClipStatus(
            id = chunk.id,
            audio_id=audio_id,
            status=job_status,
            durationSec=duration,
            error=error
        )
        
        clip_statuses.append(clip_status)
       
    return clip_statuses

@router.get("/audio/{audio_id}")
def get_audio(audio_id: str):
    try:
        audio_path = cache.audio_path(audio_id)
    except ValueError:
        audio_path = None

    if audio_path is None:
        raise NotFoundError("Requested audio is not available")
    
    # mark as recently used
    cache.touch(audio_id)
    
    return FileResponse(
        path=audio_path,
        media_type="audio/ogg" if audio_path.suffix == ".ogg" else "audio/wav",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )

@router.get("/timings/{audio_id}")
def get_timings(audio_id: str) -> dict:
    # a malformed id raises ValueError inside the cache; treat it like "not found"
    try:
        info = cache.read_info(audio_id)
    except ValueError:
        info = None

    if info is None:
        raise NotFoundError("Requested audio is not available")

    return info


@router.post("/prioritize", status_code=204)
def prioritize_clips(request: PrioritizeRequest):
    queue.prioritize(request.audio_ids)


@router.post("/preview", response_model=ClipStatus)
def preview_voice(request: PreviewRequest):
    if engine.state not in (EngineState.LOADING, EngineState.READY):
        raise TTSUnavailable("The narrator engine is not available")
    if request.voice not in VOICES:
        raise TTSVoiceNotFound(f"Unknown voice: {request.voice}")

    clean = clean_text(PREVIEW_TEXT)
    audio_id = create_audio_id(clean, request.voice)
    status = queue.request(audio_id, clean, request.voice, Priority.NOW)

    duration = None
    if status == JobStatus.READY:
        info = cache.read_info(audio_id)
        duration = info["durationSec"] if info else None

    return ClipStatus(audio_id=audio_id, status=status, durationSec=duration)


@router.post("/coverage", response_model=list[DeckCoverage])
def coverage(request: CoverageRequest):
    """How much of each deck is already rendered. Read-only: never queues anything."""
    voice = request.voice or prefs_service.load().voice
    if voice not in VOICES:
        raise TTSVoiceNotFound(f"Unknown voice: {voice}")

    result = []
    for deck in request.decks:
        total = 0
        ready = 0
        for text in deck.texts:
            clean = clean_text(text)
            if not clean:
                continue    # nothing to say, so prepare skips it too
            total += 1
            if cache.is_ready(create_audio_id(clean, voice)):
                ready += 1
        result.append(DeckCoverage(id=deck.id, total=total, ready=ready))
    return result
