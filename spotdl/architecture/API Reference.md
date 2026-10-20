# API Reference

Base: `http://localhost:8000` (native Mac app uses `http://127.0.0.1:8000`; the Windows desktop executable can select another port). Local requests use the host/origin guard; phones use QR pairing. Reviewed against `app.py` on **2026-10-19**; lyrics-save routes added **2026-10-20**. Related: [[Backend]] · [[How It Works]] · [[Phone Access]]

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Page shell (`index.html`); the UI is `/static/app.js` + `/static/app.css` |
| GET | `/api/ping` | Immediate app identity and display version; launcher probe |
| GET | `/api/status/init` | Cached Spotify status, source, version/build, Apple Music support, and phone flag |
| GET | `/api/img?u=` | Allowed-host HTTPS cover proxy with disk cache |
| GET | `/api/genres/status` | Genre lookup `{pending, known}` |
| POST | `/api/window/alive` | Browser window heartbeat `{id}` → `{ok}` |
| POST | `/api/window/bye` | Browser window departure `{id}` → `{ok}` |
| GET | `/api/credentials` | Connection status + last 4 of the Client ID (never the secret) |
| POST | `/api/credentials` | Test keys; save accepted keys, including valid keys blocked by the Premium check |
| GET | `/api/library` | Tracks + collections |
| GET | `/api/stream/{track_id}` | Audio, with Range |
| GET | `/api/art/{track_id}` | Embedded cover |
| GET | `/api/lyrics/{track_id}` | Read sidecar/cache/LRCLIB lyrics for playback |
| POST | `/api/lyrics/{track_id}` | Save available synced lyrics beside one existing song |
| POST | `/api/lyrics/save-library` | Start/reuse a background lyrics-save pass for the library |
| GET | `/api/lyrics/save-status` | Current/last lyrics-save pass progress and outcomes |
| GET | `/api/search?q=[&source=]` | Search: YouTube Music, or Spotify when connected |
| GET | `/api/ytm/{kind}/{id}` | YouTube Music `album` / `playlist` / `artist` |
| GET | `/api/spotify/{kind}/{id}` | `album` / `playlist` / `artist` details |
| GET | `/api/stats?range=` | Library + listening stats. `range`: `today`, `yesterday`, `week`, `last-week`, `month`, `last-month`, `year`, `last-year`, `7d`, `30d`, `90d`, `365d`, `all` (default `30d`), else `400`. The old `?days=7/30/90/365/0` still works. `listening` adds `range`, `start`, `end` (epoch s), `compare` (what the deltas compare against, e.g. "last month by this time") and `bucket` `hour`/`day`/`month` |
| POST | `/api/plays` | Record a listen `{track_id, seconds}` → `{recorded}` (≥ 30 s, or half a short song) |
| POST | `/api/download` | Queue a download |
| GET | `/api/jobs` | Queue + recent history |
| DELETE | `/api/jobs/{id}` | Cancel |

The old routes (`/api/status`, `/api/downloads`, `/api/download/{filename}`) are gone. Nothing outside this app used them.

---

### `GET /api/status/init`

```json
{ "initialized": false,
  "message": "Spotify rejected the Client ID/Secret in .env (invalid_client). Create or rotate them at developer.spotify.com/dashboard.",
  "setup_url": "https://developer.spotify.com/dashboard/" }
```

The response also includes `search_source` (`spotify` or `ytm`), `version`, `build`, `apple_music`, and `on_phone`. The connection probe checks token + search and caches the answer for five minutes. This route calls `check(wait=False)`: stale/initial status returns immediately while a refresh runs in the background.

### `GET /api/credentials`

```json
{ "configured": true, "client_id_hint": "…3fc1", "initialized": false,
  "message": "Spotify rejected the Client ID/Secret (invalid_client). Check them in developer.spotify.com/dashboard." }
```

### `POST /api/credentials`

```json
{ "client_id": "<32 letters/digits>", "client_secret": "<32 letters/digits>" }
```

1. Format check → `400` "should be 32 letters and numbers".
2. **Real test with Spotify**: a token *and* one search, because spotDL's shared keys pass the token step and then get 429 on search. A `bad` result → `400` with the reason; `.env` is untouched. A `premium` result means valid keys with restricted access: they are saved, while `initialized` stays false until usable.
3. Save: keys replaced in place in `.env` (other lines kept, no quotes so `run.bat` can parse them, mode `0600`, atomic rename), `os.environ` updated, Spotify client reset. Search and new downloads use the keys immediately; no restart.
4. Returns the same shape as `GET`. The secret is never sent back.

### Local-only guard (all routes)

