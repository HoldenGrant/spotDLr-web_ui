"""
YouTube Music: search, album/artist/playlist pages, and downloads. No keys, no account.

Responses use the same shape as spotify_api.py (plus "source": "ytm"), so the
frontend renders both with the same code.

Downloads go through yt-dlp + mutagen directly instead of spotDL, because spotDL
looks every YouTube link up on Spotify first (Song.from_search_term), which is
exactly what Spotify's 2026 rules block.
"""

import base64
import re
import shutil
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from ytmusicapi import YTMusic

_yt = None
_yt_lock = threading.Lock()

WATCH_URL = "https://music.youtube.com/watch?v={}"
YTM_URL = re.compile(
    r"music\.youtube\.com/(?:"
    r"watch\?(?:.*&)?v=(?P<video>[\w-]{11})"
    r"|browse/(?P<album>MPRE[\w-]+)"
    r"|playlist\?(?:.*&)?list=(?P<list>[\w-]+)"
    r"|channel/(?P<artist>UC[\w-]+))"
)


class YTMusicError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def _client():
    global _yt
    with _yt_lock:
        if _yt is None:
            _yt = YTMusic()  # anonymous: search and browse need no login
        return _yt


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        raise YTMusicError(f"YouTube Music request failed: {e}")


# ---------- URLs ----------

def parse_url(text):
    """('track'|'album'|'playlist'|'artist', id) for a YouTube Music link, else None."""
    match = YTM_URL.search(text or "")
    if not match:
        return None
    if match["video"]:
        return "track", match["video"]
    if match["album"]:
        return "album", match["album"]
    if match["artist"]:
        return "artist", match["artist"]
    list_id = match["list"]
    # OLAK5uy_ lists are an album's audio playlist; resolve to the album's browse id
    if list_id.startswith("OLAK5uy_"):
        browse_id = _call(_client().get_album_browse_id, list_id)
        return ("album", browse_id) if browse_id else ("playlist", list_id)
    return "playlist", list_id


def url_for(kind, item_id):
    return {
        "track": WATCH_URL.format(item_id),
        "album": f"https://music.youtube.com/browse/{item_id}",
        "playlist": f"https://music.youtube.com/playlist?list={item_id}",
        "artist": f"https://music.youtube.com/channel/{item_id}",
    }[kind]


# ---------- trimming ----------

def image(thumbnails, size=544):
    """Biggest thumbnail, re-requested at `size` px (Google image URLs take a size suffix)."""
    thumbnails = [t for t in (thumbnails or []) if t and t.get("url")]
    if not thumbnails:
        return None
    url = thumbnails[-1]["url"]
    if "googleusercontent.com" in url or "ggpht.com" in url:  # artist photos come from yt3.ggpht.com
        url = re.sub(r"=[^=/]*$", f"=w{size}-h{size}-l90-rj", url)
    return url


def _artists(items):
    return [{"id": a.get("id"), "name": a.get("name")} for a in (items or []) if a and a.get("name")]


def _seconds(value):
    if isinstance(value, (int, float)):
        return value
    parts = [int(p) for p in str(value or "0").split(":") if p.isdigit()]
    total = 0
    for p in parts:
        total = total * 60 + p
    return total


def _track(t, album=None):
    if not t or not t.get("videoId") or t.get("isAvailable") is False:
        return None
    alb = t.get("album") if isinstance(t.get("album"), dict) else {}
    album = album or {}
    return {
        "source": "ytm",
        "id": t["videoId"],
        "name": t.get("title"),
        "artists": _artists(t.get("artists")) or album.get("artists") or [],
        "album": {
            "id": alb.get("id") or album.get("id"),
            "name": alb.get("name") or album.get("name") or (t.get("album") if isinstance(t.get("album"), str) else None),
            "image": album.get("image") or image(t.get("thumbnails") or t.get("thumbnail"), 120),
        },
        "duration_ms": int(_seconds(t.get("duration_seconds") or t.get("duration") or t.get("length")) * 1000),
        "explicit": bool(t.get("isExplicit")),
        "url": WATCH_URL.format(t["videoId"]),
        "track_number": t.get("trackNumber"),
    }


def _album_card(a):
    browse_id = a.get("browseId")
    if not browse_id:
        return None
    return {
        "source": "ytm",
        "id": browse_id,
        "name": a.get("title"),
        "artists": _artists(a.get("artists")),
        "image": image(a.get("thumbnails"), 300),
        "year": a.get("year"),
        "album_type": (a.get("type") or "album").lower(),
        "total_tracks": None,
        "url": url_for("album", browse_id),
    }


