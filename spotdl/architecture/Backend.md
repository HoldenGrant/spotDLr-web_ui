# Backend

Reviewed against the working tree on **2026-10-19**; native Mac wrapper and existing-music lyrics entries updated **2026-10-20**. Related: [[How It Works]] · [[API Reference]] · [[Data and Storage]] · [[Bug Log]]

| File | Job |
|---|---|
| `app.py` | FastAPI routes, Range streaming |
| `library.py` | Reads tags and cover art from `downloads/`, builds collections |
| `spotify_api.py` | Spotify Web API (client credentials), trims responses |
| `downloader.py` | Download queue: one worker thread; spotDL jobs, or YouTube jobs song by song |
| `ytmusic.py` | YouTube Music search/pages (same shape as `spotify_api`), Spotify→YouTube matching, yt-dlp download, tagging |
| `paths.py` | Code, music and settings: the project folder for source builds including the native Mac app; `Music\spotDLr` + `%LOCALAPPDATA%\spotDLr` in the frozen Windows installer |
| `launcher/macOS.swift` / `make_launcher.sh` | Native Mac WebKit window and local app builder; reuses the server or starts `run.sh`; leaves the server running on quit |
| `desktop.py` | Entry point of the Windows installer's `spotDLr.exe`: single instance, in-process server, app window, stop on close |
| `stats.py` | Listening history (`plays.jsonl`, one JSON line per listen with title/artist/genre copied in) and the library + listening stats for `/api/stats` |
| `apple_music.py` | Add to Apple Music (Mac): FLAC/WAV/AIFF → ALAC + MD5-of-samples check, AAC/MP3 as they are, Opus/Ogg → AAC 256; staged in `~/Music/spotDLr for Apple Music/<collection>/`; AppleScript via `osascript` with data passed as argv (never interpolated); skips title+album already in the library; optional matching user playlist |
| `abx.py` | Blind listening test: A = original clip, B = encoded (AAC in MP4 / MP3 / Opus) and decoded back, both trimmed to identical 16-bit WAVs; per-trial X tokens; answers kept server-side; binomial p-value |
| `organize.py` | Likes (`likes.json`), playlists you make (a folder holding only `playlist.m3u8`), adding files (raw-body upload streamed to disk), real-album tagging (album/album artist/year/cover for MP3, M4A, FLAC, Ogg, Opus), the device list (USB drives on Mac/Windows/Linux), and Send to device (copy or convert to MP3 with ID3v2.3 tags) |
| `lyrics.py` | Lyrics: the song's own `.lrc`, else LRCLIB (free, no key), cached one file per song in `.lyrics/`; LRC parser; writes `.lrc` after new downloads and can save synced sidecars for existing songs; one background library pass at a time with progress counters |
| `genres.py` | Genres from Deezer's public API, filled in by a background thread, cached in `.genres.json` |
| `spotify_embed.py` | Reads Spotify tracks/albums/playlists from the public embed player, no keys (≤100 songs) |
| `cleanup.py` | Duplicate suggestions/merging and album fixes with backups and undo |
| `loudness.py` | FFmpeg loudness measurements and background scanning |
| `schedules.py` | Persistent schedules, validation, and occurrence claims; playback happens in the browser |
| `phone.py` | Wi-Fi listener, pairing, and access lifecycle |
| `tailscale.py` | CLI status, HTTPS Serve/Funnel setup, and port handling |
| `version.py` | Display version and cached Git build description |

> [!important] Concurrency model
> Most disk/network routes use plain `def`, which FastAPI runs in a threadpool. Downloads and several enrichment/export tasks have worker threads. Upload streaming and schedule saves use async routes; the HTTP guard is also async. This describes the design, not a guarantee that every async path is free of blocking work.

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

External: **FFmpeg** (bundled, on PATH, or `~/.spotdl/ffmpeg`) and a **JavaScript runtime** for YouTube extraction. `yt-dlp-ejs==0.8.0` is pinned in `requirements.txt`, but `installer/update_ytdlp.py` replaces it with the major.minor matching yt-dlp's built-in solver when it upgrades yt-dlp. That runs before each build and weekly from `run.sh`/`server.ps1`, because an old yt-dlp gets HTTP 403 from YouTube; `ytmusicapi`, `yt_dlp`, `mutagen`, and `requests` are also imported and supplied through the dependency tree. See [[Search and Downloads]].

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
- `artist()`: returns an empty top-tracks list in the current implementation and attempts an album/single request with a limit of 30; album failures leave that list empty too.
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
- **`download()`** selects YouTube Music, Spotify embed + YouTube Music, or spotDL according to the query, connection state, and frozen/source build. Missing Spotify credentials do not prevent downloads. See [[Search and Downloads]].

