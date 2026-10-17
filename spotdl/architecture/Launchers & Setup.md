# Launchers & Setup

Three scripts, one job each: make sure Python, the dependencies, FFmpeg and the Spotify credentials are ready, then run `app.py`. Related: [[Backend]] · [[Bug Log]]

---

## Credentials

You need a Spotify **Client ID** and **Client Secret** from <https://developer.spotify.com/dashboard/> → Create app (Web API; redirect URI `http://127.0.0.1:8000/callback`, required but unused).

**Easiest:** start the app and paste them into **Settings → Spotify connection**. It tests them and writes `.env` for you. Or edit `.env` by hand:

`.env` in the repo root:

```env
SPOTIPY_CLIENT_ID=…
SPOTIPY_CLIENT_SECRET=…
```

They get loaded twice, and both paths matter:
1. `app.py` loads them (`load_dotenv`) for search and the status check.
2. The downloader passes them to spotDL as `--client-id/--client-secret`. spotDL ignores env vars, and without these it falls back to its rate-limited shared keys.

> [!note] Never committed
> `.env` and `.cache` (spotipy's token cache) are in `.gitignore`. They were tracked until Oct 15. See [[Bug Log#Spotify secret: rotate once working]].

## spotDLr.app (the launcher)

**The everyday way to open spotDLr on the Mac:** `/Applications/spotDLr.app` (Launchpad, Spotlight, or drag it to the Dock). Built by `./make_launcher.sh`; re-run that if the project folder moves.

What it does on double-click:
1. If on Apple Silicon and running under Rosetta, restart itself natively (`arch -arm64`). See [[Bug Log#Launcher: server crashed with "incompatible architecture" (Oct 15)]].
2. Asks `GET /api/status/init` and looks for spotDLr's own `search_source` field, so another app on port 8000 isn't mistaken for spotDLr.
3. Not running → `SPOTDLR_NO_BROWSER=1 nohup run.sh` in the background (log: `~/Library/Logs/spotDLr.log`, rotated at 5 MB), waits until it answers (notification after 4 s, gives up after 5 min).
4. Opens `http://localhost:8000` with Chrome's app mode (`--app=`, no tabs or address bar). It tries Chrome, Edge, Brave, then Chromium, then falls back to a normal tab. It runs the browser binary directly, because `open -a … --args` drops the arguments when the browser is already open.

Measured: cold start **3 s** to a working window, warm start **1.07 s** (same server, no second copy). The server keeps running after the window closes. Failures show a macOS alert saying what to do (port taken by another app, project folder moved, server stopped while starting).

Built into the bundle at build time: the project path, and this Terminal's `PATH` (Finder-launched apps get a bare PATH that hides Python 3.13, ffmpeg and Node). Icon: `launcher/icon.svg`, rendered with headless Chrome → `sips` → `iconutil`.

> [!warning] Don't keep the project in Downloads, Documents or Desktop
> macOS privacy protection blocks a new app from reading those folders (`Operation not permitted`), and an unsigned script app doesn't even get the "allow?" prompt. That's why the project moved to `~/Projects/` on Oct 15.

## macOS / Linux: `run.command` → `run.sh`

**Mac:** double-click `run.command` in Finder. It opens Terminal and runs `run.sh`. (First time: if Gatekeeper blocks it, right-click → Open.) Or run `./run.sh` from any folder.

1. `cd`s to its own folder, so it works from Finder or `~`.
2. Picks the first of `python3.13`, `python3.12`, `python3.11`, `python3.10`, `python3` whose version is **3.10–3.13**. spotDL 4.4.3 refuses 3.14+, which is what `brew install python3` gives today. If there's none: `brew install python@3.13`.
3. Creates `.venv/` and installs `requirements.txt` there. It reinstalls only when `requirements.txt` is newer than `.venv/.installed`. Your system Python is never touched.
4. FFmpeg: OK if `ffmpeg` is on PATH (e.g. Homebrew) or `~/.spotdl/ffmpeg` exists. Otherwise it runs `.venv/bin/python -m spotdl --download-ffmpeg`.
5. Loads `.env` if present. Spotify keys are **optional** now (YouTube Music works without them): without `.env` it offers to save keys only when someone is at the Terminal, and otherwise carries on.
6. Stops with a clear message if port 8000 is already in use.
7. Starts `.venv/bin/python app.py`, and opens the browser (`open`, or `xdg-open` on Linux) once `/api/status/init` answers, unless `SPOTDLR_NO_BROWSER` is set (the launcher sets it).

To start completely fresh: `rm -rf .venv`.

## Windows: the installer (spotDLr-Setup.exe)

**For non-technical users.** One download, nothing else to install.

| Piece | File |
|---|---|
| Entry point (`spotDLr.exe`) | `desktop.py`: probes ports 8000–8010 for a running spotDLr (its `search_source` field); else starts the server **in-process on a thread** on the first free port, opens Edge/Chrome `--app` at `http://127.0.0.1:port` with its **own profile**, and stops the server **5 s after the last spotDLr window closes**: pages check in every 15 s (`/api/window/alive`) and say goodbye on close (`/api/window/bye`); a window silent for 180 s counts as gone. (v2.0.0 waited on the Edge process instead, which on some PCs hands the window to another process and exits at once; see [[Bug Log]].) Output goes to `%LOCALAPPDATA%\spotDLr\spotDLr.log` (a windowed exe has no stdout, and uvicorn's logging would crash) |
| Data locations | `paths.py`: frozen → music `Music\spotDLr` (the real Music folder via `SHGetKnownFolderPath`, so OneDrive redirection works), settings/caches `%LOCALAPPDATA%\spotDLr`; from source → the project folder, unchanged |
| Bundle | `installer/spotDLr.spec` (PyInstaller onedir): `index.html`, `static/`, `collect_all` for ytmusicapi / yt_dlp / yt_dlp_ejs, all uvicorn submodules, `installer/bin/ffmpeg.exe` + `node.exe` → `_internal/bin/`; spotDL excluded |
| Installer | `installer/spotDLr.iss` (Inno Setup 6): per-user (`%LOCALAPPDATA%\Programs\spotDLr`, no admin), Start menu + optional desktop icon, "Open spotDLr" at the end; uninstall keeps music and settings |
| Build + test | `.github/workflows/windows-installer.yml` on `windows-latest`: downloads FFmpeg (BtbN) and Node 22.12.0, PyInstaller, Inno Setup, then installs silently and smoke-tests (`/api/status/init`, page, `app.js`, library, bundled tools; search and a real download only *warn* because YouTube may block CI IPs). Every push → artifact; `v*` tag → public Release whose text is `installer/release_notes.py`: that version's `CHANGELOG.md` section, then `installer/RELEASE_NOTES.md` |

### Releasing a new version

1. Set `VERSION = "2.1.0"` in `version.py` (patch for fixes only, minor for features). In `CHANGELOG.md`, rename `## [Unreleased]` to `## [2.1.0] - YYYY-MM-DD`, add a fresh empty `## [Unreleased]` above it, and update the compare links at the bottom.
2. Commit and push; check **Actions → Windows installer** passes on `main`.
3. `git tag v2.1.0 && git push origin v2.1.0`. About 3½ minutes later the Release appears, with "What's new in 2.1.0" above the install steps. If the changelog has no section for the tag, the Release still publishes, with only the install steps, and the build log warns. **If the tag doesn't match `version.py`, the build fails before building anything** ("Tag v2.1.0 but version.py says 2.0.1"): fix `version.py`, commit, delete and re-push the tag (`git tag -d v2.1.0 && git push origin :v2.1.0`, then tag again).

The version shows in **Settings → About** (`/api/status/init` returns `version`, plus `build` = `git describe --tags --dirty` when running from source, which the page turns into "Running from source, 3 changes after 2.0.1, with unsaved edits").

In the installed app **spotDL never runs**: `sys.executable -m spotdl` would launch spotDLr.exe itself, so every download goes through YouTube Music (Spotify links via the embed), even with Spotify keys.

**Checked on the Mac (Oct 15):** `desktop.py` from source (isolated dirs: empty library, second launch detects the first, port taken by another app → next port), and a **PyInstaller build of the same spec run frozen**: page + static served, YouTube Music search, a real download through yt-dlp's bundled JS solver, tags, log in the data dir. The Windows build itself runs first in CI.

## Windows: the spotDLr shortcut (launcher, from source)

Double-click **`make_launcher.bat`** once → `launcher/windows/make_shortcuts.ps1` creates `spotDLr.lnk` in the Start menu and on the Desktop (icon `launcher/icon.ico`). The shortcut runs `powershell -WindowStyle Hidden -File launcher/windows/launch.ps1`:

1. `Test-SpotDLr`: `GET /api/status/init` and look for `search_source` (another app on 8000 doesn't count).
2. Not running → start `launcher/windows/server.ps1` in a hidden PowerShell, log to `%LOCALAPPDATA%\spotDLr\spotDLr.log` (UTF-8, rotated at 5 MB), a tray balloon after 4 s, give up after 10 min, message box on failure.
3. Open `--app=http://localhost:8000` in Chrome, else Edge (always present on Windows), else a normal tab.

`server.ps1` is the Windows `run.sh`: Python 3.10–3.13 via the `py` launcher or `python`, private `.venv`, reinstall only when `requirements.txt` changes, FFmpeg (PATH or `%USERPROFILE%\.spotdl\ffmpeg.exe`), a Node.js warning, then `app.py` with unbuffered output.

Windows gotchas handled (and checked on the Mac with portable PowerShell 7.4.6: parser, no PS7-only syntax, logic tests):
- **PowerShell 5.1** is what Windows ships: `$ErrorActionPreference = "Stop"` turns any stderr text from pip into a fatal error, so `Continue` + exit codes; `>>` writes UTF-16, so `Out-File -Encoding utf8`; native stderr is wrapped in error noise, so each line goes through `"$_"`.
- **Quoting:** the hidden process gets its command as **`-EncodedCommand`** (base64 UTF-16LE), because Windows argv parsing strips inner double quotes; apostrophes in paths are doubled. Tested with a folder named `O'Brien test`.
- Scripts are **pure ASCII** (5.1 reads BOM-less files as Windows-1252) with **CRLF** endings, enforced by `.gitattributes`.

> [!warning] Not yet run on a real Windows PC
> Untested until then: the shortcut COM object, message box, tray balloon, `Get-NetTCPConnection`, the `py` launcher, Edge app mode, and the `.venv\Scripts` paths.

## Windows: `run.bat` (console)

- If Python is missing, it downloads the **Python 3.11.7** installer from python.org, installs it quietly per user with PATH, and then **asks to reboot**. You run it again after the restart.
- Then it hands over to `launcher/windows/server.ps1` in its visible window (same setup as the shortcut) and opens a browser tab once the server answers. Since Oct 15 it no longer requires Spotify keys or installs into the global Python.

## Windows: `run.ps1` (minimal)

A shorter alternative to `run.bat`: `pip install -r requirements.txt`, reads `.env` (prompts and saves it if missing), runs `app.py`. It doesn't install Python or FFmpeg. Until Oct 15 it had the keys typed in; now it reads `.env`.

## Manual

```bash
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m spotdl --download-ffmpeg   # skip if `brew install ffmpeg`
.venv/bin/python app.py                        # works from any folder
```

Then open <http://localhost:8000>.