def _artist_card(a):
    artist_id = a.get("browseId") or ((a.get("artists") or [{}])[0] or {}).get("id")
    name = a.get("artist") or ((a.get("artists") or [{}])[0] or {}).get("name") or a.get("title")
    if not artist_id or not name:
        return None
    return {"source": "ytm", "id": artist_id, "name": name, "image": image(a.get("thumbnails"), 300),
            "followers": None, "genres": [], "url": url_for("artist", artist_id)}


def _playlist_card(p):
    pid = p.get("browseId") or p.get("playlistId")
    if not pid:
        return None
    pid = pid[2:] if pid.startswith("VL") else pid
    author = p.get("author")
    return {"source": "ytm", "id": pid, "name": p.get("title"),
            "owner": author.get("name") if isinstance(author, dict) else author,
            "image": image(p.get("thumbnails"), 300), "total_tracks": p.get("itemCount"),
            "description": "", "url": url_for("playlist", pid)}


def _clean(items):
    return [i for i in items if i]


# ---------- pages ----------

def search(query):
    yt = _client()
    # Four filtered searches in parallel (~0.5 s each) beat one mixed search that omits playlists
    jobs = {"songs": 10, "artists": 6, "albums": 10, "playlists": 10}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {f: pool.submit(_call, yt.search, query, filter=f, limit=n) for f, n in jobs.items()}
        results = {f: (fut.result() or []) for f, fut in futures.items()}
    return {
        "source": "ytm",
        "tracks": _clean(_track(t) for t in results["songs"])[:10],
        "artists": _clean(_artist_card(a) for a in results["artists"])[:6],
        "albums": _clean(_album_card(a) for a in results["albums"])[:10],
        "playlists": _clean(_playlist_card(p) for p in results["playlists"])[:10],
    }


def album(browse_id):
    a = _call(_client().get_album, browse_id)
    info = {
        "source": "ytm", "id": browse_id, "name": a.get("title"), "artists": _artists(a.get("artists")),
        "image": image(a.get("thumbnails")), "year": a.get("year"),
        "album_type": (a.get("type") or "album").lower(), "total_tracks": a.get("trackCount"),
        "url": url_for("album", browse_id),
    }
    context = {"id": browse_id, "name": info["name"], "image": info["image"], "artists": info["artists"]}
    info["tracks"] = _clean(_track(t, album=context) for t in a.get("tracks") or [])
    return info


def playlist(playlist_id):
    p = _call(_client().get_playlist, playlist_id, limit=300)
    author = p.get("author")
    return {
        "source": "ytm", "id": playlist_id, "name": p.get("title"),
        "owner": author.get("name") if isinstance(author, dict) else author,
        "image": image(p.get("thumbnails")), "total_tracks": p.get("trackCount"),
        "description": p.get("description") or "", "url": url_for("playlist", playlist_id),
        "tracks": _clean(_track(t) for t in p.get("tracks") or []),
    }


def artist(channel_id):
    a = _call(_client().get_artist, channel_id)
    albums = [_album_card(x) for x in ((a.get("albums") or {}).get("results") or [])]
    singles = [_album_card(dict(x, type=x.get("type") or "Single")) for x in ((a.get("singles") or {}).get("results") or [])]
    return {
        "source": "ytm", "id": channel_id, "name": a.get("name"),
        "image": image(a.get("thumbnails")), "followers": None, "subscribers": a.get("subscribers"),
        "genres": [], "url": url_for("artist", channel_id),
        "top_tracks": _clean(_track(t) for t in ((a.get("songs") or {}).get("results") or [])),
        "albums": _clean(albums + singles),
    }


def describe(kind, item_id):
    """(title, image, total tracks) for a pasted link, best effort."""
    try:
        if kind == "album":
            a = album(item_id)
            return a["name"], a["image"], a["total_tracks"]
        if kind == "playlist":
            p = playlist(item_id)
            return p["name"], p["image"], p["total_tracks"]
        if kind == "track":
            m = track_meta(item_id)
            return f"{', '.join(m['artists'])} - {m['title']}", m["cover_url"], 1
    except YTMusicError:
        pass
    return None, None, None


# ---------- downloads ----------

