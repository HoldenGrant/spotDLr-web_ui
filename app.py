#!/usr/bin/env python
"""
spotDLr - FastAPI backend
A local music library + player, with Spotify search and spotDL downloads.

Routes that touch Spotify or the disk are plain `def` on purpose: FastAPI runs
those in a threadpool, so a slow call never blocks the event loop.
"""

import base64
import hashlib
import logging
import os
import re
import threading
import time
from urllib.parse import urlparse
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Load SPOTIPY_CLIENT_ID / SPOTIPY_CLIENT_SECRET from .env next to this file
from paths import APP_DIR, DATA_DIR, FROZEN, MUSIC_DIR  # noqa: E402  (see paths.py: source vs installed app)

BASE_DIR = APP_DIR
ENV_FILE = DATA_DIR / ".env"
load_dotenv(ENV_FILE)

import spotify_api  # noqa: E402  (reads env vars, so it comes after load_dotenv)
import spotify_embed  # noqa: E402
import ytmusic  # noqa: E402
from downloader import Downloader, write_playlist  # noqa: E402
from genres import Genres  # noqa: E402
import stats  # noqa: E402
from library import MEDIA_TYPES, Library  # noqa: E402
from lyrics import Lyrics, LyricsError  # noqa: E402
import organize  # noqa: E402
import version  # noqa: E402
import abx  # noqa: E402
import apple_music  # noqa: E402
from organize import Exporter, Likes, OrganizeError  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DOWNLOAD_DIR = MUSIC_DIR
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="spotDLr", version="2.0.0")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# Local-only guard. The API can write your Spotify secret to disk, so:
# - Host must be this machine (blocks DNS rebinding: evil.example resolving to 127.0.0.1)
# - writes must come from this page, not another site you happen to have open
ALLOWED_HOSTS = {"localhost", "127.0.0.1", "[::1]"} | {h.strip() for h in os.getenv("SPOTDLR_HOSTS", "").split(",") if h.strip()}


@app.middleware("http")
async def local_only(request: Request, call_next):
    host = request.headers.get("host", "")
    if host.rsplit(":", 1)[0] not in ALLOWED_HOSTS:
        return JSONResponse({"detail": f"Host {host!r} not allowed. Add it to SPOTDLR_HOSTS in .env to allow it."}, status_code=403)
    origin = request.headers.get("origin")
    if request.method not in ("GET", "HEAD", "OPTIONS") and origin and urlparse(origin).netloc != host:
        return JSONResponse({"detail": "Cross-site request blocked"}, status_code=403)
    response = await call_next(request)
    # The page and its scripts: always revalidate (a 304 when unchanged). Without this, Chrome guesses
    # freshness from Last-Modified and can keep running an old app.js for hours after an update.
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


library = Library(DOWNLOAD_DIR)
genres = Genres(DATA_DIR / ".genres.json", library.scan)  # fills in genres from Deezer in the background
plays = stats.Plays(DATA_DIR / "plays.jsonl")  # listening history for the Stats page
lyrics = Lyrics(DATA_DIR / ".lyrics")  # one cached lookup per song
likes = Likes(DATA_DIR / "likes.json")
exporter = Exporter(ytmusic.ffmpeg_path)  # "Send to device"
abx_tests = abx.ABX(DATA_DIR / ".abx", ytmusic.ffmpeg_path)  # blind listening tests
apple = apple_music.AppleMusic(ytmusic.ffmpeg_path)  # "Add to Apple Music" (Mac)
downloader = Downloader(
    DOWNLOAD_DIR,
    on_finished=lambda job: logger.info(f"Job {job['id']} {job['status']}: {job['title']} ({job['message']})"),
    owned_video_ids=lambda: {v: library.path_for(i) for v, i in library.youtube_index().items()},
    owned_spotify_ids=lambda: {v: library.path_for(i) for v, i in library.spotify_index().items()},
    save_lyrics=lyrics.save_lrc,  # "Include lyrics": an .lrc next to each new song
)


class CredentialsRequest(BaseModel):
    client_id: str
    client_secret: str


class LikeRequest(BaseModel):
    liked: bool


class PlaylistRequest(BaseModel):
    name: str
    track_ids: list[str] = []


class PlaylistTracksRequest(BaseModel):
    track_ids: list[str]
    action: str  # add | remove


class AlbumRequest(BaseModel):
    paths: list[str]               # as returned by /api/import
    album: str
    artist: str
    year: Optional[str] = None
    cover: Optional[str] = None    # data: URL of a JPEG/PNG


