# Backend

Four Python modules, ~890 lines. Related: [[How It Works]] · [[API Reference]] · [[Bug Log]]

| File | Lines | Job |
|---|---|---|
| `app.py` | 197 | FastAPI routes, Range streaming |
| `library.py` | 244 | Reads tags and cover art from `downloads/`, builds collections |
| `spotify_api.py` | 235 | Spotify Web API (client credentials), trims responses |
| `downloader.py` | ~300 | Download queue: one worker thread; spotDL jobs, or YouTube jobs song by song |
| `ytmusic.py` | ~430 | YouTube Music search/pages (same shape as `spotify_api`), Spotify→YouTube matching, yt-dlp download, tagging |
| `paths.py` | ~60 | Where code, music and settings live: the project folder from source, `Music\spotDLr` + `%LOCALAPPDATA%\spotDLr` in the installed app |
| `desktop.py` | ~150 | Entry point of the Windows installer's `spotDLr.exe`: single instance, in-process server, app window, stop on close |
| `stats.py` | ~160 | Listening history (`plays.jsonl`, one JSON line per listen with title/artist/genre copied in) and the library + listening stats for `/api/stats` |
| `apple_music.py` | ~190 | Add to Apple Music (Mac): FLAC/WAV/AIFF → ALAC + MD5-of-samples check, AAC/MP3 as they are, Opus/Ogg → AAC 256; staged in `~/Music/spotDLr for Apple Music/<collection>/`; AppleScript via `osascript` with data passed as argv (never interpolated); skips title+album already in the library; optional matching user playlist |
| `abx.py` | ~200 | Blind listening test: A = original clip, B = encoded (AAC in MP4 / MP3 / Opus) and decoded back, both trimmed to identical 16-bit WAVs; per-trial X tokens; answers kept server-side; binomial p-value |
| `organize.py` | ~330 | Likes (`likes.json`), playlists you make (a folder holding only `playlist.m3u8`), adding files (raw-body upload streamed to disk), real-album tagging (album/album artist/year/cover for MP3, M4A, FLAC, Ogg, Opus), the device list (USB drives on Mac/Windows/Linux), and Send to device (copy or convert to MP3 with ID3v2.3 tags) |
| `lyrics.py` | ~200 | Lyrics: the song's own `.lrc`, else LRCLIB (free, no key), cached one file per song in `.lyrics/`; LRC parser; writes `.lrc` after downloads when "Include lyrics" is on |
| `genres.py` | ~230 | Genres from Deezer's public API, filled in by a background thread, cached in `.genres.json` |
| `spotify_embed.py` | ~110 | Reads Spotify tracks/albums/playlists from the public embed player, no keys (≤100 songs) |

> [!important] Rule: blocking work never runs on the event loop
> Routes that touch Spotify or the disk are plain `def` (FastAPI runs them in a threadpool), and spotDL runs in the downloader's own thread. An `async def` that blocks freezes every request: the old app's status polls took 1.5–3 s that way.

---

## Dependencies (`requirements.txt`)

| Package | Version | Used for |
|---|---|---|
| `fastapi` | 0.103.0 | Routes, `StaticFiles` |
| `uvicorn` | 0.23.2 | Server |
| `spotdl` | 4.4.3 | The `python -m spotdl` CLI the downloader runs. Needs Python **3.10–3.13** |
| `spotipy` | 2.24.0 | Spotify Web API |
| `mutagen` | (via spotDL) | Reading tags and cover art |
| `python-dotenv` | 1.0.0 | `.env` |
| `python-multipart` | 0.0.6 | Unused |