def track_meta(video_id):
    """Tag data for one song: title/artists/album from the watch queue, year and track number from its album."""
    t = _call(_client().get_watch_playlist, video_id, limit=1)["tracks"][0]
    meta = {
        "video_id": video_id, "title": t.get("title"),
        "artists": [a["name"] for a in t.get("artists") or [] if a.get("name")] or ["Unknown artist"],
        "album": (t.get("album") or {}).get("name") or t.get("title"),
        "album_artist": None, "year": t.get("year"), "track_number": None, "track_total": None,
        "cover_url": image(t.get("thumbnail")),
    }
    album_id = (t.get("album") or {}).get("id")
    if album_id:
        try:
            a = _client().get_album(album_id)
            meta["album_artist"] = ((a.get("artists") or [{}])[0] or {}).get("name")
            meta["year"] = meta["year"] or a.get("year")
            meta["track_total"] = a.get("trackCount")
            meta["cover_url"] = image(a.get("thumbnails")) or meta["cover_url"]
            # Album lists can use a different video id for the same song (audio vs music video), so fall back to the title
            tracks = a.get("tracks") or []
            match = next((x for x in tracks if x.get("videoId") == video_id), None) or \
                next((x for x in tracks if (x.get("title") or "").lower() == (meta["title"] or "").lower()), None)
            if match:
                meta["track_number"] = match.get("trackNumber")
        except Exception:
            pass  # tags without year/track number are still fine
    meta["album_artist"] = meta["album_artist"] or meta["artists"][0]
    return meta


def resolve(kind, item_id):
    """(folder title or None, [tag data per song]) for a download job."""
    if kind == "track":
        return None, [track_meta(item_id)]
    if kind == "album":
        a = album(item_id)
        artist_names = [x["name"] for x in a["artists"]]
        metas = [{
            "video_id": t["id"], "title": t["name"],
            "artists": [x["name"] for x in t["artists"]] or artist_names or ["Unknown artist"],
            "album": a["name"], "album_artist": (artist_names or [None])[0], "year": a["year"],
            "track_number": t.get("track_number"), "track_total": a["total_tracks"], "cover_url": a["image"],
        } for t in a["tracks"]]
        return a["name"], metas
    if kind == "playlist":
        p = playlist(item_id)
        metas = [{
            "video_id": t["id"], "title": t["name"],
            "artists": [x["name"] for x in t["artists"]] or ["Unknown artist"],
            "album": t["album"]["name"] or t["name"], "album_artist": None, "year": None,
            "track_number": None, "track_total": None,
            "cover_url": re.sub(r"=w120-h120-", "=w544-h544-", t["album"]["image"] or ""),
        } for t in p["tracks"]]
        return p["name"], metas
    raise YTMusicError("Artists can't be downloaded as a whole. Open the artist and download albums or songs.", 400)


# ---------- Spotify link → YouTube Music songs ----------

def _norm(text):
    text = re.sub(r"\s*[([](feat|ft|with)\b[^)\]]*[)\]]", "", (text or "").lower())
    return re.sub(r"[^\w]+", "", text)


def match_song(name, artists, duration_ms=0):
    """Best YouTube Music song for a Spotify track, or None.

    Score = title similarity (55%) + main-artist match (45%), minus 0.3 if the length is more
    than 10 s off: that is what keeps remixes, live and sped-up versions out.
    """
    from difflib import SequenceMatcher

    main_artist = artists[0] if artists else ""
    results = _call(_client().search, f"{main_artist} {name}", filter="songs", limit=5) or []
    best, best_score = None, 0.0
    for r in results:
        if not r.get("videoId"):
            continue
        title_score = SequenceMatcher(None, _norm(name), _norm(r.get("title"))).ratio()
        found = [_norm(a.get("name")) for a in r.get("artists") or [] if a.get("name")]
        artist_score = 1.0 if _norm(main_artist) in found else max((SequenceMatcher(None, _norm(main_artist), f).ratio() for f in found), default=0)
        seconds = r.get("duration_seconds")
        length_ok = not duration_ms or not seconds or abs(seconds - duration_ms / 1000) <= 10
        score = 0.55 * title_score + 0.45 * artist_score - (0 if length_ok else 0.3)
        if score > best_score:
            best, best_score = r, score
    return best if best_score >= 0.7 else None