class ExportRequest(BaseModel):
    track_ids: list[str]
    device: str                    # a path from /api/devices (or one the user typed)
    subfolder: str = "Music"
    collection: Optional[str] = None
    format: str = "original"       # original | mp3
    bitrate: int = 256


class AppleMusicRequest(BaseModel):
    track_ids: list[str]
    collection: Optional[str] = None
    make_playlist: bool = False


class ABXRequest(BaseModel):
    track_id: str
    codec: str = "aac"
    bitrate: int = 256
    start: float = 60
    length: float = 30
    trials: int = 10


class ABXAnswer(BaseModel):
    trial: int
    guess: str  # A | B


class WindowRequest(BaseModel):
    id: str


class PlayRequest(BaseModel):
    track_id: str
    seconds: float


class DownloadRequest(BaseModel):
    query: str                      # Spotify or YouTube Music URL, or free text for a single track
    type: Optional[str] = None      # track | album | playlist | artist (detected from the URL when omitted)
    title: Optional[str] = None     # display name / folder name hint from the UI
    image: Optional[str] = None
    total: Optional[int] = None
    format: str = "m4a"
    bitrate: str = "auto"
    includeLyrics: bool = False


@app.get("/")
def root():
    return FileResponse(BASE_DIR / "index.html")


@app.get("/api/status/init")
def check_initialization():
    """Is Spotify usable? Search and downloads fall back to YouTube Music when it isn't."""
    ok, error = spotify_api.check()
    return {
        "initialized": ok,
        "message": "Spotify connected" if ok else error,
        "search_source": "spotify" if ok else "ytm",
        "setup_url": "https://developer.spotify.com/dashboard/",
        "version": version.VERSION,
        "build": version.source_build(),  # git describe when running from source, else None
        "apple_music": apple_music.available(),
    }


# ---------- Spotify credentials ----------

def _write_env(updates: dict):
    """Set keys in .env, keeping every other line (comments, SPOTIFY_MARKET, …). Owner-only permissions."""
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    out, seen = [], set()
    for line in lines:
        key = line.split("=", 1)[0].strip()
        if key in updates and not line.lstrip().startswith("#"):
            out.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            out.append(line)
    out += [f"{k}={v}" for k, v in updates.items() if k not in seen]
    tmp = ENV_FILE.with_name(".env.tmp")
    tmp.write_text("\n".join(out) + "\n")
    os.chmod(tmp, 0o600)
    tmp.replace(ENV_FILE)  # atomic: never a half-written .env


def _credentials_status():
    client_id = os.getenv("SPOTIPY_CLIENT_ID") or ""
    ok, error = spotify_api.check()
    return {
        "configured": bool(client_id and os.getenv("SPOTIPY_CLIENT_SECRET")),
        "client_id_hint": f"…{client_id[-4:]}" if client_id else None,  # the secret is never sent back
        "initialized": ok,
        "message": "Spotify connected" if ok else error,
    }


@app.get("/api/credentials")
def get_credentials():
    return _credentials_status()


@app.post("/api/credentials")
def set_credentials(request: CredentialsRequest):
    client_id, client_secret = request.client_id.strip(), request.client_secret.strip()
    for label, value in (("Client ID", client_id), ("Client Secret", client_secret)):
        if not re.fullmatch(r"[A-Za-z0-9]{32}", value):
            raise HTTPException(status_code=400, detail=f"{label} should be 32 letters and numbers. Copy it again from the Spotify dashboard.")
    status, error = spotify_api.test_credentials(client_id, client_secret)
    if status == "bad":
        raise HTTPException(status_code=400, detail=error)  # nothing saved
    # "premium": the keys are valid but the app owner needs Premium. Save them anyway, so the
    # app starts working by itself once Spotify enables the account (it can take a few hours)
    _write_env({"SPOTIPY_CLIENT_ID": client_id, "SPOTIPY_CLIENT_SECRET": client_secret})
    os.environ["SPOTIPY_CLIENT_ID"] = client_id          # live: search and new downloads use them now
    os.environ["SPOTIPY_CLIENT_SECRET"] = client_secret
    spotify_api.reset()
    logger.info(f"Spotify credentials updated (client id …{client_id[-4:]})")
    return _credentials_status()


# ---------- library ----------

