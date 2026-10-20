"""
Tidying the library: duplicate songs, and album info that is really a playlist's name.

Duplicates: the same song (title + main artist, ignoring "Remastered", "[Lyrics]", "(feat. …)" and the
like) whose lengths are within a few seconds, so a live or extended version stays separate. The best
copy is suggested (lossless, then bitrate, cover, real album info), but you choose. Merging:
- every playlist that listed a removed copy lists the kept one instead, in the same place;
- a downloaded playlist folder without a playlist.m3u8 gets one first, so it keeps its songs;
- likes and listening history move to the kept copy;
- the removed files go to the Trash (Recycle Bin on Windows), never deleted outright.

Album info: songs whose album tag is the name of one of your playlists ("Green Day Radio") came from a
tool that wrote the playlist into the album field. Each is matched on YouTube Music (the matcher spotDLr
already uses for Spotify links) to find the real album, its artist, year and cover, for you to review.
Applying saves the old values first, so the last batch can be undone.
"""

import base64
import json
import os
import re
import shutil
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from downloader import write_playlist
from library import PLAYLIST_FILE, _read_playlist

LENGTH_TOLERANCE = 4  # seconds: further apart is a different version (live, extended, radio edit)

# "Bennie And The Jets - Remastered 2014", "Iris (Official Video)", "[Lyrics] Uma Thurman", "Numb (feat. X)"
_EXTRAS = re.compile(
    r"\s*(?:[-–]\s*)?[(\[]?\s*(?:\d{4}\s+)?(?:re-?master(?:ed)?|official(?:\s+\w+)?|lyrics?|lyric video|audio|"
    r"video|hd|hq|explicit|clean|mono|stereo|feat\.?|ft\.?|with)\b(?:\s+\d{4})?[^)\]]*[)\]]?", re.I)


class CleanupError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _norm(text):
    text = _EXTRAS.sub(" ", text or "").lower()
    return re.sub(r"[^\w]+", "", text)


def song_key(track):
    return _norm(track["title"]), _norm((track["artists"] or [""])[0])


def _atomic_write(path: Path, text):
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex[:6]}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


# ---------- duplicates ----------

def _playlist_names(collections):
    return {_norm(c["name"]) for c in collections if c["kind"] == "playlist"} | \
           {_norm(c["key"]) for c in collections if c["kind"] == "playlist"}


def _album_is_real(track, playlist_names):
    return bool(track["album"]) and _norm(track["album"]) not in playlist_names


def _score(track, album_folders, playlist_names):
    """Higher = better copy to keep, with the reasons shown to you."""
    score, reasons = 0, []
    if track.get("lossless"):
        score += 10_000
        reasons.append("lossless")
    if track.get("bitrate"):
        score += track["bitrate"] // 2  # matters, but a 320 kbps MP3 made from a 128 kbps upload is no better
        reasons.append(f"{track['bitrate']} kbps")
    if track["has_cover"]:
        score += 60
        reasons.append("has a cover")
    if _album_is_real(track, playlist_names):
        score += 100
        reasons.append("real album info")
    if track["folder"] in album_folders:
        score += 80
        reasons.append("part of an album")
    if track.get("youtube_id") or track.get("spotify_id"):
        score += 30
    if not track["folder"]:
        score -= 20  # a loose file at the top of the library
    return score, reasons


def find_duplicates(tracks, collections, liked_ids):
    groups = {}
    for track in tracks:
        title, artist = song_key(track)
        if title:
            groups.setdefault((title, artist), []).append(track)

    album_folders = {c["key"] for c in collections if c["kind"] == "album"}
    playlist_names = _playlist_names(collections)
    in_lists = {}
    for c in collections:
        for track_id in c["track_ids"]:
            in_lists.setdefault(track_id, []).append(c["name"])

    out = []
    for key, items in groups.items():
        if len(items) < 2:
            continue
        # Split by length: copies more than a few seconds apart are different versions
        items.sort(key=lambda t: t["duration"])
        clusters, current = [], [items[0]]
        for track in items[1:]:
            if track["duration"] - current[-1]["duration"] <= LENGTH_TOLERANCE:
                current.append(track)
            else:
                clusters.append(current)
                current = [track]
        clusters.append(current)
        for cluster in clusters:
            if len(cluster) < 2:
                continue
            copies = []
            for track in cluster:
                score, reasons = _score(track, album_folders, playlist_names)
                copies.append({
                    "id": track["id"], "path": track["path"], "title": track["title"], "artists": track["artists"],
                    "album": track["album"], "folder": track["folder"], "format": Path(track["path"]).suffix.lstrip(".").upper(),
                    "bitrate": track.get("bitrate") or 0, "lossless": bool(track.get("lossless")), "size": track["size"],
                    "duration": track["duration"], "has_cover": track["has_cover"], "liked": track["id"] in liked_ids,
                    "playlists": sorted(set(in_lists.get(track["id"], []))), "score": score, "reasons": reasons,
                })
            copies.sort(key=lambda c: -c["score"])
            copies[0]["best"] = True
            out.append({"key": "|".join(key) + f"|{round(cluster[0]['duration'])}", "title": copies[0]["title"],
                        "artist": (copies[0]["artists"] or [""])[0], "copies": copies,
                        "extra_bytes": sum(c["size"] for c in copies[1:])})
    out.sort(key=lambda g: (g["artist"].lower(), g["title"].lower()))
    return out