- Local hosts are `localhost`, `127.0.0.1`, `[::1]`, configured `SPOTDLR_HOSTS`, or recognized phone-access hosts on this computer.
- Remote phone requests normally require an allowed Wi-Fi/Tailscale host and a paired cookie or `?pair=` key; the initial key request redirects to `/` and sets the cookie. Selected manifest/icon/service-worker paths are public on allowed phone hosts.
- Phone writes to `/api/phone*` and `/api/credentials` are refused. `SPOTDLR_HOSTS` is a separate manual exception to the normal remote-pairing branch.
- Methods other than GET/HEAD/OPTIONS with an `Origin` whose netloc differs from `Host` receive `403 Cross-site request blocked`. See [[Phone Access]].

### `GET /api/library`

```json
{ "tracks": [ { "id": "3f2a…", "path": "JVKE Radio/d4vd - Sleep Well.m4a", "folder": "JVKE Radio",
                "title": "Sleep Well", "artists": ["d4vd"], "album": "Sleep Well", "album_artist": "d4vd",
                "year": "2023", "duration": 172.3, "added": 1767052800.0, "size": 2851626,
                "spotify_id": "7MGUDGEQpcqf29gWAmJyy4", "has_cover": true } ],
  "collections": [ { "key": "JVKE Radio", "name": "JVKE Radio", "kind": "playlist", "artist": null, "year": null,
                     "track_ids": ["…"], "cover_ids": ["…", "…", "…", "…"], "duration": 8580, "added": … } ] }
```

Tracks are newest first. Track fields also include `youtube_id`, `bitrate` (kbps), `lossless`, `genre_tag`, and resolved `genre`. The response includes `liked` IDs. Collections include `editable`; their `added` value also considers the list modification time for editable playlists. See [[Data and Storage]].

### `GET /api/stream/{track_id}`

| Request | Response |
|---|---|
| no `Range` | `200`, whole file, `Accept-Ranges: bytes` |
| `bytes=0-1023` | `206`, `Content-Range: bytes 0-1023/2851626` |
| `bytes=1000000-` | `206`, to the end |
| `bytes=-500` | `206`, last 500 bytes |
| start past the end | `416`, `Content-Range: bytes */2851626` |

### Organizing (organize.py)

| Route | Body / query | Does |
|---|---|---|
| `POST /api/likes/{track_id}` | `{liked}` | like or unlike; returns `{liked: [ids, newest first]}`. `GET /api/library` also returns `liked`. |
| `POST /api/playlists` | `{name, track_ids}` | new playlist you own: `MUSIC/<name>/playlist.m3u8` only. 409 if the name exists. |
| `POST /api/playlists/{key}/tracks` | `{track_ids, action: add\|remove}` | add (appended, no duplicates) or remove. **403** for downloaded playlists and albums. |
| `POST /api/playlists/{key}/tracks` (order) | `{track_ids, action: "order"}` | the same songs in a new order; **409** if the set differs (changed meanwhile). |
| `POST /api/playlists/{key}/rename` | `{name}` | renames the folder (m3u8 paths are relative, so they still resolve) → `{key}`. 409 if the name is taken, 403 unless it's yours. |
| `GET /api/duplicates` | | `{groups: [{key, title, artist, copies: [{id, path, folder, album, format, bitrate, lossless, size, duration, has_cover, liked, playlists, score, reasons, best?}], extra_bytes}], extra_bytes}` |
| `POST /api/duplicates/merge` | `{keep, remove: [ids]}` | m3u8s point at `keep`, likes/plays move, files (+ .lrc) to the Trash → `{removed, freed, playlists, trash}`. 400 if not copies of one song. |
| `POST /api/album-fix/scan` · `GET /api/album-fix` | | background YouTube Music lookup of songs whose album is a playlist's name → `{job: {status, done, total, results: [{id, title, artists, current, proposed: {album, album_artist, year, cover_url}, error?}]}, can_undo}` |
| `POST /api/album-fix/apply` · `POST /api/album-fix/undo` | `{items: [{id, album, album_artist, year, cover_url}]}` | writes album/album artist/year/cover (covers only from Google image hosts); saves the old tags to `tag-backups/` first; undo restores the latest batch. |
| `GET /api/phone` · `POST /api/phone` · `POST /api/phone/new-key` | `{enabled?, tailscale?, funnel?}` | phone access: `{enabled, running, address (the .local name on a Mac), url (with ?pair= key), ip_url (number-address fallback), error, tailscale: {enabled, funnel, address, url, error, status: {installed, running, name, ips, https, account}}}`. `enabled: false` pauses (key and choices kept). Changing it works from this computer only. |
| `GET /sw.js` | | the service worker (root scope): passes navigations through, shows a "can't reach your computer" page when offline. Registered only on `*.ts.net`. |
| `GET /api/schedules` · `POST /api/schedules` · `DELETE /api/schedules/{id}` | `{id?, device, device_name, what: {kind, key, label, href, ids}, time "HH:MM", days [0–6, Mon=0] \| date, shuffle, fade_in, enabled}` | scheduled plays (saving with a new time resets `last_run`) |
| `POST /api/schedules/{id}/fired` | `{occurrence: "2026-10-20T07:00"}` | `{play}`: true only for the first claim of that occurrence; a one-off turns itself off |
| `GET /api/loudness/{id}` · `POST /api/loudness/scan` · `GET /api/loudness` | | `{lufs, peak}` (measured now if needed, ~0.3–1 s, cached in `loudness.json`) · measure all in the background · `{running, done, total, measured}` |
| `DELETE /api/playlists/{key}` | | removes the list (and the folder if empty). Never deletes songs. 403 unless it's yours. |
| `POST /api/import?name=&album=` | raw file body | streams one file to `MUSIC/` (or `MUSIC/<album>/`); `(2)` suffix instead of overwriting; 415 for non-audio, 413 over 2 GB. Returns `{path}`. |
| `POST /api/import/album` | `{paths, album, artist, year?, cover?: data URL}` | writes album tags + cover into those files. Paths outside the library → 400. |
| `GET /api/devices` | | `{devices: [{name, path, free, total}]}`: Mac `/Volumes/*` (not the boot disk), Windows removable drives (`GetDriveTypeW == 2`), Linux `/media/$USER`. |
| `POST /api/export` | `{track_ids, device, subfolder, collection?, format: original\|mp3, bitrate}` | copy job; checks the device exists and has room first (507 if not). Files go to `<device>/<subfolder>/<collection>/NN Name.ext`, numbered so players keep the order. |
| `GET /api/export/{id}` | | `{status: copying\|done\|failed, done, total, skipped, current, error}` |

