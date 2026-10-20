# Launchers & Setup

Source launchers prepare Python, dependencies, and FFmpeg, then run the server. Spotify credentials are optional. The Windows installer bundles its runtime and uses `desktop.py`. Mac app section updated **2026-10-20**; other platform sections retain their earlier review/test dates. Related: [[Backend]] · [[Data and Storage]] · [[Phone Access]] · [[Bug Log]]

---

## Credentials

To connect Spotify, optionally provide a **Client ID** and **Client Secret** from <https://developer.spotify.com/dashboard/> → Create app (Web API; redirect URI `http://127.0.0.1:8000/callback`, required but unused).

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

## spotDLr.app (native Mac app)

**Current implementation, Oct 20, 2026:** `/Applications/spotDLr.app`, built by `./make_launcher.sh`. It is a Swift/Cocoa executable hosting the existing UI in Apple's `WKWebView`, with its own Dock icon and standard Mac menus. Chrome/Edge app mode was the previous Mac implementation; `desktop.py` still handles the Windows desktop executable.

### Build and install

- Requires macOS **12.3+**, Xcode Command Line Tools or Xcode, and the source runtime tools: Python **3.10–3.13**, FFmpeg, and Node.js for YouTube downloads.
- `make_launcher.sh` compiles `launcher/macOS.swift` using `xcrun swiftc`, targeting the build Mac's architecture and macOS 12.3. It assembles the bundle, ad-hoc signs it with `codesign --sign -`, verifies the signature, then installs it. A custom destination can be passed as the first argument; the default is `/Applications`, with `~/Applications` used if that existing destination is not writable.
- No App Store account, paid signing identity, or notarization is used for this local build. It is not a self-contained distribution: Python, FFmpeg, Node.js, source code and music remain outside the bundle.
- The bundle records `SpotDLrProjectPath` and `SpotDLrExecutablePath` in `Info.plist`. Rebuild if the project moves or those tool paths change.
- The icon is reused from an existing app when available. Otherwise the builder renders `launcher/icon.svg` with headless Chrome or Quick Look, then uses `sips` and `iconutil`. Chrome is not a runtime dependency of the native app.

### Startup and window behavior

1. Opens a native window with a loading indicator. Probes `http://127.0.0.1:8000/api/ping` asynchronously and requires `{"app":"spotDLr"}`.
2. If no server responds, starts `/bin/bash <project>/run.sh` with the saved executable PATH and `SPOTDLR_NO_BROWSER=1`. The shell launcher prepares/reuses `.venv` and executes `app.py`. Output appends to `~/Library/Logs/spotDLr.log`.
3. Retries startup checks until the server responds, with a five-minute deadline. A responding foreign service, missing project, startup-process failure, or page-load failure produces a native alert.
4. Loads the UI at `http://127.0.0.1:8000/`. Navigation stays on that origin; external HTTP(S) links open in the default browser. `WKUIDelegate` provides the import file picker; user-gesture restrictions for media are disabled in the WebKit configuration and element fullscreen is enabled.
5. Closing the window keeps the native app/web view alive. Clicking its Dock icon reopens the same window. **⌘Q** quits the native app; it deliberately leaves the Python server running for downloads and phone access. Scheduled playback is client-driven and requires its designated app/browser to remain running.

The native app uses WebKit's persistent website storage, separate from Chrome's `browser-profile/` or normal browser profile. Preferences, saved playback sessions and schedule device IDs are not migrated automatically. Server-side music, playlists, likes, listening records and saved schedules stay in their existing locations. See [[Data and Storage]].

**Verified Oct 20 on this Mac:** arm64 build and signature, installed app opening the existing server, cold launch starting the server through `run.sh`, library access, local-track playback/pause, synced lyrics, entry/exit from fullscreen, and opening/cancelling the native import file picker. The cold-launch check saw 883 library tracks; that is a dated observation, not a fixed library size. File-picker verification did not import a new file. Earlier Chromium timings and RAM measurements do not benchmark the native app.

Keep the project in a normal location such as `~/Projects/spotDLr-web_ui`; macOS may restrict app access to Downloads, Documents and Desktop. The project moved out of Downloads during the earlier launcher work.

## macOS / Linux: `run.command` → `run.sh`

**Mac:** double-click `run.command` in Finder. It opens Terminal and runs `run.sh`. (First time: if Gatekeeper blocks it, right-click → Open.) Or run `./run.sh` from any folder.