## `cleanup.py` (Oct 19)

- **Duplicates:** `song_key` = title and main artist with "Remastered", "[Lyrics]", "(Official Video)", "(feat. …)" stripped and punctuation removed; a group is split where lengths are > 4 s apart (live/extended versions stay separate). `_score`: lossless +10000, bitrate/2, cover +60, real album (not a playlist name) +100, inside an album folder +80, has a YouTube/Spotify id +30, loose root file -20. 432 Hz copies can be pitch-shifted at the same length, so the page flags groups mentioning 432/528 Hz, sped up, slowed, nightcore, 8D, reverb and leaves them out of "merge all".
- **`merge`** order matters: (1) a downloaded playlist folder without an m3u8 gets one first, listing its files as shown, so removing a copy doesn't drop the song from it; (2) every top-level `*/playlist.m3u8` listing a removed copy lists the kept one in the same place (deduplicated); (3) `Likes.merge` (earliest like wins) and `Plays.rename_ids` (rewrites plays.jsonl atomically); (4) files and `.lrc` go to the Trash: `~/.Trash` (Mac), `SHFileOperationW` with `FOF_ALLOWUNDO` (Windows Recycle Bin), `~/.local/share/Trash/files` (Linux), else `DATA/Removed songs`. `SPOTDLR_TRASH_DIR` overrides it for tests.
- **Album info:** suspects = album equals (normalized) a playlist collection's name. `AlbumFixer` runs `ytmusic.match_song` (title 55% + artist 45%, -0.3 if > 10 s off, ≥ 0.7) with 4 workers, then `get_album` once per album for year, album artist and a 1200 px cover. `apply` writes via `organize.tag_album` after saving album/albumartist/date/cover (base64) to `tag-backups/<ms>.json`; keeps a full date when its year already matches. `undo` restores the newest backup and renames it `.undone`.

## `phone.py` (Oct 19)

- **Off by default.** On: a second `uvicorn.Server` (thread, `lifespan="off"`) on the Wi-Fi address (`wifi_address()`: UDP connect trick, no packet sent) at the same port as the local server (+1…+3 if taken). Not `0.0.0.0`, so nothing else changes for the local server. A watcher re-binds every 20 s if the address changes. State in `DATA/phone.json` (`enabled`, `key`, `port`); on at startup if it was on.
- **The guard** (`local_only` in app.py): a request from a non-loopback client must hit the bound Wi-Fi address as Host and carry the cookie `spotdlr_phone` = HMAC(key, "spotdlr phone session"), or `?pair=<key>` (→ 303 to `/` + cookie: HttpOnly, SameSite=Lax, 1 year). Otherwise a "scan the QR code" page (for `/`) or JSON 403. Non-GET to `/api/phone*` and `/api/credentials` is refused from phones. The Origin check still applies. `SPOTDLR_HOSTS` (manual LAN setups) behaves as before.
- **Signing phones out:** `new_key()` changes the key, so old cookies stop matching. `disable()` pauses access and retains the key and options; see [[Phone Access]].
- `GET /api/status/init` has `on_phone`, so the page hides Phone access and makes the Spotify form read-only there.

