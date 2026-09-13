import hashlib
import json
import os
from pathlib import Path

from app.config import settings


def compute_content_hash(file_path: Path) -> str:
    """Stream a SHA-256 hash of a file's contents.

    Reads in 1 MB chunks so a 50 MB upload is never loaded fully into memory.
    The hash doubles as the documentId and the cache lookup key.
    """
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def path_for(content_hash: str) -> Path:
    """Resolve the cache file path for a given content hash.

    Hex chars are filename-safe, so the hash can sit directly in the path.
    Example: .data/parse/e3b0c44298fc1c149afbf4c8996fb924...json
    """
    return settings.parse_cache_dir / f"{content_hash}.json"


def get(content_hash: str) -> dict | None:
    """Return the cached parse result for a hash, or None on a cache miss."""
    cache_path = path_for(content_hash)
    if not cache_path.exists():
        return None
    with open(cache_path, "r", encoding="utf-8") as f:
        return json.load(f)


def save(content_hash: str, payload: dict) -> Path:
    """Persist a parse result to the cache atomically.

    Writes to a sibling .tmp file then os.replace()s it over the target, so a
    crash mid-write can never leave a corrupt/truncated cache entry.
    """
    cache_path = path_for(content_hash)
    cache_path.parent.mkdir(parents=True, exist_ok=True)

    tmp_path = cache_path.with_suffix(".json.tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, cache_path)
    return cache_path