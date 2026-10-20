# How It Works

Let's trace one real flow by hand: you search "jvke", download an album you don't have, then play it. Every step points to the code that does it.

Reviewed **2026-10-19**. Related: [[Backend]] · [[Frontend]] · [[API Reference]] · [[Search and Downloads]] · [[Data and Storage]]

Older timings and library counts in this walkthrough are historical examples, not new measurements. Function names are the source references; old line numbers have been removed.

---

## 0. The core idea: the folder *is* the library

There's no database. `downloads/` is the source build's default music folder, including the native Mac app; the frozen Windows installer uses the user's Music folder. Tags provide metadata, with filename fallbacks for imported or untagged files. A downloaded track may contain:

```
JVKE Radio/d4vd - Sleep Well.m4a
  title:   Sleep Well           artist: ['d4vd']        album: Sleep Well
  length:  172.3 s              cover:  144,189-byte JPEG
  ----:spotdl:WOAS  →  https://open.spotify.com/track/7MGUDGEQpcqf29gWAmJyy4
```

That last tag is the interesting part. **Source IDs enable exact ownership matches when present.** The frontend checks Spotify or YouTube IDs first, then normalized title + main artist. Imported or untagged files may have neither ID. See `Library.spotify_index`, `Library.youtube_index`, and frontend `owned`.

Reading tags is fast enough to do live: the first scan of 246 files takes 1.3 s, and each rescan after that takes **15 ms**, because unchanged files (same mtime and size) come from cache (`library.py`).

## 1. Boot

On the Mac, `spotDLr.app` (`launcher/macOS.swift`) probes `/api/ping` and opens the UI in WebKit. If needed, it starts `run.sh` with `SPOTDLR_NO_BROWSER=1`. The Terminal/browser alternative remains `run.command` → `run.sh`. Both source paths run `.venv/bin/python app.py`:

1. `paths.py` resolves app/music/data directories, then `load_dotenv(DATA_DIR / ".env")` loads optional credentials.
2. `app.py` creates the library, downloader, genre lookup, lyrics, likes, listening history, cleanup, loudness, schedules, phone access, and export/test services. The downloader starts one worker thread.
3. Uvicorn serves `127.0.0.1:8000`.

The page loads `/api/status/init`, which returns cached connection status immediately and refreshes stale status in the background (`spotify_api.check(wait=False)`). Search and downloads can use YouTube Music while Spotify is unavailable; the local library still plays.

## 2. Search