def spotify_items(kind, spotify_id):
    """(title, [song item]) for a Spotify link, read from the public embed (no API keys).

    Each item matches itself on YouTube Music lazily (item["resolve"]()), so a 100-song
    playlist starts downloading right away instead of matching everything first.
    """
    import spotify_embed

    try:
        info = spotify_embed.item(kind, spotify_id)
    except spotify_embed.EmbedError as e:
        raise YTMusicError(str(e), 502)
    is_album = kind == "album"
    album_artists = [a["name"] for a in info.get("artists") or []]

    def make(index, track):
        names = [a["name"] for a in track["artists"]]

        def resolve():
            found = match_song(track["name"], names, track["duration_ms"])
            if not found:
                raise YTMusicError("No matching song on YouTube Music")
            return {
                "video_id": found["videoId"], "spotify_id": track["id"],
                "title": track["name"], "artists": names or ["Unknown artist"],
                "album": info["name"] if is_album else ((found.get("album") or {}).get("name") or track["name"]),
                "album_artist": (album_artists or names or [None])[0] if is_album else None,
                "year": info.get("year") if kind in ("album", "track") else found.get("year"),
                "track_number": index + 1 if is_album else None,
                "track_total": info["total_tracks"] if is_album else None,
                "cover_url": info.get("image") if is_album or kind == "track" else image(found.get("thumbnails")),
            }

        return {"name": f"{', '.join(names)} - {track['name']}", "spotify_id": track["id"], "resolve": resolve}

    return info["name"] if kind != "track" else None, [make(i, t) for i, t in enumerate(info["tracks"])], info


def js_runtime():
    """yt-dlp needs a JavaScript runtime to unlock YouTube audio links (since late 2025)."""
    for name in ("deno", "node", "bun"):
        path = shutil.which(name)
        if path:
            return name, path
    return None, None


def ffmpeg_path():
    found = shutil.which("ffmpeg")
    if found:
        return found
    # spotDL's own copy (spotdl --download-ffmpeg); it's ffmpeg.exe on Windows
    for name in ("ffmpeg", "ffmpeg.exe"):
        spotdl_copy = Path.home() / ".spotdl" / name
        if spotdl_copy.exists():
            return str(spotdl_copy)
    return None


def safe_filename(name):
    cleaned = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "", name).strip(" .")
    return cleaned[:180] or "Unknown"


def download_track(meta, output_dir: Path, fmt="m4a", bitrate="auto"):
    """Download one song and tag it. Returns (path, already_existed)."""
    import yt_dlp

    ext = {"m4a": "m4a", "mp3": "mp3", "opus": "opus", "flac": "flac", "wav": "wav"}.get(fmt, "m4a")
    target = output_dir / f"{safe_filename(', '.join(meta['artists']) + ' - ' + meta['title'])}.{ext}"
    if target.exists():
        return target, True

    runtime, runtime_path = js_runtime()
    if not runtime:
        how = "winget install OpenJS.NodeJS" if sys.platform == "win32" else "brew install node"
        raise YTMusicError(f"Downloading from YouTube needs Node.js or Deno installed ({how}), then restart spotDLr.", 500)

    with tempfile.TemporaryDirectory() as tmp:
        options = {
            "format": "bestaudio[ext=m4a]/bestaudio" if ext == "m4a" else "bestaudio",
            "outtmpl": f"{tmp}/audio.%(ext)s",
            "quiet": True, "no_warnings": True, "noprogress": True,
            "socket_timeout": 30, "retries": 3,
            "js_runtimes": {runtime: {"path": runtime_path}},
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": ext,
                # None = keep the source stream as-is when it's already the right codec (AAC → m4a is a copy)
                "preferredquality": None if bitrate in (None, "", "auto") or ext in ("flac", "wav") else str(bitrate),
            }],
        }
        ffmpeg = ffmpeg_path()
        if ffmpeg:
            options["ffmpeg_location"] = ffmpeg
        # YouTube sometimes answers 403 to an audio link it just handed out (seen most on official
        # music videos). yt-dlp's own retries reuse that link, so retry with a fresh extraction,
        # and on the last try accept any audio format.
        for attempt in range(3):
            try:
                if attempt == 2:
                    options["format"] = "bestaudio/best"
                with yt_dlp.YoutubeDL(options) as ydl:
                    ydl.download([WATCH_URL.format(meta["video_id"])])
                break
            except yt_dlp.utils.DownloadError as e:
                if "403" not in str(e) or attempt == 2:
                    raise
                for leftover in Path(tmp).glob("audio.*"):
                    leftover.unlink()
                time.sleep(2 * (attempt + 1))
        produced = next(Path(tmp).glob(f"audio.{ext}"), None) or next(Path(tmp).glob("audio.*"), None)
        if not produced:
            raise YTMusicError("yt-dlp finished without producing an audio file.")
        cover = _fetch_cover(meta.get("cover_url"))
        tag_file(produced, meta, cover)
        output_dir.mkdir(parents=True, exist_ok=True)
        shutil.move(str(produced), target)
    return target, False


