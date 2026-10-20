"""
Lyrics: time-synced when possible, from the song's own .lrc file or LRCLIB (lrclib.net, free, no key).

LRC is one line per lyric, each starting with when it's sung:
    [00:17.04] Sunday morning, rain is falling
so the player highlights the last line whose time has passed.

Lookups are cached one file per song in .lyrics/ (in the data folder), misses too, so each song
is asked about once. Only artist, title and duration are sent.
"""

import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path

import requests

from genres import _search_artist, _search_title, _similar, _title_match, song_key

LRCLIB = "https://lrclib.net/api"
USER_AGENT = "spotDLr (https://github.com/HoldenGrant/spotDLr-web_ui)"  # LRCLIB asks clients to identify themselves
RETRY_MISSES_AFTER = 7 * 86400   # LRCLIB grows; songs it didn't have get another try a week later
DURATION_SLACK = 4               # seconds: a different length means a different version (live, radio edit)

TIMESTAMP = re.compile(r"\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]")
OFFSET = re.compile(r"^\[offset:\s*([+-]?\d+)\s*\]", re.I | re.M)


class LyricsError(Exception):
    pass


def parse_lrc(text):
    """LRC text → [{"t": seconds, "text": str}] sorted by time, or [] if it has no timestamps.

    Handles several timestamps on one line ("[00:12.00][00:45.00]chorus"), [ar:]/[ti:] header tags
    (skipped) and [offset:+/-ms] (positive = lyrics come earlier)."""
    offset = OFFSET.search(text or "")
    shift = int(offset.group(1)) / 1000 if offset else 0.0
    lines = []
    for raw in (text or "").splitlines():
        stamps = list(TIMESTAMP.finditer(raw))
        if not stamps:
            continue
        words = raw[stamps[-1].end():].strip()
        for m in stamps:
            seconds = int(m.group(1)) * 60 + float(m.group(2).replace(":", "."))
            lines.append({"t": round(max(0.0, seconds - shift), 2), "text": words})
    lines.sort(key=lambda line: line["t"])
    return lines


def _result(synced=None, plain=None, instrumental=False, source=None):
    lines = parse_lrc(synced) if synced else []
    return {
        "lines": lines or None,
        "plain": None if lines else (plain or (synced and TIMESTAMP.sub("", synced).strip()) or None),
        "instrumental": bool(instrumental),
        "source": source,
    }


def _lrc_text(lines):
    return "\n".join(f"[{int(l['t'] // 60):02d}:{l['t'] % 60:05.2f}]{l['text']}" for l in lines) + "\n"


