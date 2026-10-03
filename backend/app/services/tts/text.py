from app.services.tts import manifest
import re 
import hashlib
import json 

def clean_text(text: str) -> str:
    # remove [pause...] tokens
    text = re.sub(r"\[pause\b[^\]]*\]", "", text, flags=re.IGNORECASE)
    
    # remove lines that only contain [Section: ...]
    text = re.sub(
        r"^[ \t]*\[SECTION:[^\]]*\][ \t]*\r?\n?",
        "",
        text,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    
    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Split into paragraphs
    paragraphs = text.split("\n")

    cleaned_paragraphs = []
    
    for paragraph in paragraphs:
        # Collapse whitespace inside the paragraph to one space.
        paragraph = re.sub(r"[^\S\n]+", " ", paragraph).strip()

        # Ignore empty paragraphs
        if paragraph:
            cleaned_paragraphs.append(paragraph)

    # 6. Join paragraphs with exactly one newline
    return "\n".join(cleaned_paragraphs)
    

def create_audio_id(text: str, voice: str) -> str:
    payload = {
        "model_version": manifest.MODEL_VERSION,
        "voice": voice,
        "text": text,
    }
    
    canonical = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()