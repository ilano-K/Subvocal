"""Starts the backend server. This is the entry point of the packaged desktop app; from source you can
also use `uvicorn app.main:app`."""
import ctypes
import multiprocessing
import os
import sys
import threading
import time

import uvicorn

from app.config import settings

if getattr(sys, "frozen", False):
    # The packaged app has no console: keep anything printed (including a crash before logging starts) in a file.
    try:
        _dir = settings.data_dir / "logs"
        _dir.mkdir(parents=True, exist_ok=True)
        sys.stdout = sys.stderr = open(_dir / "backend-console.log", "a", encoding="utf-8", buffering=1)
    except OSError:
        pass

from app.main import app  # noqa: E402  (after the output redirect so import-time errors are captured)

def exit_with_parent(pid: int) -> None:
    """The desktop app starts this process; if the app disappears (even by crashing), stop too."""
    SYNCHRONIZE = 0x00100000
    handle = ctypes.windll.kernel32.OpenProcess(SYNCHRONIZE, False, pid) if os.name == "nt" else None

    def alive() -> bool:
        if handle:
            return ctypes.windll.kernel32.WaitForSingleObject(handle, 0) != 0
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

    def watch() -> None:
        while alive():
            time.sleep(2)
        os._exit(0)

    threading.Thread(target=watch, name="parent-watch", daemon=True).start()


if __name__ == "__main__":
    multiprocessing.freeze_support()
    if os.environ.get("SUBVOCAL_PARENT_PID"):
        exit_with_parent(int(os.environ["SUBVOCAL_PARENT_PID"]))
    uvicorn.run(
        app,
        host=os.environ.get("SUBVOCAL_HOST", "127.0.0.1"),
        port=int(os.environ.get("SUBVOCAL_PORT", "8000")),
        log_level="info",
    )