Typing "jvke" in the top bar sets `#/search/jvke` after a 350 ms pause (`replaceState`, so typing doesn't fill your history). The view then looks in two places:

```
local  = S.tracks where every word is in "title artists album"   → "In your library" (no network)
remote = GET /api/search?q=jvke                                   → Spotify if connected, else YouTube Music
```

The Spotify branch calls `sp.search(type="track,artist,album,playlist", limit=10)` and trims results. The YouTube Music branch returns the same categories. The frontend marks ownership at render time using source IDs, then title + main artist. So when a download finishes and the library reloads, the cached search results update their checkmarks without asking Spotify again.

> [!note] Retries are off on purpose
> spotipy normally sleeps through a 429 `Retry-After` and retries bad credentials. That's how the old app "hung" forever on dead keys. Retries remain disabled for Spotify calls, with a configured 10-second request timeout and readable mapped errors; there is no fixed response-time guarantee.

## 3. Download an album

On the album page, **Download 2 missing** posts:

```json
POST /api/download
{ "query": "https://open.spotify.com/album/…", "type": "album", "title": "Of June", "total": 7,
  "format": "m4a", "bitrate": "auto", "includeLyrics": false }
```

The server selects an engine before calling `downloader.submit(...)`, which puts the job on a `queue.Queue` and returns. A source build with working Spotify uses spotDL for this URL. Without Spotify, or in the frozen installer, the URL uses Spotify embed metadata → YouTube Music matching → yt-dlp. See [[Search and Downloads#Download selection]].

For the **spotDL branch**, the worker runs the following flow (`Downloader._run`):

```
before = every audio file under downloads/          # snapshot
spotDL: python -m spotdl download <url> --output downloads/Of June --format m4a
        --force-update-metadata --ytm-data --threads 4 [--bitrate 192k] [--generate-lrc]
for each line spotDL prints:                        # blocking is fine: worker thread
    'Found 7 songs'          → total = 7
    'Downloaded "…": https…' → message
    'Skipping …'             → skipped += 1
    done = new files in folder + skipped
after = every audio file under downloads/
new_files = after − before
```

**This is the key change: success is judged by files on disk, not by the exit code.** spotDL exits 0 even when it was killed or found nothing (seen Oct 15: `completed (246 / 1 songs)` with no file written). Now:

| Situation | Result |
|---|---|
| new files, or "already exists" skips | `completed` · "2 new, 5 already in library" |
| exit code ≠ 0 | `failed` + the most useful line from spotDL's output |
| exit 0 but nothing new | `failed` · "Nothing downloaded" + the reason |
| silent for 5 min / over the time limit | killed by the watchdog → `failed` with why |
| you hit Cancel | `cancelled` |

## 4. The browser follows along

`GET /api/jobs` every 1 s while something is active, every 15 s otherwise. When a job switches from active to finished, the UI:

1. shows a toast ("Downloaded: Of June (2 new)"),
2. reloads `/api/library` (unchanged tags come from cache),
3. re-renders the current view keeping your scroll position, so ⬇ buttons become ✓.

## 5. Play

Double-click a row. The view registered that table's track IDs as a *context* when it rendered, so the player gets the whole list plus the row's index:

```
P.queue = [ids in the table]
P.order = [0, 1, 2, …]   or, with shuffle: [clicked, ...random rest]
P.audio.src = /api/stream/<id>
```

`/api/stream` answers HTTP `Range` requests with `206 Partial Content` (`app.py`). This matters: Starlette 0.27's `FileResponse` ignores `Range` and always sends the whole file, and Safari won't seek `<audio>` without real 206 responses. Verified: a seek to 50% of a 170 s track landed at 85.0 s.

Mac media keys and Control Center work through the Media Session API: title, artist and cover come from the same tags.

## 6. Without Spotify: YouTube Music

Since Feb 2026 Spotify's API needs Premium on the app owner's account, so the app has a second road that needs no account at all. It works because **the audio always came from YouTube Music anyway**; Spotify only ever said *which* songs.

```
search "jvke"  ──► ytmusic.search(): 4 filtered searches in parallel (songs/artists/albums/playlists), ~1.4 s
YouTube link   ──► ytmusic.resolve()  → [tag data per song]
Spotify link   ──► spotify_embed.item() reads open.spotify.com/embed/... (__NEXT_DATA__ JSON, ≤100 songs)
                   └► per song, just before downloading: match_song()
                        YouTube Music "songs" search for "<artist> <title>", best of 5 by
                        0.55·title + 0.45·artist, −0.3 if length is >10 s off, keep if ≥ 0.7
download       ──► yt-dlp (needs Node/Deno + yt-dlp-ejs) → M4A stream copy → mutagen tags:
                     title, artists, album, year, track #, cover, ©cmt = YouTube URL,
                     ----:spotdl:WOAS = Spotify URL (when it came from Spotify)
```

The downloader writes source URLs into tags so library ID indexes can recognize owned songs. The frontend can also fall back to title + artist. Earlier testing recorded 12/12 matches on one playlist; matching other recordings remains heuristic, not guaranteed.

## 7. Genres

Only 72 of 368 files had a genre tag (spotDL copies Spotify's artist genre when one exists, in narrow terms like "red dirt"), and YouTube Music has none. So `genres.py` asks **Deezer's public API** (no key) once per song, in a background thread at ≤ 7 requests/s:

```
"Miss Missing You - Fall Out Boy Lyrics" by "frank lampard"   (a fan upload)
  clean title  → "Miss Missing You - Fall Out Boy"          (drop Lyrics/Official Video/Part 2 of 11…)
  guesses      → (frank lampard, whole title), (Miss Missing You, Fall Out Boy), (Fall Out Boy, Miss Missing You)
  each guess   → strict  artist:"…" track:"…"   then plain "… …"   (strict sometimes returns 0 for songs Deezer has)
  accept a hit → artist ≥ 0.85 similar AND title close or contained ("Light Em Up" ⊂ "My Songs Know… (Light Em Up)")
  album genres → ["Alternative", "Indie Rock"] → "Alternative"   ("Asian Music, K-Pop" → "K-Pop")
```

Results live in `.genres.json`, keyed by artist + title (the same song in two playlists is one lookup), never in the files themselves, because rewriting tags changes the mtime and "Date added" *is* the mtime. Misses are retried a day later; a better matcher bumps `LOOKUP_VERSION` so older misses retry at once. **Result:** 352 of 368 songs (96%) in 15 genres, with Pop 143 and Alternative 75 the largest.

---

Other workflows are documented in [[Playback and Schedules]], [[Phone Access]], and [[Data and Storage]]. Those cover the browser-driven scheduler, pairing, persistent files, cleanup, and export behavior beyond this download walkthrough.
