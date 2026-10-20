
# spotDLr

Your own music library and player, with a Spotify-style interface. Search Spotify, download what you want with [spotDL](https://github.com/spotDL/spotify-downloader), and play it in the browser.

## ✨ Features

What's new in each version: [CHANGELOG.md](CHANGELOG.md).


- 🔎 **Search** songs, artists, albums and playlists from the top bar: **YouTube Music** (no account or keys needed), or Spotify when it's connected
- 🔗 **Paste any Spotify or YouTube Music link** (song, album, playlist). Spotify links work without Spotify API access: the song list is read from Spotify's public player and each song is found on YouTube Music
- ✅ **Knows what you already have**: every result shows a green check (play it) or a download button, matched by exact Spotify or YouTube ID, then title + artist
- 💿 **Album, playlist and artist pages**, with "Download N missing" for partly downloaded albums
- 📊 **Stats page** (chart icon, top right): library charts (songs added per month, genres, top artists, release decades) and listening stats (listening time, top songs and artists, a weekday × hour heatmap) for today, this week/month/year, last month, all time and more, each compared with the period before. Every chart has a table view. Listening history stays on your computer (`plays.jsonl`); a song counts after 30 s of real listening
- 🏷️ **Browse by genre** on Home, a page per genre, and genre chips on All songs. Genres are looked up once on Deezer's public API (no account) in the background and cached in `.genres.json`; your files aren't modified
- 📚 **Your Library**: playlists and albums (one per folder), artists, and All songs, built from the tags and cover art in your files
- 🎧 **Player** with play/pause, next/previous, shuffle, repeat (all/one), seek, volume, and keyboard shortcuts
- 🍎 **Mac media keys and Control Center** support (Media Session API)
- 📥 **Download queue** with live progress, cancel, and the real reason when something fails
- 🎚️ Formats: M4A (AAC), MP3, Opus, FLAC, WAV; quality "Auto" (keeps source quality) or 128–320 kbps
- 📝 Synced lyrics (`.lrc` files) for new downloads or songs already in your library
- 🖥️ Native Mac app using Swift + Apple WebKit; opens from Applications or the Dock
- 📱 **Phone access**: scan a QR code (Settings → Phone access) to use spotDLr in your phone's browser, on your Wi-Fi, or anywhere with [Tailscale](https://tailscale.com) (HTTPS, Add to Home Screen). Only phones that scanned the code get in
- 🧹 **Tidy up** (Stats → Tidy up): merge duplicate songs (playlists and likes follow the copy you keep; the rest go to the Trash) and fix albums that are really a playlist's name, looked up on YouTube Music, with undo
- 📃 **Queue** (Play next / Add to queue), **sleep timer**, **even out volume**, **crossfade**, and **scheduled plays** (like an alarm)
- ✍️ Your own playlists: create, add/remove, **drag to reorder**, rename
- 🔀 **Sort and filter**: Your Library by recents/added/name/creator; All songs by search, genre and any column; list or grid view
- 🎨 **Now Playing** with visualizers, synced lyrics, full screen; on phones, swipe the cover for next/previous

## 🚀 Quick Start

### Windows: the installer (easiest)

Download **spotDLr-Setup.exe** from the [Releases page](https://github.com/HoldenGrant/spotDLr-web_ui/releases), double-click it (if Windows says *"Windows protected your PC"*: **More info → Run anyway**), and open **spotDLr** from the Start menu. Nothing else to install: Python, FFmpeg and Node.js are built in, and no Spotify account is needed. Music goes to **Music\spotDLr**; settings and the log to `%LOCALAPPDATA%\spotDLr`. Closing the window closes spotDLr.

**Publishing a new installer:** push a version tag. GitHub Actions builds it on Windows, installs and tests it, and attaches it to a Release:
```bash
git tag v2.0.0 && git push origin v2.0.0
```

### Windows: from source (developers)

1. Install **Python 3.13** and **Node.js** once: `winget install Python.Python.3.13` and `winget install OpenJS.NodeJS` (Node is needed for YouTube downloads).
2. Double-click **`make_launcher.bat`** once. It creates a **spotDLr** shortcut in the Start menu and on the Desktop.
3. From then on, open **spotDLr** from the Start menu: it sets itself up on first launch (a few minutes), starts the server hidden, and opens in its own window (Chrome or Edge app mode). Log: `%LOCALAPPDATA%\spotDLr\spotDLr.log`.

Re-run `make_launcher.bat` if you move the folder. `run.bat` still works too (visible console window, opens a browser tab).

### Windows (console)

1. **Simply double-click `run.bat`** or run in Command Prompt:
   ```bat
   run.bat
   ```

The script will automatically:
- ✅ Check and install Python 3.11 if needed
- ✅ Install all required dependencies
- ✅ Download and setup FFmpeg via SpotDL
- ✅ Load Spotify credentials from `.env` file
- ✅ Prompt for credentials if `.env` doesn't exist
- ✅ Start the web server

**First-time installation:** If Python is installed for the first time, you'll be prompted to restart your computer. Simply run `run.bat` again after restart.

### Mac: personal standalone installer

The self-contained Apple Silicon build is in `dist-mac/spotDLr-2.2.0-mac-arm64.dmg`.
Open it and drag **spotDLr** into **Applications**. It includes Python, FFmpeg,
ffprobe and Node.js; no source folder or Homebrew is needed to run it. This personal,
ad hoc signed build requires macOS 15+. It uses `~/Music/spotDLr/` and
`~/Library/Application Support/spotDLr/`, keeping your source library separate.
⌘Q stops its backend. See [Mac installer details](installer/MAC.md) and
[moving existing music](SETUP.md#mac-personal-standalone-installer).

### Mac: open it like an app (from source)

Run this once in Terminal from the project folder:
```bash
./make_launcher.sh
```
It builds **spotDLr.app** in Applications: a native Mac window using Apple's WebKit, with its own Dock icon, menus, file picker and fullscreen support. No browser or App Store account is needed to run it. Building requires **macOS 12.3+ and Xcode Command Line Tools** (`xcode-select --install`).

Open spotDLr from Launchpad, Spotlight or the Dock. It reuses the local music server or starts it in the background. Closing the window keeps the native app running; reopening its Dock icon restores the window. **⌘Q** quits the native app, while the server stays running for downloads and phone access. Scheduled playback requires the app to remain running on the device that owns the schedule.

This local build uses the project's Python environment and music files: keep the project **out of Downloads, Documents and Desktop**, which macOS can restrict apps from reading; e.g. `~/Projects/spotDLr-web_ui`. Re-run `make_launcher.sh` if you move the folder. Log: `~/Library/Logs/spotDLr.log`. Interface preferences, playback sessions, and schedule device identity are stored separately from Chrome; they are not migrated automatically. The Mac app does not bundle Python, FFmpeg, Node.js, or the project for use on another computer. See [SETUP.md](SETUP.md).

### Mac/Linux

**Mac:** double-click **`run.command`** in Finder. (First time only: if macOS blocks it, right-click → Open.)

**Or in Terminal** (from any folder):
   ```bash
   ./run.sh
   ```

The script will automatically:
- ✅ Find a compatible Python (spotDL needs **3.10–3.13**; install one with `brew install python@3.13` if needed)
- ✅ Create a private virtual environment in `.venv/` and install dependencies there (your system Python is left alone)
- ✅ Setup FFmpeg for SpotDL (uses Homebrew's `ffmpeg` if you have it)
- ✅ Load Spotify credentials from `.env` file
- ✅ Prompt for credentials if `.env` doesn't exist
- ✅ Start the web server and open it in your browser

### Access the App

After running the launcher script, open your browser to:
```
http://localhost:8000
```

## 🔑 Spotify API Setup

1. Visit [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
2. Click "Create App"
3. Fill in app name and description
4. Copy your **Client ID** and **Client Secret**

### Option 1: In the app (easiest)
Start the app, click **Connect Spotify** (or the settings icon → **Spotify connection**), paste the Client ID and Secret, and click **Save & test**. They're checked with Spotify and saved to `.env`.

When creating the Spotify app: tick **Web API**, and use `http://127.0.0.1:8000/callback` as the Redirect URI (required by the form, never used).

### Option 2: Use .env file
Create a `.env` file in the project folder:
```env
SPOTIPY_CLIENT_ID=your_client_id_here
SPOTIPY_CLIENT_SECRET=your_client_secret_here
```

The launcher scripts will automatically read this file.

### Option 3: Enter in the launcher
If no `.env` file exists, the launcher will prompt you to enter credentials. They will be saved to `.env` for future use.

## 🎧 Where the music comes from

Audio always comes from **YouTube Music** (about 130 kbps AAC; M4A is saved without re-encoding).

| You use | How it's resolved | Needs |
|---|---|---|
| Search (Spotify not connected) | YouTube Music search | nothing |
| YouTube Music link | that song / album / playlist | nothing |
| Spotify link (Spotify not connected) | song list from Spotify's public embed → each song matched on YouTube Music (title, artist, length within 10 s) | nothing; **playlists stop at the first 100 songs** |
| Search / links with Spotify connected | Spotify Web API + spotDL | a Spotify app whose **owner has Premium** (Spotify rule since Feb 2026) |

Downloading from YouTube needs **Node.js or Deno** installed (yt-dlp uses it to unlock audio links): `brew install node`.

## 📦 Prerequisites

- **Python 3.10–3.13** for source builds (bundled in the Windows installer)
- **FFmpeg** (automatically installed by the launcher scripts)
- **Internet connection** (for downloading from Spotify/YouTube)

All Python dependencies are automatically installed from `requirements.txt`:
- fastapi==0.103.0
- uvicorn==0.23.2
- python-multipart==0.0.6
- spotdl==4.4.3
- spotipy==2.24.0
- python-dotenv==1.0.0

## 💡 Usage

- **Search:** type in the top bar (or press `/` or `⌘K`). Results show **Top result**, **Songs**, matching songs **In your library**, then **Artists**, **Albums** and **Playlists**. The chips filter by type.
- **Download:** hover a song and click ⬇, or open an album/playlist and click **Download**. Downloads run one at a time; the ⬇ button in the top bar shows how many are active.
- **Paste a link:** paste any Spotify track, album, playlist or artist link into the search box or the Downloads page.
- **Play:** double-click a song, or use the green play button on any playlist, album or artist. Songs already in your library show a green ✓ everywhere.
- **Settings** (sliders icon, top right): format, quality, and lyrics.
- **Lyrics for existing music:** choose **Download lyrics** from a song's ⋯ menu, or open **Settings → Downloads → Download library lyrics** for the whole library. Available synced lyrics are saved as `.lrc` files beside the audio; existing `.lrc` files are kept. The library pass runs in the background while spotDLr stays running, with progress and results in Settings.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `/` or `⌘K` | Focus search |
| `Esc` | Leave the search box |
| Media keys | Play / pause, next, previous (Mac) |

### Quality

Songs come from YouTube Music at about 128–160 kbps. **Auto** keeps that source as-is. Choosing 320 kbps re-encodes it into a bigger file, but it can't add detail that isn't in the source.

## 📁 Project Structure

```
spotDLr-web_ui/
├── app.py              # FastAPI routes
├── library.py          # Reads tags + cover art from downloads/ (the library)
├── spotify_api.py      # Spotify search / album / playlist / artist (client credentials)
├── downloader.py       # Download queue: one job at a time (spotDL or YouTube Music)
├── ytmusic.py          # YouTube Music search/pages, Spotify→YouTube matching, yt-dlp download + tags
├── spotify_embed.py    # Reads Spotify links from the public embed player (no keys)
├── genres.py           # Genre lookup on Deezer, cached in .genres.json
├── organize.py         # Likes, your playlists, adding files, albums, sending to a device
├── cleanup.py          # Tidy up: duplicate songs and album info
├── loudness.py         # Song loudness (FFmpeg EBU R128) for "Even out volume"
├── schedules.py        # Scheduled plays
├── phone.py            # Phone access: the Wi-Fi server and QR-code pairing
├── tailscale.py        # Phone access anywhere, through Tailscale (and Funnel)
├── stats.py, lyrics.py, abx.py, apple_music.py, version.py
├── index.html          # Page shell
├── launcher/macOS.swift # Native Mac window, WebKit delegates, server startup
├── make_launcher.sh    # Builds and locally signs spotDLr.app for this Mac
├── static/
│   ├── app.js          # UI: router, views, player, downloads (no build step)
│   ├── app.css         # Styles
│   ├── sw.js, manifest.webmanifest, icons/   # Add to Home Screen on phones
│   └── vendor/qrcode.min.js                   # QR codes for Phone access (MIT)
├── run.sh / run.command  # Mac/Linux launcher (run.command = double-click on Mac)
├── run.bat / run.ps1   # Windows launchers
├── requirements.txt
├── .env                # Spotify credentials (create this; never commit it)
└── downloads/          # Your music (each subfolder = a playlist or album)
```

## 🔧 Advanced Setup (Manual)

If you prefer manual setup instead of using the launcher scripts:

1. **Install Python 3.10–3.13**
   - Windows: Download from [python.org](https://python.org)
   - Mac: `brew install python@3.13` (spotDL 4.4.3 doesn't support Python 3.14+)
   - Linux: `sudo apt install python3 python3-pip`

2. **Install FFmpeg**
   ```bash
   # Using SpotDL (recommended)
   spotdl --download-ffmpeg
   
   # Or install manually:
   # Windows: Download from ffmpeg.org
   # Mac: brew install ffmpeg
   # Linux: sudo apt install ffmpeg
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Create .env file** with your Spotify credentials

5. **Start the server**
   ```bash
   python app.py
   ```

6. **Open browser** to `http://localhost:8000`

## 🐛 Troubleshooting

### Spotify search doesn't work
- Since February 2026 Spotify only allows API access if the account that owns your Spotify app has **Premium**. Without it the app quietly uses **YouTube Music** for search and downloads, and pasted Spotify links still work (up to 100 songs per playlist).
- To use Spotify again: get Premium on that account, then check **Settings → Spotify connection**.

### "Connection refused" error
- Make sure the server is running: `python app.py`
- Check that port 8000 is not already in use
- Try accessing `http://127.0.0.1:8000` instead

### Audio player not working
- Check browser console for errors
- Ensure files are in `downloads/` directory
- Try a different browser (Chrome/Edge recommended)

### Python not found after installation (Windows)
- Restart your computer after Python installation
- Run `run.bat` again

### Download speed is slow
- Depends on internet connection and source availability
- SpotDL searches multiple sources for best quality

### Files don't have album art
- The app uses `--force-update-metadata` and `--ytm-data` flags
- Some tracks may not have artwork available from sources
- Artwork is automatically embedded when available

### Permission errors
- **Windows:** Try running `run.bat` as administrator
- **Mac/Linux:** Ensure script is executable: `chmod +x run.sh`

## 🌐 API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/status/init` | Are the Spotify credentials accepted? |
| GET / POST | `/api/credentials` | Connection status / test and save new keys |
| GET | `/api/library` | All tracks (from tags, each with a `genre`) and collections (folders) |
| GET | `/api/genres/status` | Background genre lookup progress |
| GET | `/api/stats?range=` | Library + listening stats (`today`, `week`, `month`, `last-month`, `year`, `all`, `7d`…; the old `?days=` still works) |
| POST | `/api/plays` | The player reports a listen (`track_id`, `seconds`) |
| GET | `/api/img?u=` | Cached proxy for remote cover images |
| GET | `/api/stream/{track_id}` | Audio, with HTTP Range support for seeking |
| GET | `/api/art/{track_id}` | Embedded cover art |
| GET / POST | `/api/lyrics/{track_id}` | Read lyrics / save a synced sidecar beside an existing song |
| POST | `/api/lyrics/save-library` | Start or reuse the background library lyrics-save pass |
| GET | `/api/lyrics/save-status` | Lyrics-save progress and saved/existing/unavailable/failed counts |
| GET | `/api/search?q=[&source=ytm\|spotify]` | Search (YouTube Music unless Spotify is connected) |
| GET | `/api/ytm/{album\|playlist\|artist}/{id}` | YouTube Music item details |
| GET | `/api/spotify/{album\|playlist\|artist}/{id}` | Spotify item details (albums/playlists fall back to the public embed) |
| POST | `/api/download` | Queue a download |
| GET | `/api/jobs` | Download queue and history |
| DELETE | `/api/jobs/{id}` | Cancel a download |

That's the core. Playlists, likes, Tidy up, loudness, schedules and phone access have more; the full list is in the Obsidian vault: `spotdl/architecture/API Reference.md`.

## ⚙️ Configuration

- `SPOTIFY_MARKET` in `.env` (default `US`): the country Spotify results are for.
- Directory selection: `paths.py`; source builds (including the native Mac app) default to `<project>/downloads/` for music and the project folder for settings. `SPOTDLR_MUSIC_DIR` / `SPOTDLR_DATA_DIR` override these when set before Python starts. The Windows installer has separate defaults; see [SETUP.md](SETUP.md#where-your-files-live).
- spotDL flags: `Downloader._command()` in `downloader.py`.

**Local use only.** There's no login. The server only answers requests addressed to `localhost`/`127.0.0.1` (add others with `SPOTDLR_HOSTS=` in `.env`) and blocks cross-site writes, so other websites can't change your keys or start downloads.

## 📝 Notes

- Requires active internet connection for Spotify/YouTube access
- **Copyright:** Only download content you have rights to use
- **Fair Use:** Don't overload servers with excessive requests
- **Quality:** Actual quality depends on source availability
- **FFmpeg:** Required for audio conversion and metadata embedding


## 🙏 Credits & Thanks

Special thanks to the creators and maintainers of these open source projects:

- [SpotDL](https://github.com/spotDL/spotify-downloader) — Spotify music downloader
- [FastAPI](https://github.com/tiangolo/fastapi) — Modern Python web framework
- [Uvicorn](https://www.uvicorn.org/) — Lightning-fast ASGI server
- [Spotipy](https://github.com/plamere/spotipy) — Spotify Web API wrapper
- [FFmpeg](https://ffmpeg.org/) — Multimedia framework for audio processing
- [Python](https://www.python.org/) — The language powering everything

This project would not be possible without their work and the open source community.

## 📄 License

MIT License - See individual projects for their licenses.

## ⚠️ Disclaimer

This tool is for educational purposes. Users are responsible for complying with copyright laws and Spotify's Terms of Service. Only download content you have the rights to use.

---

**Enjoy your music! 🎵**

For issues or questions, please check the Troubleshooting section or open an issue on the project repository.