def _fetch_cover(url):
    if not url:
        return None
    try:
        response = requests.get(url, timeout=15)
        if response.ok and response.content[:3] in (b"\xff\xd8\xff", b"\x89PN"):
            return response.content
    except requests.RequestException:
        pass
    return None


def tag_file(path: Path, meta, cover):
    """Write the same tags spotDL writes, including the YouTube Music URL as the comment."""
    from mutagen import File

    url = WATCH_URL.format(meta["video_id"])
    suffix = path.suffix.lower()
    track = meta.get("track_number")
    total = meta.get("track_total")

    if suffix == ".m4a":
        from mutagen.mp4 import MP4, MP4Cover
        audio = MP4(path)
        audio["©nam"] = meta["title"]
        audio["©ART"] = meta["artists"]
        audio["©alb"] = meta["album"]
        audio["aART"] = meta["album_artist"] or meta["artists"][0]
        audio["©cmt"] = url
        if meta.get("year"):
            audio["©day"] = str(meta["year"])
        if track:
            audio["trkn"] = [(int(track), int(total or 0))]
        if cover:
            audio["covr"] = [MP4Cover(cover, MP4Cover.FORMAT_PNG if cover[:3] == b"\x89PN" else MP4Cover.FORMAT_JPEG)]
        if meta.get("spotify_id"):
            from mutagen.mp4 import MP4FreeForm
            audio["----:spotdl:WOAS"] = [MP4FreeForm(f"https://open.spotify.com/track/{meta['spotify_id']}".encode())]
        audio.save()
    elif suffix in (".mp3", ".wav"):
        from mutagen.id3 import APIC, COMM, TALB, TDRC, TIT2, TPE1, TPE2, TRCK
        audio = File(path)  # MP3 and WAVE both carry ID3 tags
        if audio.tags is None:
            audio.add_tags()
        tags = audio.tags
        tags.add(TIT2(encoding=3, text=meta["title"]))
        tags.add(TPE1(encoding=3, text=meta["artists"]))
        tags.add(TALB(encoding=3, text=meta["album"]))
        tags.add(TPE2(encoding=3, text=meta["album_artist"] or meta["artists"][0]))
        tags.add(COMM(encoding=3, lang="eng", desc="", text=url))
        if meta.get("spotify_id"):
            from mutagen.id3 import WOAS
            tags.add(WOAS(url=f"https://open.spotify.com/track/{meta['spotify_id']}"))
        if meta.get("year"):
            tags.add(TDRC(encoding=3, text=str(meta["year"])))
        if track:
            tags.add(TRCK(encoding=3, text=f"{track}/{total}" if total else str(track)))
        if cover:
            tags.add(APIC(encoding=3, mime="image/png" if cover[:3] == b"\x89PN" else "image/jpeg", type=3, desc="Cover", data=cover))
        audio.save()
    elif suffix in (".flac", ".opus", ".ogg"):
        from mutagen.flac import Picture
        audio = File(path)
        audio["title"] = meta["title"]
        audio["artist"] = meta["artists"]
        audio["album"] = meta["album"]
        audio["albumartist"] = meta["album_artist"] or meta["artists"][0]
        audio["comment"] = url
        if meta.get("spotify_id"):
            audio["woas"] = f"https://open.spotify.com/track/{meta['spotify_id']}"
        if meta.get("year"):
            audio["date"] = str(meta["year"])
        if track:
            audio["tracknumber"] = str(track)
        if cover:
            picture = Picture()
            picture.type = 3
            picture.mime = "image/png" if cover[:3] == b"\x89PN" else "image/jpeg"
            picture.data = cover
            if suffix == ".flac":
                audio.clear_pictures()
                audio.add_picture(picture)
            else:
                audio["metadata_block_picture"] = [base64.b64encode(picture.write()).decode("ascii")]
        audio.save()
