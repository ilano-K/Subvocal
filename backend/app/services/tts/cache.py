"""
Rendered audio on disk: one audio file + one info file per clip, found by audio id.

Layout:  <tts_cache_dir>/<first 2 chars of id>/<id>.ogg   (or .wav)
                                              /<id>.json  (written LAST = "ready" marker)
"""

import json
import os
import re
import shutil
import threading
from pathlib import Path

from app.config import settings
from app.services.tts.manifest import SAMPLE_RATE

AUDIO_EXTS = (".ogg", ".wav")
TMP_SUFFIX = ".tmp"
ID_RE = re.compile(r"^[0-9a-f]{64}$")   # what text.create_audio_id() produces

# one lock for everything that writes or deletes, so evict() can't delete a clip
# while write() is halfway through it
_lock = threading.Lock()


# ---- Paths ----

def _check_id(audio_id: str) -> str:
    # the id reaches us from a URL, so never let something like "../../x" become a path
    if not ID_RE.match(audio_id):
        raise ValueError(f"Invalid audio id: {audio_id!r}")
    return audio_id


def _folder(audio_id: str) -> Path:
    return settings.tts_cache_dir / _check_id(audio_id)[:2]


def _info_path(audio_id: str) -> Path:
    return _folder(audio_id) / f"{audio_id}.json"


def audio_path(audio_id: str) -> Path | None:
    """The finished audio file for this id, or None. The router serves this file."""
    if not is_ready(audio_id):
        return None
    for ext in AUDIO_EXTS:
        path = _folder(audio_id) / f"{audio_id}{ext}"
        if path.exists():
            return path
    return None


# ---- Queries ----

def is_ready(audio_id: str) -> bool:
    """True only if the clip was completely written (the info file is written last)."""
    info = _info_path(audio_id)
    return info.exists() and any(
        (info.parent / f"{audio_id}{ext}").exists() for ext in AUDIO_EXTS
    )


def read_info(audio_id: str) -> dict | None:
    try:
        return json.loads(_info_path(audio_id).read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return None


def size() -> int:
    """Total bytes used by the cache folder."""
    root = settings.tts_cache_dir
    if not root.exists():
        return 0
    return sum(p.stat().st_size for p in root.rglob("*") if p.is_file())


# ---- Actions ----

def write(audio_id: str, audio, words, voice: str, model_version: str) -> dict:
    """
    Save a rendered clip. `audio` is the float32 numpy array from engine.render(),
    `words` the list of WordTiming. Returns the info dict.
    """
    import soundfile as sf   # imported here: users without the narrator don't have it

    fmt = "wav" if settings.tts_format == "wav" else "ogg"
    folder = _folder(audio_id)
    final_audio = folder / f"{audio_id}.{fmt}"
    final_info = _info_path(audio_id)

    info = {
        "audioId": audio_id,
        "voice": voice,
        "modelVersion": model_version,
        "durationSec": round(len(audio) / SAMPLE_RATE, 3),
        "words": [
            {"text": w.text, "start": round(w.start, 3), "end": round(w.end, 3), "charStart": w.char_start}
            for w in words
        ],
    }

    with _lock:
        folder.mkdir(parents=True, exist_ok=True)

        # 1. Audio to a temp file, then rename. The temp name has no .ogg/.wav ending,
        #    so soundfile needs to be told the format.
        tmp_audio = final_audio.with_name(final_audio.name + TMP_SUFFIX)
        # Written in 1-second blocks: libsndfile's Vorbis encoder overflows the stack
        # on Windows when a long clip goes in with a single call.
        kind, subtype = ("OGG", "VORBIS") if fmt == "ogg" else ("WAV", "PCM_16")
        with sf.SoundFile(tmp_audio, "w", SAMPLE_RATE, 1, format=kind, subtype=subtype) as out:
            for i in range(0, len(audio), SAMPLE_RATE):
                out.write(audio[i:i + SAMPLE_RATE])
        tmp_audio.replace(final_audio)

        # 2. Info LAST. Until this rename happens, is_ready() stays False,
        #    so a crash before this point never looks like a finished clip.
        tmp_info = final_info.with_name(final_info.name + TMP_SUFFIX)
        tmp_info.write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
        tmp_info.replace(final_info)

    return info


def touch(audio_id: str) -> None:
    """Mark the clip as recently used. Eviction goes by the info file's modified time."""
    try:
        os.utime(_info_path(audio_id))
    except FileNotFoundError:
        pass


def _delete_clip(audio_id: str) -> None:
    folder = _folder(audio_id)
    # info first, so the clip stops counting as ready before its audio disappears
    _info_path(audio_id).unlink(missing_ok=True)
    for ext in AUDIO_EXTS:
        (folder / f"{audio_id}{ext}").unlink(missing_ok=True)


def evict(keep: set[str] | frozenset[str] = frozenset()) -> int:
    """
    While the cache is bigger than tts_cache_max_mb, delete the least recently used
    clip (audio + info), never touching the ids in `keep`. Returns how many were deleted.
    """
    limit = settings.tts_cache_max_mb * 1024 * 1024
    root = settings.tts_cache_dir
    if not root.exists():
        return 0

    with _lock:
        # gather every finished clip: (last used, id, bytes)
        clips = []
        total = 0
        for info in root.glob("*/*.json"):
            audio_id = info.stem
            if not ID_RE.match(audio_id):
                continue
            nbytes = info.stat().st_size + sum(
                p.stat().st_size for ext in AUDIO_EXTS
                if (p := info.parent / f"{audio_id}{ext}").exists()
            )
            total += nbytes
            clips.append((info.stat().st_mtime, audio_id, nbytes))

        deleted = 0
        for _, audio_id, nbytes in sorted(clips):   # oldest first
            if total <= limit:
                break
            if audio_id in keep:
                continue
            _delete_clip(audio_id)
            total -= nbytes
            deleted += 1
        return deleted


def clear() -> None:
    """Delete every clip."""
    with _lock:
        shutil.rmtree(settings.tts_cache_dir, ignore_errors=True)
        settings.tts_cache_dir.mkdir(parents=True, exist_ok=True)


def remove_leftovers() -> int:
    """
    Run at startup: delete half-written temp files and audio without an info file
    (a crash between step 1 and step 2 of write()). Returns how many files were removed.
    """
    root = settings.tts_cache_dir
    if not root.exists():
        return 0

    removed = 0
    with _lock:
        for path in root.glob("*/*"):
            if not path.is_file():
                continue
            orphan_audio = path.suffix in AUDIO_EXTS and not path.with_suffix(".json").exists()
            if path.name.endswith(TMP_SUFFIX) or orphan_audio:
                path.unlink(missing_ok=True)
                removed += 1
    return removed
