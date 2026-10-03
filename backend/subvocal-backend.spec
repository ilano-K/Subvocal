# PyInstaller recipe for the desktop app's backend. Build with:  pyinstaller subvocal-backend.spec
from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules

datas, binaries, hidden = [], [], []
# Packages that load data files, models or plugins by name at run time.
for pkg in ["kokoro", "misaki", "espeakng_loader", "en_core_web_sm", "spacy", "thinc", "soundfile", "firecrawl_anydoc", "language_tags", "phonemizer", "tiktoken"]:
    try:
        d, b, h = collect_all(pkg)
    except Exception:
        continue
    datas += d; binaries += b; hidden += h
hidden += collect_submodules("uvicorn") + collect_submodules("app") + ["aiosqlite", "greenlet", "multipart", "sqlalchemy.dialects.sqlite"]

a = Analysis(["run.py"], pathex=["."], binaries=binaries, datas=datas, hiddenimports=hidden, excludes=["tkinter", "matplotlib", "IPython", "pytest"])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="subvocal-backend", console=True, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, name="subvocal-backend", upx=False)
