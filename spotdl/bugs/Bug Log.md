# Bug Log

Started Oct 15, 2026 from a full code read. Each entry says how it was checked. Related: [[Backend]] · [[Frontend]] · [[How It Works]]

## Open

### Spotify secret: rotate once working

The old keys in the public git history are dead (`invalid_client`). New keys (`…f0d4`) were saved Oct 15, but they were pasted into a chat session, so **regenerate the client secret** in the dashboard once everything works, and paste the new one into Settings → Spotify connection. Also delete the old app if it's still listed. Optional afterwards: purge the history with `git filter-repo`.


### Blocked: Spotify requires Premium for the app owner

Since **Feb 11, 2026** (new apps; existing apps migrated Mar 9), every Spotify Development Mode app needs its **owner to have an active Premium subscription** ([migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)). With the new keys (`…f0d4`, saved Oct 15), the token works but **every** call returns `403 Active premium subscription required for the owner of the app. When the subscription status changes, it can take a few hours before requests are allowed again.` (checked on search, track and album). This applies to spotDL as well, since it uses the same keys. **Unblock:** Premium on the account that owns the app, or create the app from an account that has Premium. The app saves valid keys anyway and shows this message, and its 5-minute re-check turns it on by itself.

**Workaround in place (Oct 15):** search and downloads now run through **YouTube Music** when Spotify isn't usable, and Spotify links are read from Spotify's public embed player. See [[How It Works#6. Without Spotify: YouTube Music]]. What still needs Spotify: free-text downloads through spotDL, and Spotify artist pages.

### Feb 2026 API changes to re-test once unblocked

From the same guide; handled in code but untested against live data:
- Playlists: `tracks` → `items`, entries' `track` → `item`, and **songs are only returned for playlists you own**. The UI says so instead of showing an empty table.
- `GET /artists/{id}/top-tracks` removed. The artist page shows Discography only.
- Search max `limit` is now 10 (the app already uses 10).
- Track/album/artist `popularity`, `followers`, `label` removed. The code tolerates missing fields.
- **spotDL 4.4.3** calls `playlist_items()` (the old `/playlists/{id}/tracks`, removed) and `user_playlists()` (removed), so **playlist downloads will likely fail**. spotDL **4.5.2** is out; try upgrading (`requirements.txt`), but it may bump FastAPI/pydantic pins.

### Spotify links without the API stop at 100 songs

Spotify's embed player (`open.spotify.com/embed/playlist/…`) lists at most **100** songs. The test playlist "Popular songs tuned to 432hz" has **181** (from its `music:song_count` meta), so 81 are skipped. The crawler-rendered page lists only 30. The rest would need Spotify's private web-player API, which isn't worth reverse-engineering. The UI shows "first 100 songs only" and the download job notes it. Fix: Spotify API access (Premium), or use a YouTube Music copy of the playlist.

### Windows launcher untested on a real PC

Everything Windows-side was checked on the Mac only (portable PowerShell 7.4.6: parse, PS 5.1 compatibility scan, logic tests). See [[Launchers & Setup#Windows: the spotDLr shortcut (launcher, from source)]] for what's still unverified.

### Small stuff

- `.lrc` lyric files are downloaded but not shown in the player.
- `spotdl.html` is an empty, tracked file.
- `python-multipart` is installed but unused.
- Download history lives in memory and is lost on restart (the files themselves are fine).
- `run.ps1` hasn't been run since its rewrite (no PowerShell on the Mac).
- Spotify search and album/playlist/artist pages have only been tested against a mock built from real library IDs, because the current credentials are dead. Re-test once `.env` has working keys.

## Fixed

### Now Playing flashed when toggling lyrics (Oct 16)

Turning lyrics on or off made the whole view blink. `renderNowView()` rebuilt everything with `root.innerHTML`, including the backdrop and panel, so (1) the backdrop's 0.2 s `nv-fade` animation replayed on every render, and (2) the new panel started at the default grey `--nv: #535353` until the cover colour promise resolved, then faded to it over the panel's 0.6 s background transition. Song changes did the same, less visibly. **Fix:** the backdrop and panel are created once per opening; re-renders only replace the panel's contents. Cover colours already computed (`NV.colors`) are applied synchronously; a new song keeps the previous tint until its own colour is ready, so it never goes grey. **Checked (headless Chrome):** 10 lyrics toggles plus 3 song changes gave 0 `nv-fade` animations and 0 grey frames out of ~490 animation frames, with the same backdrop and panel elements throughout; close and reopen still fades in once.

### Lyrics: every lookup failed, then 12 of 40 failed (Oct 16)

First test of `/api/lyrics`: 40 of 40 returned 502, though `curl` reached LRCLIB fine. The real exception was `CERTIFICATE_VERIFY_FAILED`: **python.org's Python on macOS ships without root certificates**, so `urllib` can't verify any HTTPS site, while `requests` (used everywhere else) brings `certifi`. **Fix 1:** `lyrics.py` uses `requests`. Then 12 of 40 failed in clusters. LRCLIB answered `503 {"name": "ServerOverloaded", "message": "The server is busy, please retry in a moment"}` to a burst, and one failed request aborted the whole lookup even when the next way of asking (`/search` after `/get`) would have found it. **Fix 2:** 429/5xx/connection errors get two retries (1 s, 3 s), a failed request moves on to the next attempt, and only "nothing found *and* something failed" is an error (not cached, so it's retried later). **Checked:** a fresh sample of 40 songs, paced like real listening: 38 synced, 1 plain, 1 none (white noise), 0 errors; a second pass from the cache took 69 ms for all 40.

### App window kept running the old UI after an update (Oct 16)

After the Now Playing view shipped, the spotDLr window showed no ↗︎ button: `curl` got the new `index.html`, but Chrome never asked for it. `/` and `/static/*` went out with an ETag and Last-Modified but **no Cache-Control**, so Chrome applied heuristic freshness (≈10% of the time since Last-Modified, so a week-old file counts as fresh for ~17 h) and served its own copy. **Fix:** the `local_only` middleware adds `Cache-Control: no-cache` to `/` and `/static/*`, so every load revalidates and gets a 304 when unchanged (checked with `If-None-Match`). A copy cached before the fix still needs one hard reload (⌘⇧R).

### Playlists left out songs you already had (Oct 16)

"Good Vibes Morning Mix" (50 songs): the job said `42 new, 8 already in library`, but the playlist showed 42 songs. Collections were *folders*, and owned songs are skipped (rightly: no duplicate files), so the 8 stayed in their old folders and never joined the playlist. **Fix:** the ownership callbacks now return `{id: path}` instead of a set, `_run_ytm` collects every song's path in order (owned or new), and `write_playlist()` writes `playlist.m3u8` (relative paths, written atomically) into the folder; `library._collections()` uses it for membership and order. **Checked:** a throwaway library (cross-folder entries resolved, order kept, a folder with only an m3u8 still listed), then re-ran the real playlist: `50 already in library`, and the playlist shows 50 songs, 8 of them `../` entries. The spotDL path (`_run`, only used with working Spotify keys) doesn't write an m3u8 yet.

### Windows: FFmpeg lookup missed ffmpeg.exe; run.bat demanded Spotify keys (Oct 15)

`ytmusic.ffmpeg_path()` looked for `~/.spotdl/ffmpeg`, but spotDL installs `ffmpeg.exe` on Windows, so without FFmpeg on PATH every conversion would fail. It now checks both (tested by simulating "no PATH, only ffmpeg.exe"). `run.bat` exited without Spotify keys and installed into the global Python; it now hands over to `launcher/windows/server.ps1` (private `.venv`, keys optional). The Node.js error message now says `winget install OpenJS.NodeJS` on Windows.

### Launcher: "Operation not permitted" from ~/Downloads (Oct 15)

First launch of `spotDLr.app`: `/bin/bash: …/Downloads/spotDLr-web_ui/run.sh: Operation not permitted`. macOS privacy protection (Files and Folders) covers Downloads, Documents and Desktop. Terminal had been granted access, but a brand-new app hadn't, and an unsigned script app gets no permission prompt at all; the read just fails. **Fix:** moved the project to `~/Projects/spotDLr-web_ui` (same disk, so an instant rename; `.venv` kept working) and rebuilt the launcher. The alternative (Full Disk Access for the app) was rejected as broader than needed.

### Launcher: server crashed with "incompatible architecture" (Oct 15)

Next launch: `_pydantic_core…darwin.so: incompatible architecture (have 'arm64', need 'x86_64')`. A script-only `.app` has no Mach-O for macOS to inspect, so on Apple Silicon it runs under **Rosetta**, and every child inherits x86_64: bash → `run.sh` → the universal python.org Python picked its Intel slice, which can't load the venv's arm64 wheels. From Terminal everything runs natively, so it never showed before. **Fix:** the launcher re-execs itself with `arch -arm64` when `hw.optional.arm64` is 1 and `uname -m` isn't arm64 (this also keeps a Chrome it starts native). **Checked:** cold start 3 s, warm start 1.07 s with the same server.

### Some songs failed with "HTTP Error 403: Forbidden" (Oct 15)

Album "American Idiot" (YouTube Music): `7 new, 2 failed`. Both failures (`American Idiot`, `Extraordinary Girl / Letterbomb`, both `MUSIC_VIDEO_TYPE_OMV` official videos) were `ERROR: unable to download video data: HTTP Error 403: Forbidden`. Retried by hand minutes later, both downloaded, while the same song failed in another format. So YouTube **intermittently** rejects an audio URL it just issued, and yt-dlp's `retries` reuses that same URL. **Fix:** `download_track()` retries a 403 with a **fresh extraction** (new URLs), up to 3 attempts with 2 s/4 s pauses, the last one accepting any audio format; other errors fail at once. Download jobs with failures get a **Retry** button (owned songs are skipped, so it only fetches what's missing). **Checked:** the retry loop against a fake yt-dlp (403,403,ok → recovers on attempt 3; 403×3 → error; 404 → 1 attempt), then the real album re-run: `2 new, 7 already in library`.

### Covers showed as broken images (Oct 15)

On "21 pilots" search, most album/playlist covers were broken. Each URL tested alone: every `yt3.googleusercontent.com` cover returned **HTTP 429**, every `i.ytimg.com` cover 200, and minutes later the same URLs returned 200. Google's image host rate-limits bursts, and a search page fires 30–40 cover requests at once from the browser. **Fix:** covers go through `GET /api/img?u=` (`app.py`): fetched once, at most 4 at a time, retried with back-off on 429, cached on disk in `.imgcache/` (gitignored), and served same-origin. It only proxies an allowlist of YouTube/Spotify image hosts (http, unknown hosts, `169.254.169.254` and localhost all get `400`). Any image that still fails is swapped for the placeholder icon. Artist photos live on a fourth host, `yt3.ggpht.com` (caught by the test), now allowed and resized. **Checked:** 27/27 covers rendered on first load and reload, 0 console errors.

### YouTube downloads: yt-dlp 403 without a JavaScript runtime (Oct 15)

yt-dlp 2026.08.19 needs a JS runtime plus the `yt-dlp-ejs` solver to unlock YouTube audio URLs. Without them: `WARNING: No supported JavaScript runtime… ERROR: unable to download video data: HTTP Error 403`. spotDL installs plain `yt-dlp`, without the `[default]` extras. **Fix:** `yt-dlp-ejs==0.8.0` in `requirements.txt`, and `ytmusic.download_track()` passes `js_runtimes` for the first of deno/node/bun on PATH (Node 22 here). **Checked:** golden hour downloaded in 5.2 s, itag 140 AAC ~130 kbps, stream-copied to M4A.

### Remote covers from i.ytimg.com didn't load (Oct 15)

`imageArt()` set `crossorigin="anonymous"` on every remote `<img>` so the hero colour could be sampled, but `i.ytimg.com` sends no CORS headers, so Chrome refused the image (`Access to image … blocked`). **Fix:** no `crossorigin` on visible images; `applyHeroColor()` already samples from its own separate request and falls back to grey.

### Downloads never used your Spotify keys (Oct 15)

**spotDL's CLI reads no environment variables** (`grep -r SPOTIPY` over the installed package: 0 files). Without `--client-id/--client-secret`, every download, in the old app and in the rewrite, used spotDL's **built-in shared keys** from `~/.spotdl/config.json`, which every spotDL user shares. Tested directly with retries off: those keys **get a token but searches return HTTP 429**. Inside spotDL, spotipy keeps retrying the 429, which is the real cause of the "Processing query" hang (not the `.env` keys, which spotDL never saw). **Fix:** `Downloader._command()` passes `--client-id/--client-secret` from the environment. Checked: the built command contains your ID.

> Correction to the "credentials committed" entry below: the pair hard-coded in `run.ps1` (`5f573c96…`) is spotDL's public default, published in spotDL's own source, not yours. Your own keys were the ones in the committed `.env` (checked by comparison, without printing them), so rotating is still right.

### Media-library rewrite fixed eleven open bugs (Oct 15)

Turning the app into a Spotify-style library ([[History]]) replaced the code these bugs lived in. Each one below is fixed by design, not patched:

| Was | Now |
|---|---|
| **Stopped/failed downloads said "completed"**: success = exit code 0, and spotDL exits 0 when killed (`completed (246 / 1 songs)` with no file written) | Success = files on disk (before/after snapshot). Nothing new → `failed` with spotDL's reason; cancel → `cancelled` |
| **"Ready" with dead credentials, then an endless hang** | `/api/status/init` really requests a token; downloads are refused up front with Spotify's message; the watchdog kills spotDL after 5 min of silence |
| **Bitrate dropdown did nothing** | `--bitrate Nk` is passed; the default is "Auto (keep source)", since re-encoding a ~128–160 kbps YouTube stream to 320 adds size, not quality |
| **One global status slot** | A queue of jobs, each with its own id and status; `GET /api/jobs` |
| **Single-track progress counted the whole library** | Progress = new files in the job's folder since it started, plus skips |
| **Same filename in two folders played the wrong file** | Tracks are addressed by an id derived from their full path |
| **Failure reason was lost** | The last 40 spotDL lines are kept; the UI shows the best error line and a "spotDL output" expander |
| **No timeout** | Watchdog: 5 min of silence, or `900 + 90 × tracks` s overall |
| **Frontend hard-coded `localhost:8000`** | Same-origin `/api/...` |
| **CORS wide open** | Middleware removed (the UI is same-origin) |
| **Duplicate `formatTime`, dead storage stat, duplicate `id="totalSongs"`, unescaped `data-filename`** | Old UI replaced; all output goes through the auto-escaping `html` template |

### Seeking: `/api/stream` ignored HTTP Range (Oct 15)

Found while testing the rewrite: `Range: bytes=0-1023` returned `200` with all **2,851,626 bytes**. The same was true of the old `/api/download/{filename}`, which even sent `Accept-Ranges: bytes`. Starlette 0.27's `FileResponse` doesn't implement Range, and Safari won't seek `<audio>` without `206` responses. **Fix:** `_ranged_file()` in `app.py` handles `bytes=a-b`, `a-`, `-n` → `206` with `Content-Range`, past the end → `416`, and no header → `200`. **Checked:** all five cases with curl, a byte-exact sha1 of a `206` slice against the file on disk, and in Chrome, a seek to 50% of a 170 s song landed at 85.0 s.

> Testing gotcha: in zsh, `${r:+-H "Range: $r"}` isn't word-split, so curl sent no Range header and every case showed `200`. Pass `-H` explicitly.

### Docs drift (Oct 15)

README described features and routes that didn't exist (`/api/status/{id}`, artist folders, Space to play/pause, a "Spotify theme"). Rewritten for the new app: features, usage, shortcuts, structure, API, configuration. SETUP.md and DEPLOYMENT.md are still the old Windows-era guides.

### Mac: launcher broke outside the repo folder, touched system Python (Oct 15)

`run.sh` used relative paths, so launching it from Finder or a new Terminal (cwd `~`) exited with `Error: requirements.txt file not found` (reproduced). It also pip-installed the pinned old versions (fastapi 0.103, …) into the **global** Python, which Homebrew's Python refuses (PEP 668). Plain `brew install python3`, as the README said, now gives 3.14, which spotDL 4.4.3 rejects (`Requires-Python: <3.14,>=3.10`). Separately, `app.py` ran whatever `spotdl` came first on PATH and used `downloads/` and `index.html` relative to the cwd. Its FFmpeg check also missed spotDL's own copy in `~/.spotdl/`, so it downloaded it again on every run.

**Fix:** `run.sh` now `cd`s to its own folder, picks Python 3.13→3.10, builds `.venv/` (reinstalling only when `requirements.txt` changes), checks `~/.spotdl/ffmpeg`, stops with a clear message if port 8000 is busy, and opens the browser. New `run.command` lets you double-click it in Finder. `app.py` resolves paths from `BASE_DIR = Path(__file__).parent` and runs `sys.executable -m spotdl`, so it uses the same Python as the venv. **Checked:** launched `run.command` from `~` on this Mac (Python 3.13.1). It created the venv, served `/` (200) and all 246 files, and the spawned command was `.venv/bin/python -m spotdl download …`. A real download couldn't finish because of the credentials (see Open).

### Spotify credentials committed to a public repo (Oct 15)

`git ls-files` showed `.env` and `.cache` (spotipy's cached access token) were tracked in a **public** repo, and `run.ps1:22-23` had a Client ID and Secret typed in. `.gitignore` covered `.env.local` but not `.env`. **Fix:** `.env` and `.cache` are now in `.gitignore` and untracked (`git rm --cached`; the local files are kept). `run.ps1` now reads `.env` like `run.bat`, and prompts and saves if it's missing. `git grep` finds no 32-hex keys left in tracked files. Not tested on Windows, because there's no PowerShell on this Mac. The old values are still in history: see "Spotify secret still needs rotating" above.

### Download loop blocked the event loop (Oct 15)

`process_download` was an `async def` run on the event loop, and it called the blocking `process.stdout.readline()`. While spotDL was quiet, the server couldn't answer anything: status polls, the file list, or audio streams. **Reproduced** against the real `app.py`, with a fake `spotdl` on PATH that prints one line every 2 s: `GET /api/status` took **1,500–2,960 ms** during the download and 3–7 ms after it. **Fix:** `process_download` is now a plain `def`, so FastAPI runs it in its threadpool, and the `asyncio.sleep` calls (plus the `asyncio` import) are gone. Same test after: **1–23 ms** throughout, and `completed` shows at t=6.1 s (3 lines × 2 s) instead of 8.0 s.