1. `cd`s to its own folder, so it works from Finder or `~`.
2. Picks the first of `python3.13`, `python3.12`, `python3.11`, `python3.10`, `python3` whose version is **3.10–3.13**. the launcher rejects versions outside that range for spotDL 4.4.3. If there's none: `brew install python@3.13`.
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
| Entry point (`spotDLr.exe`) | `desktop.py`: probes ports 8000–8010 by default for a running spotDLr (`/api/ping`); `SPOTDLR_PORT` changes the base port; else starts the server **in-process on a thread** on the first free port, opens Edge/Chrome `--app` at `http://127.0.0.1:port` with its **own profile**, and stops the server **5 s after the last spotDLr window closes**: pages check in every 15 s (`/api/window/alive`) and say goodbye on close (`/api/window/bye`); a window silent for 180 s counts as gone. (v2.0.0 waited on the Edge process instead, which on some PCs hands the window to another process and exits at once; see [[Bug Log]].) Output goes to `%LOCALAPPDATA%\spotDLr\spotDLr.log` (a windowed exe has no stdout, and uvicorn's logging would crash) |
| Data locations | `paths.py`: frozen → music `Music\spotDLr` (the real Music folder via `SHGetKnownFolderPath`, so OneDrive redirection works), settings/caches `%LOCALAPPDATA%\spotDLr`; from source → the project folder, unchanged |
| Bundle | `installer/spotDLr.spec` (PyInstaller onedir): `index.html`, `static/`, `collect_all` for ytmusicapi / yt_dlp / yt_dlp_ejs, all uvicorn submodules, `installer/bin/ffmpeg.exe` + `node.exe` → `_internal/bin/`; spotDL excluded |
| Installer | `installer/spotDLr.iss` (Inno Setup 6): per-user (`%LOCALAPPDATA%\Programs\spotDLr`, no admin), Start menu + optional desktop icon, "Open spotDLr" at the end; uninstall keeps music and settings |
| Build + test | `.github/workflows/windows-installer.yml` on `windows-latest`: downloads FFmpeg (BtbN) and Node 22.12.0, PyInstaller, Inno Setup, then installs silently and smoke-tests (`/api/status/init`, page, `app.js`, library, bundled tools; search and a real download only *warn* because YouTube may block CI IPs). Every push → artifact; `v*` tag → public Release whose text is `installer/release_notes.py`: that version's `CHANGELOG.md` section, then `installer/RELEASE_NOTES.md` |

### Releasing a new version

1. Set `VERSION = "2.1.0"` in `version.py` (patch for fixes only, minor for features). In `CHANGELOG.md`, rename `## [Unreleased]` to `## [2.1.0] - YYYY-MM-DD`, add a fresh empty `## [Unreleased]` above it, and update the compare links at the bottom.
2. Commit and push; check **Actions → Windows installer** passes on `main`.
3. `git tag v2.1.0 && git push origin v2.1.0`, **after** the commit is pushed: `git tag` marks the commit you're on at that moment. (On Oct 17 the tag was made before the commit, so the first v2.1.0 Release shipped the 2.0.1 code. It was fixed by deleting the Release and the remote tag, `git tag -f v2.1.0 <commit>`, and pushing the tag again. The version check now fails such a tag, because the old commit's `version.py` doesn't say 2.1.0.) About 3½ minutes later the Release appears, with "What's new in 2.1.0" above the install steps. If the changelog has no section for the tag, the Release still publishes, with only the install steps, and the build log warns. **If the tag doesn't match `version.py`, the build fails before building anything** ("Tag v2.1.0 but version.py says 2.0.1"): fix `version.py`, commit, delete and re-push the tag (`git tag -d v2.1.0 && git push origin :v2.1.0`, then tag again).

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


## Phone access (Wi-Fi and Tailscale)

Settings → **Phone access** on the computer. See [[Phone Access]] for pairing, pause/sign-out behavior, Tailscale/Funnel, and the home-screen app; [[Backend]] covers the implementation.

- **Home Wi-Fi only:** tick "Open spotDLr on your phone", choose "Home Wi-Fi only", scan with the phone. The link is `http://<Mac name>.local:8000` (stays valid when the router changes the Mac's address). The phone must be on the same Wi-Fi, not a guest network or mobile data.
- **Anywhere:** install Tailscale on the computer and the phone, same account; tick "Also away from home, with Tailscale"; scan the "Anywhere" code; Add to Home Screen. Keep Tailscale connected on the phone, at home too (Tailscale app → VPN On Demand), since this link always goes through it. HTTPS certificates must be on for the tailnet (they are for Holden's).
- **Funnel** ("Also devices without Tailscale"): same address, reachable from the internet; the QR key still gates everything. Off unless turned on.
- **Port:** spotDLr uses Tailscale's 443 unless another app holds 443 on the Mac. **Local (Flywheel, the WordPress tool) runs nginx on `*:443`**, so on this Mac it's **8443**.
- Turning phone access off pauses it; **New QR code** signs every phone out.
- A home-screen web app on iOS keeps its own sign-in, separate from Safari: after a new key, scan in Safari and re-add it to the Home Screen.

## Source review notes (2026-10-19)

For source setup, use Python 3.10–3.13 as checked by `run.sh`, plus FFmpeg and a JavaScript runtime such as Node for YouTube downloads. The root setup guides were aligned with this range on Oct 20. `run.sh` prepares FFmpeg but does not install Node.

Dated timings and platform test reports above are historical records, not tests repeated during this documentation pass. The workflow is configured to run on pushes to `main`, version tags, and manual dispatch; merely reading it does not establish the current CI or release status.