def trash(path: Path, fallback_dir: Path):
    """Move a file to the Trash / Recycle Bin, so a mistake can be undone there. Returns where it went.
    If that isn't possible, it goes to `fallback_dir` (in spotDLr's data folder) instead."""
    if os.environ.get("SPOTDLR_TRASH_DIR"):  # tests: a folder of their own, not your real Trash
        trash_to(path, Path(os.environ["SPOTDLR_TRASH_DIR"]))
        return "the Trash"
    try:
        if sys.platform == "win32":
            if _recycle(path):
                return "the Recycle Bin"
        elif sys.platform == "darwin":
            trash_to(path, Path.home() / ".Trash")
            return "the Trash"
        else:
            trash_to(path, Path.home() / ".local" / "share" / "Trash" / "files")
            return "the Trash"
    except OSError:
        pass
    trash_to(path, fallback_dir)
    return str(fallback_dir)


def _recycle(path: Path):
    """Windows: the shell's delete with "allow undo", which is what sends a file to the Recycle Bin."""
    import ctypes
    from ctypes import wintypes

    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [("hwnd", wintypes.HWND), ("wFunc", wintypes.UINT), ("pFrom", wintypes.LPCWSTR),
                    ("pTo", wintypes.LPCWSTR), ("fFlags", ctypes.c_uint16), ("fAnyOperationsAborted", wintypes.BOOL),
                    ("hNameMappings", ctypes.c_void_p), ("lpszProgressTitle", wintypes.LPCWSTR)]
    FO_DELETE, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_SILENT, FOF_NOERRORUI = 3, 0x40, 0x10, 0x4, 0x400
    op = SHFILEOPSTRUCTW(wFunc=FO_DELETE, pFrom=str(path) + "\0",  # the list ends with an extra NUL
                         fFlags=FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI)
    return ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op)) == 0 and not path.exists()


def trash_to(path: Path, folder: Path):
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / path.name
    n = 2
    while target.exists():
        target = folder / f"{path.stem} ({n}){path.suffix}"
        n += 1
    shutil.move(str(path), str(target))
    return target


def delete_track(root: Path, tracks, track_id, likes, fallback_dir: Path):
    """Trash one library song and its lyrics, removing playlist and like references."""
    track = next((t for t in tracks if t["id"] == track_id), None)
    if not track:
        raise CleanupError("This song is no longer in your library. Refresh and try again.", 404)
    path = root / track["path"]
    if not path.resolve().is_relative_to(root.resolve()):
        raise CleanupError("This song is outside your music folder", 403)
    if not path.is_file():
        raise CleanupError("This song is no longer in your library. Refresh and try again.", 404)
    try:
        went_to = trash(path, fallback_dir)
        # Another format of the same song can share this sidecar.
        shared_lyrics = any(t["id"] != track_id and Path(t["path"]).with_suffix(".lrc") == Path(track["path"]).with_suffix(".lrc") for t in tracks)
        lrc = path.with_suffix(".lrc")
        if lrc.exists() and not shared_lyrics:
            trash(lrc, fallback_dir)
        for m3u in root.glob(f"*/{PLAYLIST_FILE}"):
            entries = _read_playlist(m3u, root)
            if track["path"] in entries:
                write_playlist(m3u.parent, [root / rel for rel in entries if rel != track["path"]])
        likes.set(track_id, False)
    except OSError as error:
        raise CleanupError(f"Couldn't finish removing the song: {error}. Refresh your library before retrying.", 500) from error
    return {"deleted": track_id, "trash": went_to}