@app.get("/api/library")
def get_library():
    snapshot = library.snapshot()
    for track in snapshot["tracks"]:
        track["genre"] = genres.genre_for(track)
    snapshot["liked"] = likes.ids()
    return snapshot


@app.post("/api/plays")
def record_play(request: PlayRequest):
    """The player reports how long a song actually played; it counts from 30 s (or half a short song)."""
    track = next((t for t in library.scan() if t["id"] == request.track_id), None)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return {"recorded": plays.record(dict(track, genre=genres.genre_for(track)), request.seconds)}


# ---------- organizing: likes, your playlists, adding files, sending to a device (organize.py) ----------

@app.exception_handler(OrganizeError)
def organize_error(request: Request, error: OrganizeError):
    return JSONResponse({"detail": str(error)}, status_code=error.status)


def _paths_for(track_ids):
    """Library tracks → absolute paths, in order; unknown ids are an error, not silently dropped."""
    paths = []
    for track_id in track_ids:
        path = library.path_for(track_id)
        if not path:
            raise OrganizeError("A song isn't in your library anymore. Refresh and try again.", 404)
        paths.append(path)
    return paths


@app.post("/api/likes/{track_id}")
def set_like(track_id: str, request: LikeRequest):
    if not library.path_for(track_id):
        raise HTTPException(status_code=404, detail="Track not found")
    likes.set(track_id, request.liked)
    return {"liked": likes.ids()}


@app.post("/api/playlists")
def create_playlist(request: PlaylistRequest):
    return {"key": organize.create_playlist(DOWNLOAD_DIR, request.name, _paths_for(request.track_ids))}


@app.post("/api/playlists/{key}/tracks")
def change_playlist(key: str, request: PlaylistTracksRequest):
    folder = organize.user_playlist(DOWNLOAD_DIR, key)
    current = next((c["track_ids"] for c in library.snapshot()["collections"] if c["key"] == key), [])
    if request.action == "add":
        ids = current + [i for i in request.track_ids if i not in current]  # no duplicates, appended at the end
    elif request.action == "remove":
        ids = [i for i in current if i not in set(request.track_ids)]
    else:
        raise HTTPException(status_code=400, detail="action must be add or remove")
    write_playlist(folder, _paths_for(ids))
    return {"count": len(ids)}


@app.delete("/api/playlists/{key}")
def delete_playlist(key: str):
    organize.delete_playlist(DOWNLOAD_DIR, key)
    return {"deleted": key}


@app.post("/api/import")
async def import_file(request: Request, name: str, album: str = ""):
    """Body = the raw file (no multipart, so no extra dependency). ?album= puts it in that album's folder."""
    path = await organize.import_stream(DOWNLOAD_DIR, name, album, request.stream())
    return {"path": path}


@app.post("/api/import/album")
def make_album(request: AlbumRequest):
    album, artist = request.album.strip(), request.artist.strip()
    if not album or not artist:
        raise HTTPException(status_code=400, detail="An album needs a name and an artist")
    cover = None
    if request.cover:
        header, _, data = request.cover.partition(",")
        mime = header.removeprefix("data:").split(";")[0]
        if mime not in ("image/jpeg", "image/png"):
            raise HTTPException(status_code=415, detail="The cover must be a JPEG or PNG image")
        cover = (base64.b64decode(data), mime)
        if len(cover[0]) > 15_000_000:
            raise HTTPException(status_code=413, detail="That cover image is over 15 MB")
    tagged, untaggable = 0, []
    for rel in request.paths:
        path = (DOWNLOAD_DIR / rel).resolve()
        if DOWNLOAD_DIR.resolve() not in path.parents or not path.is_file():
            raise HTTPException(status_code=400, detail=f"Not a file in your library: {rel}")
        if organize.tag_album(path, album, artist, request.year, cover):
            tagged += 1
        else:
            untaggable.append(path.name)
    return {"tagged": tagged, "untaggable": untaggable}


@app.get("/api/devices")
def devices():
    return {"devices": organize.list_devices()}


@app.post("/api/export")
def export(request: ExportRequest):
    tracks = [library._tracks_by_id.get(i) for i in request.track_ids]
    items = [(path, (track or {}).get("duration") or 0) for path, track in zip(_paths_for(request.track_ids), tracks)]
    if not items:
        raise HTTPException(status_code=400, detail="No songs to send")
    return exporter.start(items, request.device, request.subfolder, request.collection, request.format, request.bitrate)


@app.get("/api/export/{job_id}")
def export_status(job_id: str):
    job = exporter.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="No such copy job")
    return job


