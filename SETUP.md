# spotDLr: Setup Guide

Pick the section for your computer. No Spotify account or keys are needed: search and downloads use YouTube Music, and pasted Spotify links still work.

- [Windows: the installer (easiest)](#windows-the-installer-easiest)
- [Mac: personal standalone installer](#mac-personal-standalone-installer)
- [Mac: install and open like an app](#mac-install-and-open-like-an-app)
- [Windows: from source (developers)](#windows-from-source-developers)
- [Optional: connect Spotify](#optional-connect-spotify)
- [Where your files live](#where-your-files-live)
- [Troubleshooting](#troubleshooting)

---

## Windows: the installer (easiest)

For anyone, no technical setup. Python, FFmpeg and Node.js are built in.

1. Download **spotDLr-Setup.exe** from the [Releases page](https://github.com/HoldenGrant/spotDLr-web_ui/releases).
2. Double-click it. If Windows says **"Windows protected your PC"** (the installer isn't signed), click **More info → Run anyway**. You only see this once.
3. Click through the installer (no admin password needed) and leave **Open spotDLr** ticked.

From then on, open **spotDLr** from the Start menu or the desktop icon. It opens in its own window, and closing the window closes spotDLr.

**Uninstall:** Settings → Apps → spotDLr → Uninstall. Your music stays in **Music → spotDLr**.

---

## Mac: personal standalone installer

Download **spotDLr-2.5.0-mac-arm64.dmg** from the [v2.5.0 release](https://github.com/HoldenGrant/spotDLr-web_ui/releases/tag/v2.5.0) or the [spotDLr website](https://holdengrant.github.io/spotDLr-web_ui/). The local build produces `dist-mac/spotDLr-2.5.0-mac-arm64.dmg`. Open the disk image,
drag **spotDLr** onto **Applications**, then open the installed app. This personal
build targets **Apple Silicon and macOS 15+** (the bundled FFmpeg requires macOS 15).
It is locally ad hoc signed, without Developer ID signing or notarization.
If macOS blocks the downloaded app, see [Apple’s guide to opening apps safely](https://support.apple.com/en-us/102445).

Python, dependencies, FFmpeg, ffprobe and Node.js are included. Running the app
does not require Homebrew, a source checkout or `.venv`. The bundle contains no
personal `.env`, music, likes or listening history. The existing source launcher
and its library are left in place; this standalone build starts with its own data.

- Music: `~/Music/spotDLr/`
- Settings, likes and caches: `~/Library/Application Support/spotDLr/`
- Log: `~/Library/Logs/spotDLr.log`

To bring over an existing source library, quit both versions, copy the **contents**
of `<project>/downloads/` into `~/Music/spotDLr/`, preserving folder names and
playlist files, then reopen the standalone app. Copy `likes.json` to its Application
Support folder to retain likes (track IDs depend on the same relative file paths).
Spotify credentials can be entered again in Settings. Do not delete the originals
until you have checked the copied library.

The app normally uses port 8001 and remembers its port to retain interface
preferences. If the port is occupied it chooses another free local port, rather
than connecting to an unrelated or source server. **Close Window** keeps the app
running; **⌘Q** stops this app's backend, including phone access and schedules.
Replacing the app later preserves music and settings outside the bundle.

Build and verification instructions: [installer/MAC.md](installer/MAC.md).

## Mac: install and open like an app

This alternative builds the smaller **source-dependent launcher** described below.

### 1. Put the project somewhere macOS lets apps read

Clone or move it into your home folder, for example `~/Projects/spotDLr-web_ui`. **Not** Downloads, Documents or Desktop: macOS blocks new apps from reading those folders ("Operation not permitted").

```bash
mkdir -p ~/Projects && cd ~/Projects
git clone https://github.com/HoldenGrant/spotDLr-web_ui.git
cd spotDLr-web_ui
```

### 2. Install the tools it needs (once)

The native app requires **macOS 12.3 or newer**. To compile it locally, install Xcode Command Line Tools (or use an existing Xcode installation):

```bash
xcode-select --install
```

Install the music server's runtime tools:

```bash
brew install python@3.13 ffmpeg node
```

- **Python 3.10–3.13.** The source launcher rejects other versions for the pinned spotDL 4.4.3 dependency.
- **FFmpeg** converts and tags audio.
- **Node.js** is needed for YouTube downloads; without it they fail with "HTTP Error 403".

### 3. Create the app (once)

```bash
./make_launcher.sh
```

This compiles `launcher/macOS.swift`, locally signs the bundle, and puts **spotDLr.app** in Applications (or `~/Applications` if the destination is not writable). A custom destination is supported: `./make_launcher.sh /path/to/folder`.

Open it from Launchpad, Spotlight (⌘ Space, "spotDLr") or the Dock (drag it there to keep it). Its window uses Apple's built-in WebKit, with native menus, file selection and fullscreen support. No Chrome, Electron, App Store account, or paid signing identity is needed to run this local build. The first launch prepares `.venv` through `run.sh` if necessary; existing environments are reused.

The app connects to an existing spotDLr server on `127.0.0.1:8000`, or starts one itself. **Close window** keeps the native app running; the Dock icon brings the window back. **⌘Q** quits the native app but leaves the Python server running for downloads and phone access. Scheduled playback needs the designated app/browser to remain running.

This build is for this Mac: Python, FFmpeg, Node.js, project code and music remain outside the `.app`. Interface preferences, playback sessions and schedule device identity use separate WebKit storage; Chrome state is not migrated automatically. Existing audio files, likes and playlists remain on the server.

Re-run `./make_launcher.sh` if you move the project folder.

**Without the app:** double-click `run.command` (opens Terminal and a browser tab at `http://localhost:8000`), or run `./run.sh`.

---

## Windows: from source (developers)

1. Install the tools once (Command Prompt or PowerShell):
   ```powershell
   winget install Python.Python.3.13
   winget install OpenJS.NodeJS
   ```
2. Clone the repo anywhere you like.
3. Double-click **`make_launcher.bat`**. It creates a **spotDLr** shortcut in the Start menu and on the Desktop.
4. Open spotDLr from the Start menu. The first launch installs dependencies into a private `.venv` and takes a few minutes; a tray message says so.

**With a console window instead:** double-click `run.bat` (it can also install Python for you if it's missing).

---

## Optional: connect Spotify

Only needed if you want search results from Spotify instead of YouTube Music. **Since February 2026, Spotify only allows this if the account that owns the Spotify app has Premium.**

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard/) → **Create app**.
2. Any name and description. **Redirect URI:** `http://127.0.0.1:8000/callback` (required by the form, never used). Tick **Web API**. Save.
3. Open the app → **Settings** → copy the **Client ID**, then **View client secret** and copy that.
4. In spotDLr: **Settings** (sliders icon, top right) → **Spotify connection** → paste both → **Save & test**.

spotDLr tests the keys with Spotify before saving them. If Spotify answers *"Active premium subscription required"*, the keys are saved anyway and start working by themselves a few hours after the account gets Premium.

---

## Where your files live

| | From source | Standalone Mac app | Windows installer |
|---|---|---|---|
| Music | `downloads/` in the project folder | `~/Music/spotDLr/` | **Music → spotDLr** |
| Settings (`.env`), caches, genres | the project folder | `~/Library/Application Support/spotDLr/` | `%LOCALAPPDATA%\spotDLr` |
| Log | `~/Library/Logs/spotDLr.log` (Mac app) | `~/Library/Logs/spotDLr.log` | `%LOCALAPPDATA%\spotDLr\spotDLr.log` |

Each folder inside the music folder shows up as a playlist or album in spotDLr. Your Spotify keys stay on your computer; `.env` is never committed to git.

---

## Troubleshooting

**"spotDLr couldn't start: port 8000 is being used by another app"** (Mac)
Quit the other app, or find it with `lsof -nP -iTCP:8000 -sTCP:LISTEN`. (The Windows installer picks another port by itself.)

**"The project folder isn't there anymore"** (Mac app or Windows shortcut)
The folder was moved. Run `./make_launcher.sh` (Mac) or `make_launcher.bat` (Windows) again from its new location.

**Mac: "Operation not permitted" in the log**
The project is in Downloads, Documents or Desktop. Move it to e.g. `~/Projects/` and run `./make_launcher.sh` again.

**Downloads fail with "HTTP Error 403: Forbidden"**
- Every download fails: Node.js is missing. Install it (`brew install node` / `winget install OpenJS.NodeJS`) and restart spotDLr. (Built into the Windows installer.)
- Only a song or two fails: YouTube occasionally refuses a link. spotDLr retries automatically; if it still fails, click **Retry** in Downloads.

**A Spotify playlist only downloads 100 songs**
Without a working Spotify connection, spotDLr reads Spotify links from Spotify's public player, which lists at most 100 songs.

**Covers or genres missing**
They come from YouTube/Deezer and fill in over a minute or two; refresh the page. A few uploads that aren't real releases never get a genre.

**Lyrics download says "Method Not Allowed"**
The interface is newer than the running Python server. Wait for active downloads to finish, quit the native app with ⌘Q, stop the old spotDLr server process, then reopen the Mac app and refresh browser clients. Closing the native window or pressing ⌘Q alone does not stop the server. Use `lsof -nP -iTCP:8000 -sTCP:LISTEN` to identify it; stop only the confirmed spotDLr process.

**Download lyrics for songs already in the library**
Choose **⋯ → Download lyrics** on one song, or **Settings → Downloads → Download library lyrics** for all songs. The pass preserves existing `.lrc` files and skips plain-only lyrics or instrumentals. Progress and errors appear in Settings. It continues after closing the interface while the server remains running; stopping the server interrupts it. Rerun the pass to process remaining songs.

**The Mac app won't build**
Check `xcrun --find swift` and install/select Xcode Command Line Tools if needed. The app targets macOS 12.3+ and the architecture of the Mac that builds it. Logs from server startup go to `~/Library/Logs/spotDLr.log`.

**Anything else**
Check the log (see [Where your files live](#where-your-files-live)) and open an issue on GitHub with the last lines.

---

Only download music you have the right to use. spotDLr isn't affiliated with Spotify, YouTube or Deezer.