def merge(root: Path, tracks, keep_id, remove_ids, likes, plays, fallback_dir: Path):
    """Keep one copy, point everything at it, and move the others to the Trash."""
    by_id = {t["id"]: t for t in tracks}
    keep = by_id.get(keep_id)
    remove = [by_id.get(i) for i in dict.fromkeys(remove_ids)]
    if not keep or not all(remove) or not remove:
        raise CleanupError("Some of these songs aren't in your library anymore. Refresh and try again.", 404)
    if keep_id in remove_ids:
        raise CleanupError("The copy you keep can't also be removed")
    if any(song_key(t) != song_key(keep) for t in remove):
        raise CleanupError("Those aren't copies of the same song")
    keep_rel = keep["path"]
    remove_rels = {t["path"] for t in remove}

    # 1. Downloaded playlist folders without a playlist.m3u8 list their own files: write one first,
    #    in the order spotDLr shows them, so the folder doesn't lose the song when its copy goes.
    for rel in remove_rels:
        folder = (root / rel).parent
        if folder != root and folder.parent == root and not (folder / PLAYLIST_FILE).exists():
            own = sorted(t["path"] for t in tracks if t["folder"] == folder.name)
            write_playlist(folder, [root / r for r in own])

    # 2. Every playlist.m3u8 that lists a removed copy lists the kept one there instead
    updated = []
    for m3u in root.glob(f"*/{PLAYLIST_FILE}"):
        entries = _read_playlist(m3u, root)
        if not remove_rels & set(entries):
            continue
        out, seen = [], set()
        for rel in entries:
            rel = keep_rel if rel in remove_rels else rel
            if rel not in seen:
                seen.add(rel)
                out.append(rel)
        write_playlist(m3u.parent, [root / r for r in out])
        updated.append(m3u.parent.name)

    # 3. Likes and listening history follow the song
    likes.merge([t["id"] for t in remove], keep_id)
    plays.rename_ids({t["id"]: keep_id for t in remove})

    # 4. The files (and their .lrc lyrics) go to the Trash
    freed, went_to = 0, None
    for track in remove:
        path = root / track["path"]
        freed += track["size"]
        went_to = trash(path, fallback_dir)
        lrc = path.with_suffix(".lrc")
        if lrc.exists():
            trash(lrc, fallback_dir)
        # An emptied folder that only held this song (and maybe an m3u8 now pointing elsewhere) stays,
        # because its playlist.m3u8 still lists the kept copy.
    return {"removed": len(remove), "freed": freed, "playlists": sorted(updated), "trash": went_to}


# ---------- album info ----------

def album_suspects(tracks, collections):
    """Songs whose album is the name of one of your playlists."""
    names = _playlist_names(collections)
    return [t for t in tracks if t["album"] and _norm(t["album"]) in names]


