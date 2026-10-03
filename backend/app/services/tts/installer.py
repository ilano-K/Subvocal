"""
Downloader and manager for Kokoro TTS model weights and voice files.
Supports pause/resume via HTTP Range requests and verifies SHA-256 checksums.
"""

import hashlib
import json
import shutil
import sys
import threading
import time
from pathlib import Path

import httpx

from app.config import settings
from app.core.errors import InsufficientDiskSpace, TTSInstallConflict
from app.services.tts.manifest import BASE_URL, MODEL_FILES, MODEL_VERSION, REVISION, VOICES
from app.enums.tts import InstallerState

MARKER = "installed.json"
CHUNK_SIZE = 1 << 20  # 1 MiB chunk size for streaming



class _Cancelled(Exception):
    """Internal signal when a download task is stopped cleanly."""
    pass


def _sha256(file_path: Path) -> str:
    """Calculate the SHA-256 hash of a file on disk."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(CHUNK_SIZE), b""):
            hasher.update(chunk)
    return hasher.hexdigest().lower()


class Installer:
    def __init__(self):
        self.state: InstallerState = InstallerState.INSTALLED if self.is_installed() else InstallerState.NOT_INSTALLED
        self.error: str | None = None
        self.done_bytes = 0
        self.total_bytes = 0
        self.bytes_per_sec: float | None = None
        self._cancel = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

    # ---- Queries ----

    def files(self):
        """List of all required model and voice FileSpecs from the manifest."""
        return MODEL_FILES + [spec for spec, _, _ in VOICES.values()]

    def path(self, rel: str) -> Path:
        """Resolve a relative filename to its absolute path in the model directory."""
        return settings.tts_models_dir / rel

    def is_installed(self) -> bool:
        """Checks if installed.json exists and all manifest files are on disk."""
        try:
            marker_file = settings.tts_models_dir / MARKER
            marker_data = json.loads(marker_file.read_text(encoding="utf-8"))
            return marker_data.get("revision") == REVISION and all(
                self.path(f.path).exists() for f in self.files()
            )
        except (FileNotFoundError, ValueError, KeyError):
            return False

    def installed_bytes(self) -> int:
        """Total size in bytes of all completed files currently in the directory."""
        if not settings.tts_models_dir.exists():
            return 0
        return sum(p.stat().st_size for p in settings.tts_models_dir.rglob("*") if p.is_file())

    # ---- Actions ----

    def start(self, on_installed=None) -> None:
        """Start downloading the files on a background thread."""
        with self._lock:
            if self.state in (InstallerState.DOWNLOADING, InstallerState.VERIFYING):
                raise TTSInstallConflict("Download is already running")

            if self.is_installed():
                self.state = InstallerState.INSTALLED
                return

            needed_bytes = sum(f.size for f in self.files())
            settings.tts_models_dir.mkdir(parents=True, exist_ok=True)

            # Ensure disk has at least 20% buffer over required size
            free_space = shutil.disk_usage(settings.tts_models_dir).free
            if free_space < needed_bytes * 1.2:
                needed_mb = (needed_bytes * 1.2) / 1e6
                raise InsufficientDiskSpace(f"Need about {needed_mb:.0f} MB free disk space")

            self._cancel.clear()
            self.state = InstallerState.DOWNLOADING
            self.error = None
            self.total_bytes = needed_bytes
            self.done_bytes = 0

            self._thread = threading.Thread(
                target=self._run,
                args=(on_installed,),
                name="tts-installer",
                daemon=True,
            )
            self._thread.start()

    def cancel(self) -> None:
        """Signal the running download to stop. Leaves .part files intact to resume later."""
        self._cancel.set()

    def uninstall(self) -> None:
        """Delete all downloaded models, voices, and temp files."""
        with self._lock:
            if self.state in (InstallerState.DOWNLOADING, InstallerState.VERIFYING):
                raise TTSInstallConflict("Cancel the download before uninstalling")

            shutil.rmtree(settings.tts_models_dir, ignore_errors=True)
            self.state = InstallerState.NOT_INSTALLED
            self.error = None
            self.done_bytes = 0

    # ---- Worker logic ----

    def _run(self, on_installed):
        try:
            with httpx.Client(follow_redirects=True, timeout=httpx.Timeout(30.0, read=60.0)) as client:
                for file_spec in self.files():
                    self._download_file(client, file_spec)

            # Verify phase
            self.state = InstallerState.VERIFYING
            for file_spec in self.files():
                file_path = self.path(file_spec.path)
                if file_spec.sha256 and _sha256(file_path) != file_spec.sha256.lower():
                    file_path.unlink(missing_ok=True)
                    raise RuntimeError(f"Checksum mismatch for {file_spec.path}. Try downloading again.")

            # Write the commit marker
            marker_file = settings.tts_models_dir / MARKER
            marker_data = {
                "revision": REVISION,
                "modelVersion": MODEL_VERSION,
                "voices": list(VOICES.keys()),
                "installedAt": time.time(),
            }
            marker_file.write_text(json.dumps(marker_data, indent=2), encoding="utf-8")

            self.state = InstallerState.INSTALLED
            if on_installed:
                on_installed()

        except _Cancelled:
            self.state = InstallerState.CANCELLED
        except Exception as e:
            self.state = InstallerState.FAILED
            self.error = str(e)

    def _download_file(self, client: httpx.Client, file_spec):
        final_path = self.path(file_spec.path)

        # Skip if already fully downloaded
        if final_path.exists() and final_path.stat().st_size == file_spec.size:
            self.done_bytes += file_spec.size
            return

        final_path.parent.mkdir(parents=True, exist_ok=True)
        part_path = final_path.with_name(final_path.name + ".part")

        # Resume support: see how many bytes we already have
        bytes_have = part_path.stat().st_size if part_path.exists() else 0
        headers = {"Range": f"bytes={bytes_have}-"} if bytes_have > 0 else {}

        url = BASE_URL + file_spec.path
        with client.stream("GET", url, headers=headers) as response:
            # If server ignored Range request, restart from 0
            if bytes_have > 0 and response.status_code != 206:
                bytes_have = 0

            response.raise_for_status()
            self.done_bytes += bytes_have

            start_time = time.monotonic()
            bytes_received_this_run = 0

            write_mode = "ab" if bytes_have > 0 else "wb"
            with open(part_path, write_mode) as f_out:
                for block in response.iter_bytes(CHUNK_SIZE):
                    if self._cancel.is_set():
                        raise _Cancelled()

                    f_out.write(block)
                    bytes_received_this_run += len(block)
                    self.done_bytes += len(block)

                    elapsed = max(time.monotonic() - start_time, 1e-3)
                    self.bytes_per_sec = bytes_received_this_run / elapsed

        if part_path.stat().st_size != file_spec.size:
            raise RuntimeError(f"Incomplete download for {file_spec.path}")

        # Rename .part to finished file
        part_path.replace(final_path)


installer = Installer()


# ---- CLI Runner for Step 4 Testing ----

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "status"

    if action == "install":
        print("Starting Kokoro TTS download...")
        installer.start()

        try:
            while installer.state in (InstallerState.DOWNLOADING, InstallerState.VERIFYING):
                time.sleep(0.5)
                mb_done = installer.done_bytes / (1024 * 1024)
                mb_total = installer.total_bytes / (1024 * 1024)
                speed_mb = (installer.bytes_per_sec or 0) / (1024 * 1024)
                pct = (installer.done_bytes / max(installer.total_bytes, 1)) * 100
                print(
                    f"\r[{installer.state.upper()}] {mb_done:.1f}/{mb_total:.1f} MB ({pct:.1f}%) "
                    f"Speed: {speed_mb:.2f} MB/s",
                    end="",
                    flush=True,
                )
            print()
            if installer.state == "installed":
                print("Installation completed and verified successfully!")
            else:
                print(f"Finished with status '{installer.state}': {installer.error}")
        except KeyboardInterrupt:
            print("\nCancelling download (saving partial progress)...")
            installer.cancel()
            time.sleep(1)
            print("Cancelled. Run again to resume.")

    elif action == "uninstall":
        print("Removing TTS model files...")
        installer.uninstall()
        print("Uninstalled successfully.")

    elif action == "status":
        print(f"State: {installer.state}")
        print(f"Installed: {installer.is_installed()}")
        print(f"Local storage used: {installer.installed_bytes() / (1024 * 1024):.2f} MB")