Collections now carry `editable: true` for playlists you made (always `kind: playlist`, listed even while empty).

### Add to Apple Music (apple_music.py, Mac only)

`/api/status/init` returns `apple_music: true` when the Music app exists (macOS). `POST /api/apple-music {track_ids, collection?, make_playlist}` starts a job; `GET /api/apple-music/{id}` → `{status: working|done|failed, step, done, total, added, skipped, converted, verified, playlist, error}`. **403** with System Settings → Privacy & Security → Automation instructions if macOS refuses AppleScript control (error -1743); **501** off a Mac.

### Blind listening test (abx.py)

| Route | Does |
|---|---|
| `GET /api/abx/{session_id}` | Current public session state; answers hidden until completion |
| `GET /api/abx/source/{track_id}` | `{lossless, codec, bitrate_kbps}`: lossless = .flac/.wav/.aiff or ALAC inside .m4a |
| `POST /api/abx` `{track_id, codec: aac\|mp3\|opus, bitrate: 64–320, start, length ≤60, trials: 10\|16\|20}` | makes the clips (≈1 s) in `DATA_DIR/.abx/<id>/`; returns `{id, x_urls[], …}`, never the answers |
| `GET /api/abx/{session_id}/{kind}/{token}` | WAV clips: `kind=clip`, `token=a` or `b`; or `kind=x` with a per-trial token. `Cache-Control: no-store`. |
| `POST /api/abx/{id}/answer` `{trial, guess}` | records a guess (409 if already answered); once all are in, the response has `result: {correct, p_value, answers, guesses}` |

Sessions expire after an hour; cleanup runs when another test is created. Session metadata is in memory and does not survive a restart.

### `GET /api/lyrics/{track_id}`