# ---------- Add to Apple Music (apple_music.py) ----------

@app.exception_handler(apple_music.AppleMusicError)
def apple_music_error(request: Request, error: apple_music.AppleMusicError):
    return JSONResponse({"detail": str(error)}, status_code=error.status)


@app.post("/api/apple-music")
def add_to_apple_music(request: AppleMusicRequest):
    tracks = []
    for track_id, path in zip(request.track_ids, _paths_for(request.track_ids)):
        t = library._tracks_by_id[track_id]
        tracks.append({"path": path, "title": t["title"], "album": t["album"], "artists": t["artists"]})
    return apple.start(tracks, request.collection, request.make_playlist)


@app.get("/api/apple-music/{job_id}")
def apple_music_status(job_id: str):
    job = apple.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="No such job")
    return job


# ---------- blind listening test (abx.py) ----------

@app.exception_handler(abx.ABXError)
def abx_error(request: Request, error: abx.ABXError):
    return JSONResponse({"detail": str(error)}, status_code=error.status)


@app.get("/api/abx/source/{track_id}")
def abx_source(track_id: str):
    path = library.path_for(track_id)
    if not path:
        raise HTTPException(status_code=404, detail="Track not found")
    return abx.describe_source(path)


@app.post("/api/abx")
def abx_create(request: ABXRequest):
    path = library.path_for(request.track_id)
    track = library._tracks_by_id.get(request.track_id)
    if not path or not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return abx_tests.create(path, track["duration"], request.codec, request.bitrate, request.start, request.length, request.trials)


@app.get("/api/abx/{session_id}")
def abx_status(session_id: str):
    return abx_tests.public(abx_tests.get(session_id))


