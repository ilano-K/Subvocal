from enum import Enum, IntEnum


class EngineState(str, Enum):
    NOT_INSTALLED = "not_installed"
    DISABLED = "disabled"
    LOADING = "loading"
    READY = "ready"
    DEGRADED = "degraded"
    FAILED = "failed"


class InstallerState(str, Enum):
    DOWNLOADING = "downloading"
    VERIFYING = "verifying"
    INSTALLED = "installed"
    NOT_INSTALLED = "not_installed"
    CANCELLED = "cancelled"
    FAILED = "failed"


# from most to least urgent
class Priority(IntEnum):
    NOW = 0 # the waiting for the current chunk
    NEXT = 1 # the next two chunks
    DECK = 2 # everything

class JobStatus(str, Enum):
    QUEUED = "queued"
    RENDERING = "rendering"
    FAILED = "failed"
    READY = "ready"