- **Later on Oct 19:** the Wi-Fi link's host is `local_name()` (`scutil --get LocalHostName` + `.local`, Mac only, cached 60 s; the number stays in `ip_url`) and `allowed_host` accepts it. `disable()` is a pause: Wi-Fi listener stopped and the Tailscale entry (Funnel first) removed, but `key`, `tailscale`, `funnel` kept, so `enable()` → `start()` restores everything and paired phones need no rescan; `new_key()` is the sign-out. `is_remote()` treats this computer's own Tailscale/Wi-Fi addresses as local (safe: through `tailscale serve` uvicorn takes the client from the last X-Forwarded-For entry, which Tailscale adds; forged headers were ignored in a live test), and the host check accepts phone-access names for local clients. `/sw.js` is served with the home URL filled in (empty when Funnel is on, so the public file doesn't reveal the `.local` name).

## `tailscale.py` (Oct 19)

- `cli()`: `tailscale` on PATH, else the Mac app's binary or `C:\Program Files\Tailscale\tailscale.exe`. `status()` from `status --json`: running (`BackendState`), MagicDNS name (`Self.DNSName`), `TailscaleIPs`, HTTPS available (`CertDomains` non-empty), account.
- `serve_on(name, local_port, ips)`: reads `serve status --json` (`Web["<name>:<port>"].Handlers["/"].Proxy`, `TCP["<port>"]`), reuses spotDLr's own entry, skips a port Tailscale serves something else on, and skips **443 when another program listens on it for the Tailscale address** (bind test). On this Mac, Local (Flywheel)'s nginx holds `*:443`, and connections to the Mac's own Tailscale IP reached it ("Super Fake Company" self-signed cert), so spotDLr uses **8443**. Then `serve --bg --yes --https=<port> http://127.0.0.1:<port>`. `serve_off(port)` = `serve --https=<port> off` (only ours).
- **Guard:** Tailscale forwards from 127.0.0.1, so `PhoneAccess.is_remote()` = non-loopback client **or** a Host ending in `.ts.net`; such requests need the key like Wi-Fi ones, and the pairing cookie is `Secure` there. `PUBLIC_PATHS` (manifest, icons, `/sw.js`) answer without the key on an allowed phone host, because browsers fetch them without cookies.
- **Funnel** (Oct 19): `funnel_on` = `funnel --bg --yes --https=<port> http://127.0.0.1:<local>` (ports 443/8443/10000 only), checked through `AllowFunnel["<name>:<port>"]` in `serve status --json`; a policy that doesn't allow it yet returns Tailscale's login.tailscale.com link, shown to you. `funnel_off` = `funnel --https=<port> off`, then the private entry is restored **on the same port** if "off" dropped it (it first came back on 443, which on this Mac is Local's nginx). Turning Tailscale off turns Funnel off first; startup re-applies it. The guard is unchanged (it's still a `.ts.net` Host from 127.0.0.1 → key required); with Funnel on, `/sw.js` leaves out the home `.local` name. This tailnet allows Funnel (`funnel` cap, ports 443/8443/10000). Tested with a stand-in CLI only; left off on the real Mac.
- `phone.json` adds `tailscale`, `ts_name`, `ts_port`; on startup the entry is re-checked (`serve_on` is a no-op when unchanged). The current `is_remote` implementation also recognizes this computer's own Wi-Fi/Tailscale addresses as local, as described above and in [[Phone Access]].

## `schedules.py` (Oct 19)

Scheduled plays in `DATA/schedules.json`: `{id, device, device_name, what: {kind, key, label, href, ids}, time, days (Mon=0) | date, shuffle, fade_in, enabled, last_run}`. `save()` validates (time `HH:MM`, a date or days, something to play, a device) and resets `last_run` when the time/days/date change. `fired(id, occurrence)` is the once-only claim: true only if enabled and `last_run` differs, then records it; a one-off turns itself off. Playing happens in the page (see Frontend); the server only stores and arbitrates. The Windows window starts Edge/Chrome with `--autoplay-policy=no-user-gesture-required` (its own profile, so the flag always applies).

## `loudness.py` (Oct 19)

FFmpeg `ebur128=peak=sample` → integrated LUFS and sample peak from the Summary block. Cached as `id → [mtime, size, lufs, peak]` in `loudness.json`; one measurement per song even with concurrent requests (an Event per id). `start_scan` measures everything unmeasured, one at a time. The player turns songs louder than -14 LUFS down (never up).

## Changing things

| Want to… | Edit |
|---|---|
| Allow a phone to use the app | Settings → Phone access; see [[Phone Access]] |
| Change music/settings folders | Set `SPOTDLR_MUSIC_DIR` / `SPOTDLR_DATA_DIR` before process startup; see [[Data and Storage]] |
| Change spotDL flags | `Downloader._command()` |
| Change the stall/overall timeouts | constants at the top of `downloader.py` |
| Spotify results for another country | `SPOTIFY_MARKET=PH` in `.env` |
