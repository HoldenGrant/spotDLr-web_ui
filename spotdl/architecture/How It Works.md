# How It Works

Let's trace one real flow by hand: you search "jvke", download an album you don't have, then play it. Every step points to the code that does it.

Related: [[Backend]] · [[Frontend]] · [[API Reference]]

---

## 0. The core idea: the folder *is* the library

There's no database. `downloads/` holds the music, and spotDL has already written everything we need into each file's tags:

```
JVKE Radio/d4vd - Sleep Well.m4a
  title:   Sleep Well           artist: ['d4vd']        album: Sleep Well
  length:  172.3 s              cover:  144,189-byte JPEG
  ----:spotdl:WOAS  →  https://open.spotify.com/track/7MGUDGEQpcqf29gWAmJyy4
```

That last tag is the interesting part. **Every file carries its exact Spotify track ID.** So "is this search result already in my library?" isn't fuzzy title matching. It's a dictionary lookup: `{spotify_id: local_id}` (`library.py:70`).

Reading tags is fast enough to do live: the first scan of 246 files takes 1.3 s, and each rescan after that takes **15 ms**, because unchanged files (same mtime and size) come from cache (`library.py:42`).

## 1. Boot

`run.command` → `run.sh` → `.venv/bin/python app.py`:

1. `load_dotenv(BASE_DIR / ".env")` loads the credentials (`app.py`).
2. `Library(downloads/)` and `Downloader(downloads/)` are created. The downloader starts its one worker thread (`downloader.py:40`).
3. Uvicorn serves `127.0.0.1:8000`.

The page loads `/api/status/init`, which *actually asks Spotify for a token* (`spotify_api.py:49`, cached for 5 min). If Spotify refuses (e.g. `invalid_client`), the UI shows a banner and the library still plays.

## 2. Search

Typing "jvke" in the top bar sets `#/search/jvke` after a 350 ms pause (`replaceState`, so typing doesn't fill your history). The view then looks in two places:

```
local  = S.tracks where every word is in "title artists album"   → "In your library" (no network)
remote = GET /api/search?q=jvke                                   → Spotify
```

The server calls `sp.search(type="track,artist,album,playlist", limit=10)` and trims each result to the fields the UI uses (`spotify_api.py:171`). The frontend marks each track as owned with `S.bySpotifyId.get(track.id)`, at render time. So when a download finishes and the library reloads, the cached search results update their checkmarks without asking Spotify again.

> [!note] Retries are off on purpose
> spotipy normally sleeps through a 429 `Retry-After` and retries bad credentials. That's how the old app "hung" forever on dead keys. Now every error comes back in ~0.2 s with a readable message (`spotify_api.py:66`).

## 3. Download an album

On the album page, **Download 2 missing** posts:

```json
POST /api/download
{ "query": "https://open.spotify.com/album/…", "type": "album", "title": "Of June", "total": 7,
  "format": "m4a", "bitrate": "auto", "includeLyrics": false }
```

The server checks the credentials (it refuses early rather than letting spotDL hang), strips `?si=` tracking params, and calls `downloader.submit(...)`, which puts the job on a `queue.Queue` and returns right away (`app.py:157`).

The worker thread picks it up (`downloader.py:133`):

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
2. reloads `/api/library` (15 ms on the server),
3. re-renders the current view keeping your scroll position, so ⬇ buttons become ✓.

## 5. Play

Double-click a row. The view registered that table's track IDs as a *context* when it rendered, so the player gets the whole list plus the row's index:

```
P.queue = [ids in the table]
P.order = [0, 1, 2, …]   or, with shuffle: [clicked, ...random rest]
P.audio.src = /api/stream/<id>
```

`/api/stream` answers HTTP `Range` requests with `206 Partial Content` (`app.py:88`). This matters: Starlette 0.27's `FileResponse` ignores `Range` and always sends the whole file, and Safari won't seek `<audio>` without real 206 responses. Verified: a seek to 50% of a 170 s track landed at 85.0 s.

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

The tags are the same ones spotDL writes, so new and old files look identical to the library, and "already in library" stays an exact ID match (all 246 existing files have both IDs). Tested on the user's playlist: 12/12 songs matched to the original album versions in 6.8 s.

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

And that's all this app really is: **tags → library, Spotify IDs → "do I have it?", files-on-disk diff → "did it work?", Range → seeking.** Four small ideas, each one replacing a guess the old version made.