External: **FFmpeg** (Homebrew's or `~/.spotdl/ffmpeg`).

## `library.py`

**`Library.scan()`** walks `downloads/` and returns one dict per audio file, newest first:

```python
{ "id": "3f2a…",            # sha1(relative path)[:16], stable while the file stays put
  "path": "JVKE Radio/d4vd - Sleep Well.m4a", "folder": "JVKE Radio",
  "title": "Sleep Well", "artists": ["d4vd"], "album": "Sleep Well", "album_artist": "d4vd",
  "year": "2023", "duration": 172.3, "added": <mtime>, "size": …,
  "spotify_id": "7MGUDGEQpcqf29gWAmJyy4", "has_cover": true }
```

- Tags are cached per file by `(mtime, size)`, so a rescan only reads changed files (1.3 s first scan, 15 ms after).
- Missing tags fall back to the filename (`"{artists} - {title}"`).
- `spotify_id` comes from spotDL's `WOAS` tag: `----:spotdl:WOAS` in M4A, a `WOAS` frame in MP3, a Vorbis comment in FLAC/Opus.
- IDs are per *path*, so the same filename in two playlists can't collide (the old `/api/download/{filename}` bug).

**`_collections()`**: one collection per top-level folder. If every track shares one album tag, it's an **album**, named from the tag. That's why `httpsopenspotifycomalbum0mZ8…` shows as "Maybe I'm Dreaming". Otherwise it's a **playlist**, named after the folder. Up to 4 covers from distinct albums make the 2×2 mosaic. If the folder has a **`playlist.m3u8`** (written by the downloader), its entries set the order and can point at files in other folders (`../Other Playlist/song.m4a`), so songs skipped as "already in library" still belong to the playlist. Files not in the m3u8 are appended; a folder with only an m3u8 is still a collection.

**`cover(id)`**: embedded art as bytes, with an LRU cache of 400 (~40 MB max).

## `spotify_api.py`

- One spotipy client with `MemoryCacheHandler` (no more `.cache` token file in the repo), **`retries=0, status_retries=0`**, and a 10 s timeout.
- `check()`: actually requests a token; cached 5 min. Turns `invalid_client` into a readable message.
- `test_credentials(id, secret)`: token **plus one search** with a throwaway client (catches rate-limited keys). `reset()` drops the live client after new keys are saved.
- `_call()`: maps errors. 429 → "rate limit, try again in N s"; 404 → "Spotify doesn't let apps read this" (Spotify-owned editorial playlists are blocked for API apps).
- `search / album / playlist / artist`: trimmed responses. Each track gets `local_id` if owned (the UI recomputes this itself at render time).
- `artist()`: top tracks and albums are each optional, so one retired endpoint doesn't break the page.
- `SPOTIFY_MARKET` env var (default `US`).

## `downloader.py`

- `submit()` → job dict → `queue.Queue`. The 50 most recent finished jobs are kept in memory (lost on restart).
- `_worker()` runs jobs **one at a time**. One failing job can't kill the worker.
- `_output_dir()`: album/playlist → `downloads/<safe title>/`; track/artist → `downloads/`.
- `_command()`: `sys.executable -m spotdl download <url> --output … --format … --force-update-metadata --ytm-data --threads 4 --client-id … --client-secret …` (spotDL reads no env vars; without these it uses its rate-limited shared keys), plus `--bitrate Nk` unless the setting is "auto" or the format is lossless, plus `--generate-lrc` if wanted.
- `_run()`: snapshot → run → diff. See [[How It Works#3. Download an album]] for the outcome table.
- Watchdog thread: kills spotDL after **5 min of silence** (`STALL_SECONDS`) or `900 + 90 × tracks` seconds total.
- `cancel()`: queued → removed; running → `terminate()`.

## `app.py`

Routes only; see [[API Reference]]. Pieces worth knowing:

- **`local_only` middleware**: Host allow-list plus a cross-site write block (the API can write your secret to disk).
- **`set_credentials()` / `_write_env()`**: test first, then save to `.env` atomically with `0600`, keeping other lines.

- **`_ranged_file()`**: implements `Range: bytes=…` → `206` / `416`, because Starlette 0.27's `FileResponse` doesn't. Checked byte-exact against the file on disk.
- **`download()`** refuses early when the credentials don't work, normalizes pasted URLs (drops `?si=`), and asks Spotify for the title/cover/count when the UI didn't send them.

## Changing things

| Want to… | Edit |
|---|---|
| Allow other devices on your network | `app.py` last line: `host="0.0.0.0"`, **and** add the hostname/IP to `SPOTDLR_HOSTS` in `.env` (no login, so only on a network you trust) |
| Change the download folder | `DOWNLOAD_DIR` in `app.py` |
| Change spotDL flags | `Downloader._command()` |
| Change the stall/overall timeouts | constants at the top of `downloader.py` |
| Spotify results for another country | `SPOTIFY_MARKET=PH` in `.env` |
