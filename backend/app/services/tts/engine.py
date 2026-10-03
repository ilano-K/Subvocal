from dataclasses import dataclass
import gc
import logging
import os
import threading
import time

import numpy as np
from app.services.tts.installer import installer
from app.services.tts.manifest import REPO_ID, SAMPLE_RATE, VOICES
from app.services.tts import prefs 
from app.config import settings 
from app.enums.tts import EngineState

logger = logging.getLogger(__name__)

SENTENCE_SPLIT = r"(?<=[.!?])\s+|\n+"        # one model call per sentence keeps the voice from rushing

@dataclass
class WordTiming:
    text: str
    start: float       # seconds from the start of the clip
    end: float
    char_start: int    # where the word begins in the rendered text (best-effort)

class KokoroEngine():
    def __init__(self):
        self.state: EngineState = EngineState.NOT_INSTALLED
        self.error: str | None = None 
        self._pipeline = None 
        self.lock = threading.RLock()
        self.ready = threading.Event()
        self.rtf_ema: float | None = None   # smoothed render speed, used for "time left"

    def refresh_state(self) -> None:
        if not installer.is_installed():
            self.state = EngineState.NOT_INSTALLED
        elif not prefs.load().enabled:
            self.state = EngineState.DISABLED
    
    def load(self) -> None: 
        with self.lock:
            if (
                self._pipeline is not None # already loaded
                or not prefs.load().enabled # disabled
                or not installer.is_installed() # not installed
            ):
                return
            self.state = EngineState.LOADING
            try:
                from kokoro import KModel, KPipeline
                import torch 
                
                # limit cpu threads
                # API and the UI stay responsive while a render runs
                threads = settings.tts_threads or max(1, (os.cpu_count() or 2) - 1)
                torch.set_num_threads(threads)
                
                # 1. base model dir
                model_dir = settings.tts_models_dir

                # 2. path to config and weights 
                config_path = str(model_dir / "config.json")
                model_path = str(model_dir / "kokoro-v1_0.pth")

                # 3. Load the model
                model = KModel(
                    repo_id=REPO_ID,
                    config = config_path,
                    model = model_path,
                ).to("cpu").eval()
                
                # 4. Initialize the pipeline
                pipe = KPipeline(
                    lang_code="a", 
                    repo_id=REPO_ID, 
                    model=model
                )
                
                if pipe.g2p.fallback is None:
                    self.state = EngineState.DEGRADED
                    return 
                
                # 5. Pre-load voice files
                for voice_key, (spec, _, _) in VOICES.items():
                    pipe.load_voice(str(model_dir / spec.path))
                # 6. Warm-up: the first render after loading is slow, so pay that
                #    cost now instead of on the user's first chunk
                first_voice = next(iter(VOICES))
                for _ in pipe("Hello.", voice=str(model_dir / VOICES[first_voice][0].path)):
                    pass

                self._pipeline = pipe 
                self.state = EngineState.READY
                self.ready.set()
            except Exception as e:
                # don't re-raise: this runs at startup, and a broken narrator must
                # never stop the API. The failure is reported through state + error.
                logger.exception("Kokoro failed to load")
                self._pipeline = None 
                self.state = EngineState.FAILED
                self.error = str(e) 
    
    def unload(self) -> None:
        # 1. Stop the queue worker from picking up new jobs. Done BEFORE taking the lock,
        self.ready.clear()

        # 2. Taking the lock waits for any render (or load) in progress to finish.
        with self.lock:
            # 3. Drop the reference to the pipeline and free the memory
            self._pipeline = None
            gc.collect()

            self.error = None
            self.refresh_state()
            if self.state not in (EngineState.NOT_INSTALLED, EngineState.DISABLED):
                self.state = EngineState.DISABLED

    def render(self, text: str, voice: str) -> tuple[np.ndarray, list[WordTiming]]:
        # Hold the lock for the whole render so unload() can't pull the pipeline away mid-way.
        with self.lock:
            # 1. Check if engine is ready
            if self._pipeline is None or self.state != EngineState.READY:
                raise RuntimeError(f"Cannot render: narrator is in state {self.state}")

            # 2. Turn the voice key ("af_heart") into the same file path load() used.
            #    Passing the bare key would make Kokoro download the voice from Hugging Face.
            spec, _, _ = VOICES[voice]
            voice_path = str(settings.tts_models_dir / spec.path)

            pieces: list[np.ndarray] = []   # audio of each result, joined at the end
            words: list[WordTiming] = []
            offset = 0.0                    # seconds of audio produced so far
            cursor = 0                      # where to search for the next word in `text`
            started = time.perf_counter()

            # 3. Call pipeline: it yields one result per sentence
            for result in self._pipeline(text, voice=voice_path, speed=1.0, split_pattern=SENTENCE_SPLIT):
                if result.audio is None:
                    continue
                audio = result.audio.detach().cpu().numpy().astype(np.float32)

                # 4. Word timings. Kokoro's timestamps restart at 0 for every result,
                #    so shift them by the audio that came before.
                for token in result.tokens or []:
                    if token.start_ts is None or not token.text.strip():
                        continue
                    pos = text.find(token.text, cursor)
                    if pos >= 0:
                        cursor = pos + len(token.text)
                    words.append(WordTiming(
                        text=token.text,
                        start=offset + token.start_ts,
                        end=offset + (token.end_ts if token.end_ts is not None else token.start_ts),
                        char_start=pos if pos >= 0 else cursor,
                    ))

                pieces.append(audio)
                offset += len(audio) / SAMPLE_RATE

            # 5. Speed measurement: seconds of work per second of audio, recent renders weigh more
            if offset > 0:
                rtf = (time.perf_counter() - started) / offset
                self.rtf_ema = rtf if self.rtf_ema is None else 0.7 * self.rtf_ema + 0.3 * rtf

            # 6. One continuous clip + the word timings
            full = np.concatenate(pieces) if pieces else np.zeros(0, dtype=np.float32)
            return full, words

engine = KokoroEngine()