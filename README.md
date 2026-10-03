# Subvocal

Turn your notes into audio you can study by listening.

Upload a PDF, Word or PowerPoint file. Subvocal finds the key topics, has an AI write a spoken study script from them, and reads it back to you, so you can review while you walk, commute or rest your eyes. You can listen with your system's built-in voice, or download an optional, much more natural voice that runs entirely on your own computer.

> **Status:** early development. There is a Windows desktop app you can [install](#install-the-desktop-app-windows) with everything included, and you can also run it from source in the browser.

## Contents

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Install the desktop app (Windows)](#install-the-desktop-app-windows)
- [Getting started (from source)](#getting-started-from-source)
- [Set up an AI model (you need an API key)](#set-up-an-ai-model-you-need-an-api-key)
- [The natural voice (optional)](#the-natural-voice-optional)
- [Desktop app (Tauri)](#desktop-app-tauri)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Useful commands](#useful-commands)
- [Troubleshooting](#troubleshooting)
- [Privacy and your API keys](#privacy-and-your-api-keys)
- [Contributing](#contributing)
- [Credits](#credits)

## What it does

- **Reads your documents.** PDF, Word (`.docx`) and PowerPoint (`.pptx`) files up to 50 MB.
- **Finds the key topics.** The AI extracts the concepts worth remembering. You can edit, add, remove and set how many times each is repeated.
- **Writes a spoken script.** A "Primer" style script with analogies, split into sections you can jump between.
- **Plays it back.** A floating player with play/pause, previous/next section, replay and speed control. Keyboard shortcuts (Space, ← →, R, < >) work in the app window.
- **Optional natural voice.** Download it once from Settings. Audio is prepared in the background while you listen.
- **Saves your library.** Everything is saved automatically, and a header icon shows what audio is still being prepared.
- **Works with your own AI account.** Use OpenAI, Google Gemini, Anthropic, or any OpenAI-compatible endpoint.
- **Light, dark or system theme.**

## How it works

```
 your file ──► extract text ──► find topics ──► write script ──► listen
 (PDF/DOCX/PPTX)   (backend)       (AI model)     (AI model)     (system voice
                                                                   or natural voice)
```

1. The backend turns the document into text.
2. An AI model picks out the study topics.
3. An AI model writes the script, one section per topic.
4. The app plays the sections. With the natural voice on, the backend renders each section to an audio file in the background, and the player uses the files as they become ready.

## Tech stack

| Part | Built with |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Zustand |
| Desktop shell | [Tauri 2](https://tauri.app) (Rust); the backend is packaged with PyInstaller |
| Backend | Python 3.11, FastAPI, SQLAlchemy (SQLite) |
| Document parsing | [firecrawl-anydoc](https://github.com/firecrawl/anydoc) |
| AI models | OpenAI, Google Gemini, Anthropic, or a custom OpenAI-compatible endpoint |
| Natural voice | [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) running locally on CPU (PyTorch) |

## Install the desktop app (Windows)

If you just want to use Subvocal, you don't need Python, Node or any code.

1. Download `Subvocal_<version>_x64-setup.exe` from the [Releases page](https://github.com/ilano-K/Subvocal/releases).
2. Run it. Windows will probably warn you because the installer isn't signed: click **More info**, then **Run anyway** (see [why](#desktop-app-tauri)).
3. Open Subvocal. It starts its own backend, so there is nothing else to run.
4. Go to **Settings → AI models** and add your own API key ([where to get one](#set-up-an-ai-model-you-need-an-api-key)).

Your library and settings are kept in `%APPDATA%\Subvocal`. Uninstalling the app doesn't delete them.

## Getting started (from source)

For developers. You will need:

- **Python 3.11**
- **Node.js 22** (what it is developed on) and npm
- **An API key** from an AI provider (see [the next section](#set-up-an-ai-model-you-need-an-api-key))

### 1. Get the code

```bash
git clone https://github.com/ilano-K/Subvocal.git
cd Subvocal
```

### 2. Start the backend

```bash
cd backend
python -m venv venv
```

Activate the environment:

```bash
# Windows (PowerShell)
venv\Scripts\Activate.ps1

# macOS / Linux
source venv/bin/activate
```

Install and run:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API is now at <http://localhost:8000>, and its interactive docs are at <http://localhost:8000/docs>.

> The first install is a large download, because the natural voice uses PyTorch. It installs even if you never switch the natural voice on.

### 3. Start the frontend

In a second terminal, from the project folder:

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

### 4. Add an AI model

Open **Settings → AI models** in the app and add a provider with your API key. The next section shows where to get one. Then upload a file and press **Start listening**.

## Set up an AI model (you need an API key)

Subvocal doesn't include an AI model. You use your own account, and your key stays on your computer. Pick whichever provider suits you; you only need one.

| Provider | Where to get a key | Notes |
| --- | --- | --- |
| **Google Gemini** | [Google AI Studio → Get API key](https://aistudio.google.com/apikey) | Sign in with a Google account. A good first choice for students: Google's [pricing page](https://ai.google.dev/gemini-api/docs/pricing) lists a free tier with limited access to some models. Limits and pricing change, so check it before you rely on it. |
| **OpenAI** | [OpenAI Platform → API keys](https://platform.openai.com/api-keys) | Needs an OpenAI Platform account. Usage beyond free test requests is paid, so you will probably need to add credit to the account. |
| **Anthropic (Claude)** | [Claude Console → API keys](https://platform.claude.com/settings/keys) | Needs a Claude Console account. A ChatGPT or Claude chat subscription is separate and does not include API access. |
| **Custom** | Your own server | Anything that speaks the OpenAI chat API, for example a local server such as Ollama or LM Studio, or a proxy service. You give it a base URL. The form always asks for a key, so if your server doesn't need one, type any placeholder text. |

> An API key is different from a chat subscription. If you pay for a ChatGPT, Claude or Gemini subscription, you still need a separate API key from the pages above.

### Adding it in the app

1. Open **Settings** (the gear icon in the top bar) and choose the **AI models** tab.
2. Click **Add provider** and pick the provider type.
3. Paste your API key.
4. Add at least one model name, for example one you copied from the provider's model list. The text box suggests a few, but you can type any name your account can use.
5. Click **Test** to check that the key and model work.
6. Under **Model in use**, choose that model.

Tips:

- Models differ in price and speed. Smaller and "flash"/"mini" models are cheaper and faster. Larger ones may write better scripts. Try one and see.
- If the **Test** button says the key was rejected, check that you copied the whole key, with no spaces.
- Keep your key private. Never post it online or commit it to Git.

### Using a `.env` file instead (optional)

If you prefer, you can set a default model in `backend/.env`. It is used when you haven't chosen one in Settings:

```bash
cp backend/.env.example backend/.env    # then edit the file
```

## The natural voice (optional)

By default the app reads with your system's built-in voice. For a more natural voice:

1. Open **Settings → General → Narrator**.
2. Click **Download natural voice**. It is about 330 MB and downloads once.
3. Switch it on. After about 10 to 30 seconds it says it is ready.

Good to know:

- It runs on your CPU and needs about **1.4 GB of memory** while it is on.
- Rendering is roughly twice as fast as the audio plays, so the app prepares sections ahead of you. The header icon shows progress.
- If a section isn't ready yet, the player waits for it, or you can choose **Use system voice** for that session.
- Remove it any time from Settings to free the space.

## Desktop app (Tauri)

Subvocal can run as a desktop window instead of a browser tab. The window loads the same React app.

**Extra tools you need** (once):

- [Rust](https://www.rust-lang.org/tools/install) (stable)
- **Windows:** the "Desktop development with C++" part of the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), and WebView2 (already on Windows 11)
- **macOS / Linux:** see Tauri's [prerequisites](https://v2.tauri.app/start/prerequisites/)

**Run it in development** (start the backend first, as in [Getting started](#getting-started-from-source)):

```bash
npm run tauri dev
```

This starts the frontend and opens the desktop window. The first run compiles the Rust side and takes a few minutes.

**The pop-out player.** While something is playing, **Pop out** (in the player bar) moves the player into its own small window that stays on top of other apps, so you can minimize Subvocal and keep listening. The pop-out window shows what is playing and has play/pause, previous/next, replay and speed (the keyboard shortcuts only work in the app window). Drag it by any part that isn't a button. **Dock** puts the player back inside the app, and **Open app** brings the main window to the front. It follows the app's light or dark theme. In the browser there is no pop-out; the player stays inside the page.

**The tray.** If you close the main window while audio is playing or the player is popped out, Subvocal hides to a tray icon (near the clock) and keeps playing. Click the icon, or right-click it and choose **Open Subvocal**, to bring the window back; **Quit** closes the app and its backend. If nothing is playing, closing the window quits the app.

**Build an installer:**

```bash
npm run tauri build
```

When it finishes you get:

- the app: `src-tauri/target/release/subvocal.exe`
- an installer (NSIS): `src-tauri/target/release/bundle/nsis/Subvocal_0.1.0_x64-setup.exe`
- an installer (MSI): `src-tauri/target/release/bundle/msi/Subvocal_0.1.0_x64_en-US.msi`

The first build compiles Tauri from source and takes around 7 minutes or more; later builds are much faster. Building only the app, without installers, is `npm run tauri build -- --no-bundle`.

**The installer is not code-signed, so expect warnings.** Signing needs a paid certificate, and this project doesn't have one. When someone installs or runs the app for the first time, Windows will probably show a blue **"Windows protected your PC"** (SmartScreen) screen saying the publisher is unknown, and some browsers or antivirus tools may warn about the download too. This is normal for unsigned apps and doesn't mean something is wrong. To continue, click **More info**, then **Run anyway**. Only do this with an installer you built yourself or got from someone you trust. macOS and Linux builds would show similar "unidentified developer" warnings. The app also has no auto-update, so to get a new version you install the new installer over the old one.

**The backend is bundled.** The installer includes the Python backend; the app starts it when it opens and stops it when it closes, so nobody needs Python. The installer is large (about 200 MB) because it contains the narrator's engine; the voice itself is still downloaded from Settings. If something already answers on port 8000 (for example a backend you started yourself), the app uses that one instead. Development builds (`npm run tauri dev`) never start the bundled backend.

**Releasing a new version:** `npm run version:set -- 0.2.0` updates the version in every place it appears (frontend, desktop app, backend). Then run `npm run backend:build` and `npm run tauri build`, and attach the installer to a GitHub Release tagged `v0.2.0` (create the tag with `git tag v0.2.0` and `git push origin v0.2.0`).

To rebuild the bundled backend before `npm run tauri build`, in an environment with `backend/requirements.txt` and `pyinstaller` installed:

```bash
npm run backend:build
```

## Configuration

Backend settings come from environment variables or `backend/.env`. All are optional.

| Variable | Default | What it does |
| --- | --- | --- |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | empty | A default AI model, used when none is chosen in Settings. |
| `SUBVOCAL_DATA_DIR` | per-user folder (see below) | Where the library, settings, voice and audio are kept. |
| `SUBVOCAL_PORT` | `8000` | Port of the packaged backend (the app expects 8000, so change it only for testing). |
| `CORS_ALLOWED_ORIGINS` | the dev server and the desktop app's addresses | Web addresses allowed to call the API. |
| `TTS_AUTOLOAD` | `true` | Load the natural voice when the backend starts. Set `false` while developing to skip the load on every reload. |
| `TTS_THREADS` | all CPU cores but one | CPU threads the natural voice may use. |
| `TTS_CACHE_MAX_MB` | `2048` | Maximum size of the saved audio before the oldest is deleted. |
| `DEBUG` | `true` | Debug mode. |

Frontend:

| Variable | Default | What it does |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:8000/api/v1` | Where the app finds the backend. |

All of the backend's saved data (library database, saved providers, downloaded voice, rendered audio) is kept in one per-user folder, the same for the desktop app and for running from source: `%APPDATA%\Subvocal` on Windows, `~/Library/Application Support/Subvocal` on macOS, `~/.local/share/Subvocal` on Linux. Set `SUBVOCAL_DATA_DIR` to use another folder. If you used an earlier version, the old `backend/.data/` folder is copied there once (and left untouched).

## Project structure

```
Subvocal/
├── src/                     React app
│   ├── components/          screens and dialogs (workspace, library, player, settings)
│   ├── hooks/               playback engine, status polling, theme, shortcuts
│   ├── stores/              app state (Zustand): session, library, player, voice, models, theme
│   ├── services/            api.ts (every call to the backend), playerBridge.ts (pop-out window)
│   └── utils/
├── backend/
│   ├── app/
│   │   ├── routers/         API endpoints (documents, concepts, scripts, library, tts, llm)
│   │   ├── services/        the logic behind them; services/tts/ is the natural voice
│   │   ├── schemas/         request and response shapes
│   │   ├── prompts/         the AI instructions for topics and scripts
│   │   ├── database/        SQLite models
│   │   └── core/            errors, logging, and moving old data to the new folder
│   ├── run.py               starts the backend (used by the packaged app)
│   ├── subvocal-backend.spec  PyInstaller recipe for the packaged backend
│   ├── requirements.txt
│   └── .env.example
├── src-tauri/               desktop app (Tauri / Rust): windows, tray, starts the backend, icons
├── scripts/                 bump-version.mjs (sets the version everywhere)
└── README.md
```

## Useful commands

| Command | Where | What it does |
| --- | --- | --- |
| `npm run dev` | project folder | Start the frontend with hot reload |
| `npm run build` | project folder | Type-check and build the frontend into `dist/` |
| `npm run lint` | project folder | Check the frontend code |
| `npm run tauri dev` | project folder | Open the app as a desktop window (starts its own backend only in a release build) |
| `npm run tauri build` | project folder | Build the desktop app and installer |
| `npm run backend:build` | project folder | Package the backend for the installer (needs `pyinstaller`) |
| `npm run version:set -- 0.2.0` | project folder | Set the version everywhere |
| `uvicorn app.main:app --reload` | `backend/` | Start the backend with auto reload |

## Troubleshooting

**Where are the logs?** The backend writes `logs/backend.log` (up to 3 files of 1 MB) in the Subvocal data folder, for example `%APPDATA%\Subvocal\logs\` on Windows. In the desktop app, anything printed outside the normal log (such as a crash while starting) goes to `backend-console.log` next to it. They contain no API keys. Attach them when you report a problem.

**The app says it can't reach the local service.**
The backend isn't running, or it is on a different address. From source, start it (step 2) and check <http://localhost:8000/docs> opens. If it runs elsewhere, set `VITE_API_URL`. In the installed app, close it fully (right-click its tray icon, **Quit**) and open it again; if it still can't connect, check the logs below, and make sure no other program is using port 8000.

**"No AI model is set up yet."**
Add a provider and a model in **Settings → AI models**, then pick it under **Model in use**.

**The Test button says the key was rejected.**
Copy the key again, with no extra spaces. Make sure it is a key for the provider you picked, and that the account is active (some need credit added).

**Script writing fails or times out.**
Long documents take a while. Try again, or try a different model. The error message names the provider that failed.

**The natural voice won't download or start.**
It needs an internet connection and about 1.4 GB of free memory. Check Settings → Narrator for the reason. If it says it can't start, use **Retry**, or remove it and download again.

**The backend restarts a lot while I edit code.**
`--reload` restarts it on every save. Set `TTS_AUTOLOAD=false` in `backend/.env` to stop it reloading the voice each time.

**Port already in use.**
Another program is using 8000 or 5173. Close it, or start the backend with `--port 8001` and set `VITE_API_URL` to match (and add the frontend address to `CORS_ALLOWED_ORIGINS` if you change that too).

## Privacy and your API keys

- Your documents are processed by the backend on your computer. The text is sent to the AI provider you choose, to find topics and write the script, and only to that provider.
- The natural voice runs locally. The only thing it downloads is the voice model itself, once.
- API keys are saved as plain text in `llm_providers.json` in that data folder on your computer. They are never sent back to the app, which only shows the last four characters. Don't share that folder or copy it to a shared location.

## Contributing

Issues and pull requests are welcome. Please:

1. Open an issue first for anything big, so we can agree on the approach.
2. Keep each pull request focused on one change.
3. Run `npm run build` and `npm run lint` before you open it.
4. Never include API keys, `.env` files or the Subvocal data folder.

## Credits

- Voice model: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad (Apache-2.0).
- Pronunciation: [espeak-ng](https://github.com/espeak-ng/espeak-ng) (GPL-3.0), bundled in the installer through `espeakng-loader`. Its source is available at that link.
- Document conversion: [anydoc](https://github.com/firecrawl/anydoc) by Firecrawl (MIT).

## License

[MIT](LICENSE). You can use, change and share Subvocal, including commercially, as long as you keep the copyright notice.
