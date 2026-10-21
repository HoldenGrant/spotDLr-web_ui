# Bug Log

Started Oct 15, 2026 from a full code read. Each entry says how it was checked. Related: [[Backend]] · [[Frontend]] · [[How It Works]]

## Fixed Oct 20, 2026

### Lyrics download: Method Not Allowed from an older running server

The interface had the new **Download lyrics** action, but the running Python process only exposed `GET /api/lyrics/{track_id}`. A POST therefore returned `405`. Confirmed through the live server's OpenAPI routes; restarting the server loaded the new POST and library-status routes. This was a stale process, not a missing route in the updated source.

If it recurs after an update, finish active downloads, quit the native client with ⌘Q, stop only the confirmed spotDLr server process and reopen the app. Quitting the native Mac window does not stop/reload Python. See [[Launchers & Setup#spotDLr.app (native Mac app)]] and [[API Reference]].

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

### Mac app: volume slider did nothing after opening Now Playing (Oct 21)

**Cause:** the visualizer calls `createMediaElementSource(P.audio)`, and from then on **WebKit ignores `audio.volume`** (the native Mac app is WKWebView since 2.3.1). Measured with a test tone through Web Audio: Chrome 20% volume → ×0.20; WebKit → ×1.00, though `audio.volume` read back 0.2. "Sometimes" = only after Now Playing had built the graph (it lasts until reload). It also broke even volume, crossfade, sleep fade and schedule fade-in there. **Fix:** `graphVolume`, a GainNode after the analyser (`source → analyser → graphVolume → destination`; the bars no longer shrink with volume); `applyVolume()` sets the element to 1 and the gain to the level (`setTargetAtTime`, 15 ms, no clicks), mute → 0; without a graph (iOS, before Now Playing) it's `audio.volume` as before. `graphVolume` is declared before `applyVolume` (it runs at load, before `const V`, which would throw). **Checked** with the real app and a steady tone, in a WKWebView probe (Swift, 1×1 on-screen window, else WebKit throttles timers) and Chrome: 50% → 0.50, 20% → 0.20, mute → 0, in both.

### Phones: Particles/Retro info card only two-thirds wide (Oct 21)

The dark backing on those two modes is `width: max-content` (hug the text beside the cover on wide screens); with the new controls capped at 420 px it stopped at ~270 px on a 390 px phone. **Fix:** ≤600 px: stretch to the full width, controls 100%. **Checked** at 390 px: Bars/Particles/Retro all 16–374 px; desktop still hugs the text.

### The Mac couldn't open its own phone-access addresses (Oct 19)

Opening `https://…ts.net:8443` (or the Wi-Fi name) on the Mac itself showed "Scan the QR code": requests through Tailscale count as phones. **Fix:** `PhoneAccess.is_remote()` treats a client whose address is one of this computer's own (Tailscale IPs + Wi-Fi IP, cached 60 s) as local, and the host check accepts the phone-access host names for local clients. **Why it's safe:** through `tailscale serve` the client address comes from X-Forwarded-For, and uvicorn 0.23 takes the last entry, which Tailscale adds: sending `X-Forwarded-For: 100.79.20.11` or `127.0.0.1` through the real address still logged the Mac's true 100.84.170.72. On the Wi-Fi listener the address is the TCP peer (XFF isn't trusted there). **Checked:** Mac → Tailscale address 200, → Wi-Fi name 200, unknown Host 403.

### Unticking phone access wiped the key and the Tailscale address (Oct 19)

Holden unticked "Open spotDLr on your phone" (looking for the Funnel switch) and every QR code disappeared; ticking it again would have made a new key, signing out the iPhone's home-screen app. **Fix:** `disable()` is a pause: it stops the Wi-Fi listener and removes the Tailscale entry (Funnel first) but keeps `key`, `tailscale` and `funnel`; `enable()` → `start()` restores them on the same port. **Checked** (stand-in CLI): paired → 200; off → 403, no Tailscale entry, no Wi-Fi listener; on → same key, entry and Funnel back, same phone 200 without rescanning; New QR code → 403.

### Phone couldn't open spotDLr on the same Wi-Fi (Oct 19)

Two causes. (1) The **Anywhere** link (`*.ts.net`) only resolves inside Tailscale, so with Tailscale switched off on the phone it fails even next to the Mac: the steps in Settings now say to keep it connected at home too, and `/sw.js` is served with the home address so the offline page offers it. (2) The **Home Wi-Fi** link used the Mac's DHCP address, which changed 192.168.8.182 → .1.51 → .1.71 in one day. **Fix:** on a Mac, `phone.local_name()` (`scutil --get LocalHostName` + `.local`, cached 60 s) is the link's host, the number address is shown as a fallback, and `allowed_host` accepts the name. **Checked:** curl as a phone on the Wi-Fi with Host `Holdens-MacBook-Pro.local` → 403 without the key, pairing → 898 songs; another `.local` name → 403; the served `sw.js` carries the home URL.

### Phone layout issues from Holden's iPhone screenshots (Oct 19)

Found on the real phone, not by the 390/360 px portrait audit: (1) Bars (32% of the panel's height) and Wave (at 80% height) drew right behind the title/♥/progress, which sit at the bottom on phones → under 700 px wide or 500 px tall: bars 14% high and fainter, wave a thin line at 93%, plus a text shadow on `.nv-info`. (2) Long playlist names were 4 lines at 48 px → 24–40 px, at most 3 lines. (3) **Landscape** (844×390) used the desktop rows (64 + 72 px) and the cover was `56vh` → `@media (max-height: 500px) and (orientation: landscape)`: 48/56 px rows, cover `min(46vh, 260px)`, tags/up next/album hidden. (4) `viewport-fit=cover` + `env(safe-area-inset-*)` padding on `.app`, and the overlays' bottoms include the home bar. **Checked** with Chrome's safe-area emulation (47/34 px portrait, 47/21/47 px landscape): Now Playing ends 4 px above the player bar in both, the player bar is fully on screen, the cover stays in its panel; the 26-screen audit still finds nothing off the edge.

### iPhone: music stopped when the screen locked (Oct 19)

**Cause:** opening Now Playing starts the visualizer, which calls `createMediaElementSource(P.audio)`: from then on all playback runs through an AudioContext, and iOS Safari suspends AudioContexts when the screen locks, so the music went silent. Also, iOS makes `audio.volume` read-only (always 1), so crossfade would have played both songs at full volume. **Fix:** `IOS` (iPhone/iPod UA, or iPadOS = MacIntel + touch) → `ensureAudioGraph()` never touches `P.audio`; a `syntheticAnalyser()` (music-shaped spectrum, slow drift, 120 BPM pulse, eases to 0 when paused) feeds the same drawing code, and the visualizer menu says it's generated. `VOLUME_WORKS` (feature test: set 0.5, read back) gates crossfade and even volume; Settings disables them with a note. **Checked** with an iPhone user agent in Chrome: 0 AudioContexts created, music playing, visualizer drawing, note shown; desktop still creates one real AudioContext. **Confirmed on Holden's iPhone 13 Pro (Oct 19):** keeps playing with the screen locked, through Tailscale.

### Phone access moved to port 8001 after a restart (Oct 19)

**Cause:** the free-port test bound without `SO_REUSEADDR`, and the just-stopped spotDLr was still releasing the port, so the new one took 8001 and phones' bookmarks broke. **Fix:** `SO_REUSEADDR` in the test, wait up to 8 s for the usual port, and the 20 s watcher moves back to it if a fallback was used.

### Tailscale HTTPS on port 443 answered with someone else's certificate (Oct 19)

**Cause:** Local (Flywheel)'s nginx listens on `*:443`, so a connection from this Mac to its own Tailscale address on 443 reached nginx (self-signed "gardenwashington-2026.local / Super Fake Company") instead of `tailscale serve`. **Fix:** `serve_on` bind-tests 443 on the Tailscale IPs and uses 8443 when it's taken (moving an existing spotDLr entry). **Checked:** real `tailscale serve` on 8443 → Let's Encrypt certificate for the `.ts.net` name, 403 without the key, pairing, library, streaming, Chrome installability with no errors.

### Phones: no way to open Now Playing, so no visualizer (Oct 19)

**Cause:** under 600 px, `.extras` (⤢ Now Playing button, mute, volume) is hidden, leaving only a tap on the 56 px `#npArt` cover, which nothing hints at. **Fix:** on phones, a tap anywhere on `.now-playing` (cover, title, artist text) opens Now Playing, except ♥ and the artist links; the title link's navigation is prevented there. Desktop is unchanged (the title still goes to the playlist). **Checked** at 390×844 with touch events: ♥ toggles without opening it, the title and text open it, the visualizer menu opens and picking Ring works; at 1440 px the title still navigates.

### Phones: top search box ran under the Stats and Downloads buttons (Oct 19)

**Cause:** `.search-box` is a flex item, whose default `min-width: auto` is its content's width (273 px), in a 154 px grid column, so it overflowed under the buttons (same grey, so it looked like they were inside it). **Fix:** `min-width: 0`; on phones also 40 px top buttons and a hidden ✕ while the box is empty. **Checked:** search 64–250, buttons 258–386, no overlap.

### Mac app: "Port 8000 is being used by another app" about spotDLr itself (Oct 18)

Holden closed the window and reopened spotDLr: *"Port 8000 is being used by another app, so spotDLr can't start."* The port's owner was spotDLr's own server (`Python app.py`, pid 75800). **Bug:** the launcher's "are you spotDLr?" probe was `GET /api/status/init` with a 2 s deadline, and that route calls `spotify_api.check()`, which every 5 minutes makes two Spotify requests with `requests_timeout=10` (up to 20 s on a slow or just-woken network). Measured cold: median 0.19 s, but nothing bounds it. `desktop.py` had the same flaw with a 1 s deadline, and on a miss it would start a second server on the next port. **Fix:** `GET /api/ping` (`{"app": "spotDLr", "version"}`, no network, disk or git; 1.7 ms) for both launchers (3 s deadline, `/status/init` fallback for older servers). `/status/init` calls `check(wait=False)`: a stale answer is returned at once (0.3 ms) and refreshed on a background thread (one at a time); searches and downloads still use the blocking check. The Mac launcher's `port_is_ours` (the listener is `app.py` with cwd = the repo) makes it wait up to 30 s for its own busy server instead of blaming another app, with a different message if it never answers (no double quotes: `fail()` embeds the text in an AppleScript string, where a quote silently killed the alert). **Checked:** a stand-in "spotDLr" whose first 2 requests take 5 s: the old probe → "another app" after 2 s; the new launcher → recognised and opened after 6 s. A foreign server on another port → not ours. `desktop.py`: a second launch reuses the first (1 listener), and the fake-Edge suite still passes. `/Applications/spotDLr.app` rebuilt.

### Windows app v2.0.0: window opened on a dead "localhost" (Oct 16)

Holden's test of the v2.0.0 installer on a clean Windows PC: the spotDLr window showed localhost with nothing serving it. Log, twice in a row: `Serving on http://localhost:8000`, then immediately `Window closed; stopping`, with **no request for the page in between**. `desktop.py` judged "window closed" by `process.wait()` on the Edge process it launched, but Edge handed the window to another Edge process and exited at once, so the server stopped before the page loaded. It "worked" on Holden's dev PC only because his from-source server was also answering on :8000. **Fix:** the page decides. Every window checks in every 15 s (`POST /api/window/alive` with a per-window id) and says goodbye on `pagehide` (`sendBeacon /api/window/bye`); `desktop.py` stops once no window has checked in for 5 s, and a window silent for 180 s counts as gone (a hidden window's timers can slow to once a minute). If no window connects within 45 s, it opens the default browser instead. The window now opens `http://127.0.0.1:port`, the address the server actually listens on, since Windows may try `localhost` as IPv6 `::1` first. `SPOTDLR_BROWSER` overrides the browser path for tests. **Checked:** `desktop.py` with a fake browser that exits immediately (the v2.0.0 failure): the server stayed up, survived a reload and closing 1 of 2 windows, and stopped 5.8 s after the last window closed. Shipped as v2.0.1; **confirmed working on Windows by Holden** the same day.

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