```json
{"lines": [{"t": 17.04, "text": "Sunday morning, rain is falling"}], "plain": null, "instrumental": false, "source": "lrclib"}
```
`lines` = time-synced (sorted by `t`, in seconds), else `plain` = text only, else `instrumental`, else all empty = no lyrics. `source`: `file` (the song's `.lrc` next to it) or `lrclib`. Lookup order: `.lrc` → cache (`DATA_DIR/.lyrics/<sha1>.json`, keyed by `song_key` + rounded duration; misses retried after 7 days) → LRCLIB `/api/get` (artist, title, duration ±2 s) → `/api/search` (artist ≥0.8 similar, title match, duration within 4 s; synced preferred). Same title cleanup and "Artist - Song" splitting as genres. **502** when LRCLIB was unreachable *and* nothing was found; that result isn't cached, so it's tried again next time. Plain `def` (blocking network call).

### `POST /api/lyrics/{track_id}`

No request body. Resolves a library track ID and saves available synced lyrics as UTF-8 `<audio basename>.lrc` beside its audio. Existing sidecars are preserved; no audio or tags are rewritten.

```json
{ "status": "saved" }
```

`status` is `saved`, `existing` (sidecar already present), or `unavailable` (no synced lyrics, including plain-only/instrumental results). Errors: `404` missing track/audio; `502` lyrics-service failure; `500` filesystem write failure. Failures use the usual readable `detail` field.

### `POST /api/lyrics/save-library` and `GET /api/lyrics/save-status`

POST takes no body. Starts one sequential background pass over a library snapshot; while a pass runs, another POST returns that pass's status. GET returns the current or last status, with zero counts before the first pass.

Example status during a pass:

```json
{
  "running": true,
  "done": 4,
  "total": 10,
  "saved": 1,
  "existing": 1,
  "unavailable": 1,
  "failed": 1,
  "error": "Example song: Couldn't reach the lyrics service"
}
```

`done` counts all processed songs; `error` is the last failure message or `null`. Per-song failures increment `failed` and processing continues. When complete, `running` is false. Progress is in server memory, separate from `/api/jobs`, and is lost on a server restart. Completed `.lrc` files persist; rerunning skips them. Closing Settings or the client does not cancel the pass while the server remains running. These static routes are declared before the dynamic `/{track_id}` route.

### `GET /api/art/{track_id}`

JPEG/PNG bytes, `Cache-Control: public, max-age=86400`. `404` if the file has no art.

### `GET /api/search?q=jvke`

```json
{ "tracks":    [ { "id", "name", "artists": [{"id","name"}], "album": {"id","name","image"},
                   "duration_ms", "explicit", "url", "local_id": "3f2a…" | null } ],
  "artists":   [ { "id", "name", "image", "followers", "genres", "url" } ],
  "albums":    [ { "id", "name", "artists", "image", "year", "album_type", "total_tracks", "url" } ],
  "playlists": [ { "id", "name", "owner", "image", "total_tracks", "description", "url" } ] }
```

Up to 10 of each. Errors: `400` missing credentials, `429` rate limit (with the wait), `502` anything else, all with a readable `detail`.

### `GET /api/spotify/{kind}/{id}`

- `album`: album fields + `tracks[]` + `label`
- `playlist`: playlist fields + `tracks[]`; the API implementation reads the initial response page without pagination, and the embed fallback reads its exposed list (typically first 100)
- `artist`: artist fields + `top_tracks[]` (currently empty in the implementation) + `albums[]` (up to 30 from the initial request; empty if that call fails)

When Spotify is unavailable, album/playlist details use the public embed; artist details still use the Spotify API path. Spotify API failures may include `404` with an explanation for inaccessible playlists.

### Download sources

`POST /api/download` picks a path from the query:

| Query | Job `source` | Engine |
|---|---|---|
| YouTube Music link (`watch?v=`, `browse/MPRE…`, `playlist?list=`) | `ytm` | yt-dlp, song by song |
| Spotify link, Spotify **not** connected | `spotify-embed` | embed song list → match each on YouTube Music → yt-dlp |
| Free text, Spotify not connected | `ytm` | top YouTube Music song |
| Spotify link or free text, Spotify connected | `spotify` | spotDL |

The YouTube Music and Spotify-embed paths reject whole-artist downloads (`400`). A source build with working Spotify passes a Spotify artist URL to spotDL. In the frozen installer, Spotify URLs always use `spotify-embed` and free text uses `ytm`, even when Spotify is connected. See [[Search and Downloads]].

### `POST /api/download`

```json
{ "query": "https://open.spotify.com/album/…",   // or free text (a track search)
  "type": "album",          // optional: taken from the URL
  "title": "Of June", "image": "https://i.scdn.co/…", "total": 7,   // optional hints for the UI and folder name
  "format": "m4a",          // m4a | mp3 | opus | flac | wav  ("aac" → m4a)
  "bitrate": "auto",        // auto | 128 | 192 | 256 | 320  (ignored for flac/wav)
  "includeLyrics": false }
```

→ the job (below). `400` if the query is empty, or for whole-artist downloads on the YouTube Music/embed paths. See "Download sources" for which engine runs.

### `GET /api/jobs`

```json
{ "jobs": [ { "id": "20261015171500-3", "query": "https://open.spotify.com/album/…", "kind": "album",
              "title": "Of June", "image": "…", "format": "m4a", "bitrate": "auto", "lyrics": false,
              "status": "downloading",       // queued | downloading | completed | failed | cancelled
              "done": 4, "total": 7, "message": "Downloaded \"Owl City - Hello Seattle\"",
              "error": null, "log": ["…last 12 lines of spotDL output…"], "created": …, "finished": null } ] }
```

Newest first. Jobs also carry `source` and `item_id`. The queue and history are in memory. YouTube jobs can finish as `completed` with individual failures recorded in `message`/`error`; inspect those fields too.