@app.get("/api/abx/{session_id}/{kind}/{token}")
def abx_clip(session_id: str, kind: str, token: str):
    """kind=clip: token a|b. kind=x: a per-trial random token. no-store, so nothing is learned from the cache."""
    path = abx_tests.clip_path(session_id, token if kind in ("clip", "x") else "")
    return FileResponse(path, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@app.post("/api/abx/{session_id}/answer")
def abx_answer(session_id: str, request: ABXAnswer):
    return abx_tests.answer(session_id, request.trial, request.guess)


# ---------- open windows (the desktop app stops when the last one closes) ----------
# Each page checks in every 15 s and says goodbye on close. desktop.py reads `windows` to decide when to
# stop: watching Edge's process doesn't work, because Edge hands the window to another process and exits.
windows = {}            # window id -> last check-in (time.time())
windows_lock = threading.Lock()
WINDOW_TIMEOUT = 180    # no check-in for this long = gone without a goodbye (crash, sleep); a hidden
                        # window's timers can slow to once a minute, so this stays well above that


@app.post("/api/window/alive")
def window_alive(request: WindowRequest):
    with windows_lock:
        windows[request.id[:64]] = time.time()
    return {"ok": True}


@app.post("/api/window/bye")
def window_bye(request: WindowRequest):
    with windows_lock:
        windows.pop(request.id[:64], None)
    return {"ok": True}


def open_windows():
    """How many windows have checked in recently (drops ones that went quiet)."""
    now = time.time()
    with windows_lock:
        for window_id in [w for w, seen in windows.items() if now - seen > WINDOW_TIMEOUT]:
            del windows[window_id]
        return len(windows)


@app.get("/api/stats")
def get_stats(days: int = 30):
    if days not in (0, 7, 30, 90, 365):
        raise HTTPException(status_code=400, detail="days must be 7, 30, 90, 365 or 0 (all time)")
    tracks = library.scan()
    return {
        "library": stats.library_stats(tracks, genres.genre_for),
        "listening": stats.listening_stats(plays.load(), days, {t["id"] for t in tracks}),
    }


@app.get("/api/genres/status")
def genre_status():
    return genres.status()


@app.get("/api/stream/{track_id}")
def stream(track_id: str, request: Request):
    path = library.path_for(track_id)
    if not path or not path.is_file():
        raise HTTPException(status_code=404, detail="Track not found")
    media_type = MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    return _ranged_file(path, media_type, request.headers.get("range"))


def _ranged_file(path: Path, media_type: str, range_header: Optional[str]):
    """Answer `Range: bytes=…` with 206 Partial Content.

    Starlette 0.27's FileResponse ignores Range and always sends the whole file,
    and Safari won't seek <audio> without real 206 responses.
    """
    size = path.stat().st_size
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", (range_header or "").strip())
    if not match or match.groups() == ("", ""):
        return FileResponse(path, media_type=media_type, headers={"Accept-Ranges": "bytes"})
    first, last = match.groups()
    if first == "":  # "bytes=-500" means the last 500 bytes
        start, end = max(size - int(last), 0), size - 1
    else:
        start, end = int(first), min(int(last) if last else size - 1, size - 1)
    if start > end or start >= size:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})

    def chunks():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                data = f.read(min(64 * 1024, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {"Content-Range": f"bytes {start}-{end}/{size}", "Accept-Ranges": "bytes", "Content-Length": str(end - start + 1)}
    return StreamingResponse(chunks(), status_code=206, media_type=media_type, headers=headers)


@app.get("/api/lyrics/{track_id}")
def track_lyrics(track_id: str):
    """{lines: [{t, text}] | null, plain: str | null, instrumental, source}. Plain def: LRCLIB is a blocking call."""
    path = library.path_for(track_id)
    track = library._tracks_by_id.get(track_id)
    if not path or not track:
        raise HTTPException(status_code=404, detail="Track not found")
    try:
        return lyrics.for_track(track, path)
    except LyricsError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/art/{track_id}")
def art(track_id: str):
    cover = library.cover(track_id)
    if not cover:
        raise HTTPException(status_code=404, detail="No cover art")
    data, mime = cover
    return Response(content=data, media_type=mime, headers={"Cache-Control": "public, max-age=86400"})


# ---------- remote cover images (proxied + cached) ----------

# Google's image host rate-limits bursts (HTTP 429): a search page asks for 30-40 covers at once.
# Fetch each cover once, at most 4 at a time, keep it on disk, and serve it from here.
IMAGE_CACHE = DATA_DIR / ".imgcache"
IMAGE_HOSTS = ("yt3.googleusercontent.com", "lh3.googleusercontent.com", "yt3.ggpht.com", "i.ytimg.com", "i.scdn.co",
               "mosaic.scdn.co", "image-cdn-ak.spotifycdn.com", "image-cdn-fa.spotifycdn.com")
_image_slots = threading.BoundedSemaphore(4)


@app.get("/api/img")
def remote_image(u: str):
    parsed = urlparse(u)
    if parsed.scheme != "https" or parsed.hostname not in IMAGE_HOSTS:
        raise HTTPException(status_code=400, detail="Image host not allowed")  # not an open proxy
    key = hashlib.sha1(u.encode()).hexdigest()
    cached = IMAGE_CACHE / key
    headers = {"Cache-Control": "public, max-age=604800"}
    if cached.exists():
        return FileResponse(cached, media_type=(IMAGE_CACHE / f"{key}.type").read_text() if (IMAGE_CACHE / f"{key}.type").exists() else "image/jpeg", headers=headers)
    with _image_slots:
        for attempt in range(3):
            try:
                response = requests.get(u, timeout=15)
            except requests.RequestException:
                response = None
            if response is not None and response.status_code == 429 and attempt < 2:
                time.sleep(1.5 * (attempt + 1))  # rate-limited: back off and retry
                continue
            break
    if response is None or not response.ok or not response.headers.get("content-type", "").startswith("image/"):
        raise HTTPException(status_code=502, detail="Couldn't fetch image")
    IMAGE_CACHE.mkdir(exist_ok=True)
    tmp = IMAGE_CACHE / f"{key}.tmp"
    tmp.write_bytes(response.content)
    tmp.replace(cached)
    (IMAGE_CACHE / f"{key}.type").write_text(response.headers["content-type"].split(";")[0])
    return Response(content=response.content, media_type=response.headers["content-type"].split(";")[0], headers=headers)


# ---------- Spotify ----------

def _spotify(fn, *args):
    try:
        return fn(*args)
    except spotify_api.SpotifyError as e:
        raise HTTPException(status_code=e.status, detail=str(e))


@app.get("/api/search")
def search(q: str, source: Optional[str] = None):
    """Spotify when it's connected (or asked for), otherwise YouTube Music."""
    if not q.strip():
        return {"tracks": [], "artists": [], "albums": [], "playlists": []}
    if source != "ytm" and (source == "spotify" or spotify_api.check()[0]):
        return dict(_spotify(spotify_api.search, q.strip(), library.spotify_index()), source="spotify")
    return _ytmusic(ytmusic.search, q.strip())


def _ytmusic(fn, *args):
    try:
        return fn(*args)
    except ytmusic.YTMusicError as e:
        raise HTTPException(status_code=e.status, detail=str(e))


@app.get("/api/ytm/{kind}/{item_id}")
def ytm_item(kind: str, item_id: str):
    handlers = {"album": ytmusic.album, "playlist": ytmusic.playlist, "artist": ytmusic.artist}
    if kind not in handlers:
        raise HTTPException(status_code=404, detail="Unknown type")
    return _ytmusic(handlers[kind], item_id)


@app.get("/api/spotify/{kind}/{spotify_id}")
def spotify_item(kind: str, spotify_id: str):
    handlers = {"album": spotify_api.album, "playlist": spotify_api.playlist, "artist": spotify_api.artist}
    if kind not in handlers:
        raise HTTPException(status_code=404, detail="Unknown type")
    if not spotify_api.check()[0] and kind in ("album", "playlist"):
        # No API (e.g. Premium rule): the public embed still lists the songs
        try:
            return spotify_embed.item(kind, spotify_id)
        except spotify_embed.EmbedError as e:
            raise HTTPException(status_code=502, detail=str(e))
    return _spotify(handlers[kind], spotify_id, library.spotify_index())


# ---------- downloads ----------

@app.post("/api/download")
def download(request: DownloadRequest):
    query = request.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    kind, title, image, total = request.type, request.title, request.image, request.total
    common = dict(format=request.format, bitrate=request.bitrate, lyrics=request.includeLyrics)

    # YouTube Music link, or free text while Spotify is unavailable → yt-dlp path (no Spotify needed)
    ytm = _ytmusic(ytmusic.parse_url, query)
    spotify_ok, spotify_error = spotify_api.check()
    # Installed app (FROZEN): spotDL can't run there (`sys.executable -m spotdl` would start spotDLr.exe
    # again), so everything goes through YouTube Music even when Spotify keys work
    use_ytm_only = FROZEN or not spotify_ok
    if not ytm and not spotify_api.parse_url(query) and use_ytm_only:
        songs = _ytmusic(ytmusic.search, query)["tracks"]
        if not songs:
            raise HTTPException(status_code=404, detail=f"Nothing found on YouTube Music for {query!r}")
        ytm = ("track", songs[0]["id"])
    if ytm:
        kind, item_id = ytm
        if kind == "artist":
            raise HTTPException(status_code=400, detail="Artists can't be downloaded as a whole. Open the artist and download albums or songs.")
        if not title:
            title, image, total = ytmusic.describe(kind, item_id)
        return downloader.submit(query=ytmusic.url_for(kind, item_id), kind=kind, source="ytm", item_id=item_id,
                                 title=title, image=image, total=1 if kind == "track" else total, **common)

    # Spotify link without a working API: read the song list from Spotify's public embed,
    # then match and download each song from YouTube Music
    parsed = spotify_api.parse_url(query)
    if parsed and use_ytm_only:
        kind, item_id = parsed
        if kind == "artist":
            raise HTTPException(status_code=400, detail="Artists can't be downloaded as a whole. Open an album or song instead.")
        if not title:
            try:
                info = spotify_embed.item(kind, item_id)
                title = info["name"] if kind != "track" else f"{', '.join(a['name'] for a in info['artists'])} - {info['name']}"
                image, total = info.get("image"), info.get("total_tracks")
            except spotify_embed.EmbedError as e:
                raise HTTPException(status_code=502, detail=str(e))
        return downloader.submit(query=spotify_api.url_for(kind, item_id), kind=kind, source="spotify-embed", item_id=item_id,
                                 title=title, image=image, total=1 if kind == "track" else total, **common)

    # Spotify link or free text with working Spotify keys → spotDL
    if not spotify_ok:
        raise HTTPException(status_code=400, detail=f"Free-text downloads need Spotify. {spotify_error}")
    if parsed:
        kind = parsed[0]
        query = spotify_api.url_for(*parsed)  # drop ?si= tracking params
        if not title:
            title, image, total = spotify_api.describe(*parsed)
    kind = kind or "track"
    return downloader.submit(query=query, kind=kind, title=title, image=image,
                             total=1 if kind == "track" else total, **common)


@app.get("/api/jobs")
def jobs():
    return {"jobs": downloader.list()}


@app.delete("/api/jobs/{job_id}")
def cancel_job(job_id: str):
    if not downloader.cancel(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