class AlbumFixer:
    """Looks up the real album for suspect songs (a background job), then writes what you accept."""

    def __init__(self, backup_dir: Path):
        self.backup_dir = backup_dir
        self.lock = threading.Lock()
        self.job = None

    def start(self, suspects):
        with self.lock:
            if self.job and self.job["status"] == "working":
                return dict(self.job)
            self.job = {"id": uuid.uuid4().hex[:10], "status": "working", "done": 0, "total": len(suspects),
                        "results": [], "started": time.time()}
            job = self.job
        threading.Thread(target=self._run, args=(job, suspects), daemon=True).start()
        return dict(job)

    def get(self):
        with self.lock:
            return dict(self.job) if self.job else None

    def _run(self, job, suspects):
        import ytmusic

        albums = {}  # YouTube Music album id → (year, album artist, cover url), looked up once
        album_lock = threading.Lock()

        def album_info(browse_id):
            with album_lock:
                if browse_id in albums:
                    return albums[browse_id]
            try:
                a = ytmusic._call(ytmusic._client().get_album, browse_id)
                info = (a.get("year"), ", ".join(x["name"] for x in ytmusic._artists(a.get("artists"))[:1]),
                        ytmusic.image(a.get("thumbnails"), 1200))
            except Exception:
                info = (None, None, None)
            with album_lock:
                albums[browse_id] = info
            return info

        def look_up(track):
            result = {"id": track["id"], "title": track["title"], "artists": track["artists"], "path": track["path"],
                      "current": {"album": track["album"], "album_artist": track.get("album_artist"),
                                  "year": track.get("year"), "has_cover": track["has_cover"]}, "proposed": None}
            try:
                match = ytmusic.match_song(track["title"], track["artists"], int(track["duration"] * 1000))
            except Exception as e:
                result["error"] = str(e)[:200]
                return result
            album = (match or {}).get("album") or {}
            if not album.get("name") or not album.get("id"):
                result["error"] = "No match on YouTube Music"
                return result
            year, album_artist, cover = album_info(album["id"])
            result["proposed"] = {"album": album["name"], "album_artist": album_artist or (track["artists"] or [""])[0],
                                  "year": year, "cover_url": cover, "album_id": album["id"]}
            return result

        try:
            with ThreadPoolExecutor(max_workers=4) as pool:
                for result in pool.map(look_up, suspects):
                    job["results"].append(result)
                    job["done"] += 1
            job["results"].sort(key=lambda r: ((r["artists"] or [""])[0].lower(), r["title"].lower()))
            job.update(status="done", finished=time.time())
        except Exception as e:  # never die silently on a thread
            job.update(status="failed", error=str(e)[:300])

    # ---------- writing ----------

    def apply(self, root: Path, items, paths_for, tag_album, fetch_cover):
        """items: [{id, album, album_artist, year, cover_url}]. Saves the old values, then writes the new."""
        targets = list(zip(items, paths_for([i["id"] for i in items])))
        backup = {"time": time.time(), "songs": [_read_album_tags(path) | {"path": path.relative_to(root).as_posix()}
                                                 for _, path in targets]}
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        _atomic_write(self.backup_dir / f"{int(backup['time'] * 1000)}.json", json.dumps(backup))
        covers, written, failed = {}, 0, []
        for (item, path), before in zip(targets, backup["songs"]):
            if item.get("year") and str(before.get("date") or "").startswith(str(item["year"])):
                item = dict(item, year=None)  # "2004-09-21" already says 2004: keep the full date
            url = item.get("cover_url")
            if url and url not in covers:
                covers[url] = fetch_cover(url)
            cover = (covers[url], "image/png" if covers[url][:3] == b"\x89PN" else "image/jpeg") if url and covers.get(url) else None
            album_artist = (item.get("album_artist") or "").strip() or item.get("artist") or "Unknown artist"
            try:
                if tag_album(path, item["album"].strip(), album_artist, item.get("year"), cover):
                    written += 1
                else:
                    failed.append(path.name)
            except Exception as e:
                failed.append(f"{path.name}: {str(e)[:80]}")
        return {"written": written, "failed": failed, "can_undo": True}

    def last_backup(self):
        files = sorted(self.backup_dir.glob("*.json")) if self.backup_dir.exists() else []
        return files[-1] if files else None

    def undo(self, root: Path):
        backup_file = self.last_backup()
        if not backup_file:
            raise CleanupError("Nothing to undo", 404)
        backup = json.loads(backup_file.read_text(encoding="utf-8"))
        restored, missing = 0, []
        for song in backup["songs"]:
            path = root / song["path"]
            if not path.exists():
                missing.append(song["path"])
                continue
            _write_album_tags(path, song)
            restored += 1
        backup_file.rename(backup_file.with_suffix(".undone"))
        return {"restored": restored, "missing": missing}


def _read_album_tags(path: Path):
    """album, album artist, date and the cover (base64), as they are now."""
    import mutagen
    from library import _read_cover

    easy = mutagen.File(path, easy=True)
    tags = (easy.tags if easy is not None else None) or {}
    first = lambda k: (tags.get(k) or [None])[0] if tags else None
    cover = _read_cover(path)
    return {"album": first("album"), "albumartist": first("albumartist"), "date": first("date"),
            "cover": base64.b64encode(cover[0]).decode("ascii") if cover else None, "cover_mime": cover[1] if cover else None}


def _write_album_tags(path: Path, saved):
    """Put back what _read_album_tags saved (a missing value is removed again)."""
    import mutagen
    from organize import _remove_cover, _write_cover

    easy = mutagen.File(path, easy=True)
    if easy is None:
        return
    if easy.tags is None:
        easy.add_tags()
    for key in ("album", "albumartist", "date"):
        if saved.get(key):
            easy.tags[key] = saved[key]
        elif key in easy.tags:
            del easy.tags[key]
    easy.save()
    if saved.get("cover"):
        _write_cover(path, base64.b64decode(saved["cover"]), saved.get("cover_mime") or "image/jpeg")
    else:
        _remove_cover(path)