class Lyrics:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self._save_lock = threading.Lock()
        self._save_status = {"running": False, "done": 0, "total": 0, "saved": 0,
                             "existing": 0, "unavailable": 0, "failed": 0, "error": None}

    # ---------- public ----------

    def for_track(self, track, path: Path):
        """Lyrics for a library track: its own .lrc first, then the cache, then LRCLIB."""
        lrc = path.with_suffix(".lrc")
        if lrc.exists():
            try:
                return _result(synced=lrc.read_text(encoding="utf-8-sig", errors="replace"), source="file")
            except OSError:
                pass
        return self.lookup(track["title"], track["artists"], track.get("duration") or 0)

    def lookup(self, title, artists, duration):
        cache = self._cache_file(title, artists, duration)
        cached = self._read_cache(cache)
        if cached is not None:
            return cached
        hit = self._search(title, artists[0] if artists else "", duration)
        if hit:
            result = _result(hit.get("syncedLyrics"), hit.get("plainLyrics"), hit.get("instrumental"), "lrclib")
        else:
            result = _result()
        self._write_cache(cache, result)
        return result

    def save_lrc(self, audio_path: Path, title, artists):
        """After a download: write <song>.lrc next to it when synced lyrics exist (for offline use and
        other players). Never raises; lyrics are a bonus, not part of the download."""
        try:
            import mutagen
            info = mutagen.File(audio_path)
            duration = getattr(getattr(info, "info", None), "length", 0) or 0
            result = self.lookup(title, artists, duration)
            if result["lines"]:
                audio_path.with_suffix(".lrc").write_text(_lrc_text(result["lines"]), encoding="utf-8")
                return True
        except Exception:
            pass
        return False

    def save_existing(self, track, path: Path):
        """Save synced lyrics beside an existing song, without replacing its own .lrc file."""
        if not path.is_file():
            raise OSError("The audio file is no longer available")
        lrc = path.with_suffix(".lrc")
        if lrc.exists():
            return "existing"
        result = self.lookup(track["title"], track["artists"], track.get("duration") or 0)
        if not result["lines"]:
            return "unavailable"
        try:
            with lrc.open("x", encoding="utf-8") as file:
                file.write(_lrc_text(result["lines"]))
        except FileExistsError:
            return "existing"
        return "saved"

    def save_status(self):
        with self._save_lock:
            return dict(self._save_status)

    def start_save(self, tracks, root: Path):
        """One library pass at a time; it continues when Settings or the browser is closed."""
        with self._save_lock:
            if self._save_status["running"]:
                return dict(self._save_status)
            self._save_status = {"running": True, "done": 0, "total": len(tracks), "saved": 0,
                                 "existing": 0, "unavailable": 0, "failed": 0, "error": None}
            status = dict(self._save_status)
        threading.Thread(target=self._save_library, args=(tracks, root), daemon=True).start()
        return status

    def _save_library(self, tracks, root):
        try:
            for track in tracks:
                error = None
                try:
                    outcome = self.save_existing(track, root / track["path"])
                except Exception as e:
                    outcome, error = "failed", f"{track['title']}: {e}"
                with self._save_lock:
                    self._save_status[outcome] += 1
                    self._save_status["done"] += 1
                    if error:
                        self._save_status["error"] = error
        finally:
            with self._save_lock:
                self._save_status["running"] = False

    # ---------- LRCLIB ----------

    def _get(self, endpoint, **params):
        # requests, not urllib: python.org's Python on macOS has no root certificates, so urllib fails
        # every HTTPS call with CERTIFICATE_VERIFY_FAILED; requests brings its own (certifi)
        # LRCLIB's gateway answers some requests in a burst with 502/503: those (and 429, dropped
        # connections) get two more tries after a pause (its 503 says "ServerOverloaded, please retry in a moment").
        response = None
        for pause in (1.0, 3.0, None):
            try:
                response = requests.get(f"{LRCLIB}/{endpoint}", params={k: v for k, v in params.items() if v},
                                        headers={"User-Agent": USER_AGENT}, timeout=10)
                if response.status_code != 429 and response.status_code < 500:
                    break
            except requests.RequestException as e:
                if pause is None:
                    raise LyricsError("Couldn't reach the lyrics service") from e
            if pause:
                time.sleep(pause)
        if response is None:
            raise LyricsError("Couldn't reach the lyrics service")
        if response.status_code == 404:
            return None
        if not response.ok:
            raise LyricsError(f"Lyrics service error {response.status_code}")
        try:
            return response.json()
        except ValueError as e:
            raise LyricsError("Lyrics service sent something unreadable") from e

    def _search(self, title, artist, duration):
        """Exact match first (LRCLIB's /get matches duration within ±2 s), then a search where artist,
        title and length must all agree. Synced beats plain. Same title cleanup as genres."""
        clean, artist = _search_title(title), _search_artist(artist)
        attempts = [(artist, clean)]
        if " - " in clean:  # "Fall Out Boy - Save Rock And Roll" uploaded by someone else
            left, right = [part.strip() for part in clean.split(" - ", 1)]
            attempts += [(left, right), (right, left)]
        best, failure = None, None

        def ask(endpoint, **params):
            # One failed request doesn't end the lookup: the next way of asking may still find it
            nonlocal failure
            try:
                return self._get(endpoint, **params)
            except LyricsError as e:
                failure = e
                return None

        for who, what in attempts:
            if not who or not what:
                continue
            if duration:
                hit = ask("get", artist_name=who, track_name=what, duration=round(duration))
                if hit and (hit.get("syncedLyrics") or hit.get("plainLyrics") or hit.get("instrumental")):
                    if hit.get("syncedLyrics") or hit.get("instrumental"):
                        return hit
                    best = best or hit
            hits = ask("search", artist_name=who, track_name=what) or []
            good = [h for h in hits
                    if _similar(h.get("artistName"), who) > 0.8 and _title_match(h.get("trackName"), what)
                    and (not duration or not h.get("duration") or abs(h["duration"] - duration) <= DURATION_SLACK)]
            good.sort(key=lambda h: (not h.get("syncedLyrics"), abs((h.get("duration") or duration) - duration)))
            if good and good[0].get("syncedLyrics"):
                return good[0]
            best = best or (good[0] if good else None)
        if not best and failure:
            raise failure  # nothing found *and* something failed: don't cache it as "no lyrics"
        return best

    # ---------- cache ----------

    def _cache_file(self, title, artists, duration):
        key = f"{song_key(title, artists[0] if artists else '')}|{round(duration or 0)}"
        return self.cache_dir / f"{hashlib.sha1(key.encode()).hexdigest()[:20]}.json"

    def _read_cache(self, file: Path):
        try:
            entry = json.loads(file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        found = entry["result"]["lines"] or entry["result"]["plain"] or entry["result"]["instrumental"]
        if not found and time.time() - entry.get("t", 0) > RETRY_MISSES_AFTER:
            return None
        return entry["result"]

    def _write_cache(self, file: Path, result):
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            tmp = file.with_suffix(".tmp")
            tmp.write_text(json.dumps({"t": time.time(), "result": result}, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp, file)
        except OSError:
            pass
