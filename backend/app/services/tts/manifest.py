"""
Manifest defining the static download specifications for Kokoro TTS assets.

Pins the exact Hugging Face repository revision, expected file sizes, and 
SHA-256 checksums to ensure reproducible, verifiable, and resumable downloads.
"""

from dataclasses import dataclass

# Hugging Face download link locked to an exact git commit
# This ensures we always get the exact files we tested, even if the repo updates later

REPO_ID = "hexgrad/Kokoro-82M"
REVISION = "f3ff3571791e39611d31c381e3a41a3af07b4987"
BASE_URL = f"https://huggingface.co/{REPO_ID}/resolve/{REVISION}/"
MODEL_VERSION = "kokoro-82m-v1.0@f3ff357+norm1"   # part of every audio_id; bump on any change
SAMPLE_RATE = 24000                                 # Kokoro outputs 24,000 samples per second

@dataclass(frozen=True)
class FileSpec:
    path: str
    size: int
    sha256: str | None

# Core model files: configuration and the AI neural weights (~327 MB)
MODEL_FILES = [
    FileSpec("config.json", 2351, "5ABB01E2403B072BF03D04FDE160443E209D7A0DAD49A423BE15196B9B43C17F"),
    FileSpec("kokoro-v1_0.pth", 327_212_226, "496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4"),
]

# Voice files to download (~0.5 MB each)
# Format: voice_id -> (FileSpec, UI dropdown name, voice quality rating)
VOICES = {  # key → (file, display name, grade from VOICES.md)
    "af_heart":   (FileSpec("voices/af_heart.pt",   523_425, "0ab5709b8ffab19bfd849cd11d98f75b60af7733253ad0d67b12382a102cb4ff"), "Heart (US, female)",  "A"),
    "af_bella":   (FileSpec("voices/af_bella.pt",   523_425, "8cb64e02fcc8de0327a8e13817e49c76c945ecf0052ceac97d3081480e8e48d6"), "Bella (US, female)",  "A-"),
    "bf_emma":    (FileSpec("voices/bf_emma.pt",    523_420, "d0a423deabf4a52b4f49318c51742c54e21bb89bbbe9a12141e7758ddb5da701"), "Emma (UK, female)",   "B-"),
    "am_michael": (FileSpec("voices/am_michael.pt", 523_435, "9a443b79a4b22489a5b0ab7c651a0bcd1a30bef675c28333f06971abbd47bd37"), "Michael (US, male)", "C+"),
}

# The default voice (used until the user picks one) is settings.tts_default_voice in app/config.py