# API Reference

Base: `http://localhost:8000`. No auth, local use only. Related: [[Backend]] · [[How It Works]]

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Page shell (`index.html`); the UI is `/static/app.js` + `/static/app.css` |
| GET | `/api/status/init` | Spotify credentials accepted? |
| GET | `/api/credentials` | Connection status + last 4 of the Client ID (never the secret) |
| POST | `/api/credentials` | Test new keys with Spotify; save to `.env` only if they work |
| GET | `/api/library` | Tracks + collections |
| GET | `/api/stream/{track_id}` | Audio, with Range |
| GET | `/api/art/{track_id}` | Embedded cover |
| GET | `/api/search?q=[&source=]` | Search: YouTube Music, or Spotify when connected |
| GET | `/api/ytm/{kind}/{id}` | YouTube Music `album` / `playlist` / `artist` |
| GET | `/api/spotify/{kind}/{id}` | `album` / `playlist` / `artist` details |
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

Real token check, cached 5 min.

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
2. **Real test with Spotify**: a token *and* one search, because spotDL's shared keys pass the token step and then get 429 on search. Failure → `400` with the reason; `.env` is untouched.
3. Save: keys replaced in place in `.env` (other lines kept, no quotes so `run.bat` can parse them, mode `0600`, atomic rename), `os.environ` updated, Spotify client reset. Search and new downloads use the keys immediately; no restart.
4. Returns the same shape as `GET`. The secret is never sent back.

### Local-only guard (all routes)

- `Host` must be `localhost`, `127.0.0.1` or `[::1]` (plus anything in `SPOTDLR_HOSTS`), else `403`. This blocks DNS rebinding.
- Non-GET requests with an `Origin` from another site → `403 Cross-site request blocked`.

### `GET /api/library`

```json
{ "tracks": [ { "id": "3f2a…", "path": "JVKE Radio/d4vd - Sleep Well.m4a", "folder": "JVKE Radio",
                "title": "Sleep Well", "artists": ["d4vd"], "album": "Sleep Well", "album_artist": "d4vd",
                "year": "2023", "duration": 172.3, "added": 1767052800.0, "size": 2851626,
                "spotify_id": "7MGUDGEQpcqf29gWAmJyy4", "has_cover": true } ],
  "collections": [ { "key": "JVKE Radio", "name": "JVKE Radio", "kind": "playlist", "artist": null, "year": null,
                     "track_ids": ["…"], "cover_ids": ["…", "…", "…", "…"], "duration": 8580, "added": … } ] }
```

Tracks are newest first. Collections are ordered by their newest track.

### `GET /api/stream/{track_id}`

| Request | Response |
|---|---|
| no `Range` | `200`, whole file, `Accept-Ranges: bytes` |
| `bytes=0-1023` | `206`, `Content-Range: bytes 0-1023/2851626` |
| `bytes=1000000-` | `206`, to the end |
| `bytes=-500` | `206`, last 500 bytes |
| start past the end | `416`, `Content-Range: bytes */2851626` |

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
- `playlist`: playlist fields + `tracks[]` (first 100)
- `artist`: artist fields + `top_tracks[]` + `albums[]` (each may be empty if Spotify retired that endpoint)

`404` with an explanation for Spotify-owned playlists that API apps can't read.

### Download sources

`POST /api/download` picks a path from the query:

| Query | Job `source` | Engine |
|---|---|---|
| YouTube Music link (`watch?v=`, `browse/MPRE…`, `playlist?list=`) | `ytm` | yt-dlp, song by song |
| Spotify link, Spotify **not** connected | `spotify-embed` | embed song list → match each on YouTube Music → yt-dlp |
| Free text, Spotify not connected | `ytm` | top YouTube Music song |
| Spotify link or free text, Spotify connected | `spotify` | spotDL |

Artist links can't be downloaded as a whole (`400`).

### `POST /api/download`

```json
{ "query": "https://open.spotify.com/album/…",   // or free text (a track search)
  "type": "album",          // optional: taken from the URL
  "title": "Of June", "image": "https://i.scdn.co/…", "total": 7,   // optional hints for the UI and folder name
  "format": "m4a",          // m4a | mp3 | opus | flac | wav  ("aac" → m4a)
  "bitrate": "auto",        // auto | 128 | 192 | 256 | 320  (ignored for flac/wav)
  "includeLyrics": false }
```

→ the job (below). `400` if the query is empty, or for an artist link. See "Download sources" for which engine runs.

### `GET /api/jobs`

```json
{ "jobs": [ { "id": "20261015171500-3", "query": "https://open.spotify.com/album/…", "kind": "album",
              "title": "Of June", "image": "…", "format": "m4a", "bitrate": "auto", "lyrics": false,
              "status": "downloading",       // queued | downloading | completed | failed | cancelled
              "done": 4, "total": 7, "message": "Downloaded \"Owl City - Hello Seattle\"",
              "error": null, "log": ["…last 12 lines of spotDL output…"], "created": …, "finished": null } ] }
```

Newest first.
