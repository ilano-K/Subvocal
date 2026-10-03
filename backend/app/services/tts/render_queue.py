from dataclasses import dataclass
import logging
import threading

from app.services.tts import cache
from app.services.tts.engine import engine
from app.services.tts.manifest import MODEL_VERSION
from app.enums.tts import EngineState, Priority, JobStatus

logger = logging.getLogger(__name__)

@dataclass
class JobOrigin:
    """Where a clip came from, so the app can say what is being prepared and for which deck."""
    deck_key: str
    deck_title: str
    title: str      # section title
    index: int      # position in the deck (0-based)
    total: int      # sections in the deck when it was queued


@dataclass
class Job:
    audio_id: str
    text: str
    voice: str
    status: JobStatus
    priority: Priority
    word_count: int
    arrival_number: int         # order the job arrived in, breaks ties inside a priority
    error: str | None = None
    origin: JobOrigin | None = None

class Queue():
    def __init__(self):
        self.jobs: dict[str, Job] = {}
        # RLock so the worker can pick a job and mark it rendering in ONE lock block,
        # even though next_job() takes the lock as well
        self.lock = threading.RLock()
        self._counter = 0
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def _take_number(self) -> int:
        # callers hold the lock
        self._counter += 1
        return self._counter

    def fail_all_pending(self) -> None :
        with self.lock:
            for job in self.jobs.values():
                if job.status in (JobStatus.QUEUED, JobStatus.RENDERING):
                    job.status = JobStatus.FAILED
                    job.error = "narrator removed"

    def activity(self) -> list[dict]:
        """Decks that still have sections waiting or rendering, and the section being rendered now."""
        with self.lock:
            decks: dict[str, dict] = {}
            for job in self.jobs.values():
                o = job.origin
                if o is None:
                    continue
                d = decks.setdefault(o.deck_key, {
                    "deck_key": o.deck_key, "deck_title": o.deck_title,
                    "total": 0, "pending": 0, "current_title": None, "current_index": None,
                })
                d["deck_title"] = o.deck_title
                d["total"] = max(d["total"], o.total)
                if job.status in (JobStatus.QUEUED, JobStatus.RENDERING):
                    d["pending"] += 1
                if job.status == JobStatus.RENDERING:
                    d["current_title"] = o.title
                    d["current_index"] = o.index
            return [d for d in decks.values() if d["pending"] > 0]

    def pending_words(self) -> int:
        with self.lock:
            return sum(
                job.word_count for job in self.jobs.values()
                if job.status in (JobStatus.QUEUED, JobStatus.RENDERING)
            )

    def request(
        self,
        audio_id: str, text: str,
        voice: str, priority: Priority,
        origin: JobOrigin | None = None,
    ) -> JobStatus:
        """the text must already be cleaned,
        and the id must come from that cleaned text."""
        # Case 1: Clip is in the cache
        cached = cache.is_ready(audio_id)

        if cached:
            return JobStatus.READY

        with self.lock:
            existing_job = self.jobs.get(audio_id)

            if existing_job is not None:
                if origin is not None:
                    existing_job.origin = origin
                # if job is queued, update the priority if necessary.
                # Otherwise, return the status
                if existing_job.status == JobStatus.QUEUED:
                    current_priority = existing_job.priority
                    if current_priority > priority:
                        existing_job.priority = priority
                    return JobStatus.QUEUED

                if existing_job.status == JobStatus.FAILED or existing_job.status == JobStatus.READY:
                    # reset or clear the job here
                    existing_job.status = JobStatus.QUEUED
                    existing_job.error = None

                    # update priority, and line up behind the jobs already waiting
                    existing_job.priority = priority
                    existing_job.arrival_number = self._take_number()

                    return JobStatus.QUEUED
                return JobStatus.RENDERING

            # The job is new
            word_count = len(text.split())
            job = Job(
                audio_id, text,
                voice, JobStatus.QUEUED,
                priority, word_count,
                self._take_number(),
                origin=origin,
            )

            self.jobs[audio_id] = job

            return JobStatus.QUEUED

    def prioritize(self, audio_ids: list[str]) -> None:
        """The first id becomes NOW and the rest NEXT. Only jobs still waiting are
        touched, and any other waiting job that was urgent drops back to DECK, so a
        stale NOW from before the user jumped can't render ahead of the new one."""
        wanted = {
            audio_id: (Priority.NOW if i == 0 else Priority.NEXT)
            for i, audio_id in enumerate(audio_ids)
        }
        with self.lock:
            for job in self.jobs.values():
                if job.status != JobStatus.QUEUED:
                    continue
                job.priority = wanted.get(job.audio_id, Priority.DECK)

    def get_job(self, audio_id: str) -> Job | None:
        with self.lock:
            return self.jobs.get(audio_id)

    def next_job(self) -> Job | None:
        with self.lock:
            queued_jobs = [job for job in self.jobs.values() if job.status == JobStatus.QUEUED]

            return min(
                queued_jobs,
                key=lambda job: (job.priority, job.arrival_number),
                default=None
            )

    # ---- The worker ----

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="tts-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop.is_set():
            # 1. Nothing can render until the engine is ready. The timeout means we
            #    come back and check _stop instead of waiting forever.
            if not engine.ready.wait(timeout=1):
                continue

            # 2. Pick a job and mark it rendering in one lock block, so
            #    fail_all_pending() can't slip in between the two.
            with self.lock:
                job = self.next_job()
                if job is not None:
                    job.status = JobStatus.RENDERING

            if job is None:
                self._stop.wait(0.2)    # a sleep that wakes up early if stop() is called
                continue

            # 3. Render. The queue's lock is NOT held here: a render takes many seconds
            #    and request() / get_job() must stay instant.
            try:
                audio, words = engine.render(job.text, job.voice)
                cache.write(job.audio_id, audio, words, job.voice, MODEL_VERSION)
                cache.evict(keep={job.audio_id})

                with self.lock:
                    if job.status == JobStatus.RENDERING:   # not failed in the meantime
                        job.status = JobStatus.READY

            except Exception as e:
                with self.lock:
                    if job.status != JobStatus.RENDERING:
                        continue        # already failed by fail_all_pending(), leave it
                    if engine.state != EngineState.READY:
                        # the narrator was turned off mid-render: wait for it to come back
                        job.status = JobStatus.QUEUED
                    else:
                        logger.exception("Rendering %s failed", job.audio_id)
                        job.status = JobStatus.FAILED
                        job.error = str(e)


queue = Queue()
