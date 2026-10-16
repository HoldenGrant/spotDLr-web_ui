"""
Statistics: what's in the library, and what you listen to.

Listening history is one JSON line per listen in plays.jsonl (in the data folder):
  {"t": 1760600000.0, "id": "3f2a…", "s": 187.4, "title": "…", "artists": [...], "album": "…", "genre": "Pop"}
Title/artist/genre are copied in at listen time, so stats survive a song being deleted or renamed.
A listen counts once the song has actually played for 30 s (or half of a shorter song).
"""

import json
import threading
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

MIN_SECONDS = 30


class Plays:
    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()

    def record(self, track, seconds):
        """Append one listen. Returns False when it's too short to count."""
        duration = track.get("duration") or 0
        seconds = max(0.0, float(seconds))
        if duration:
            seconds = min(seconds, duration + 5)  # can't have listened much longer than the song
        needed = min(MIN_SECONDS, duration / 2) if duration else MIN_SECONDS
        if seconds < needed:
            return False
        entry = {"t": round(time.time(), 1), "id": track["id"], "s": round(seconds, 1), "title": track["title"],
                 "artists": track["artists"], "album": track["album"], "genre": track.get("genre")}
        with self.lock, open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return True

    def load(self):
        if not self.path.exists():
            return []
        plays = []
        with open(self.path, encoding="utf-8") as f:
            for line in f:
                try:
                    plays.append(json.loads(line))
                except ValueError:
                    continue  # a half-written line from a crash: skip it
        return plays


def _month_key(ts):
    return datetime.fromtimestamp(ts).strftime("%Y-%m")


def _months_between(first, last):
    """Every month from first to last (YYYY-MM), so empty months show as zero instead of vanishing."""
    year, month = map(int, first.split("-"))
    end = tuple(map(int, last.split("-")))
    out = []
    while (year, month) <= end:
        out.append(f"{year:04d}-{month:02d}")
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return out


def library_stats(tracks, genre_of):
    """Everything about the collection itself (not filtered by date)."""
    artists = Counter()
    for t in tracks:
        for a in t["artists"]:
            artists[a] += 1
    genres = Counter(genre_of(t) or "Unknown" for t in tracks)

    added = Counter(_month_key(t["added"]) for t in tracks)
    months = _months_between(min(added), max(added)) if added else []

    decades = Counter()
    for t in tracks:
        year = (t.get("year") or "")[:4]
        if year.isdigit() and 1900 < int(year) <= datetime.now().year + 1:
            decades[int(year) // 10 * 10] += 1
    # Every decade between the first and last, so an empty 1970s shows as zero instead of being skipped
    decade_range = range(min(decades), max(decades) + 10, 10) if decades else []

    return {
        "songs": len(tracks),
        "artists": len(artists),
        "albums": len({(t["album_artist"], t["album"]) for t in tracks}),
        "seconds": round(sum(t["duration"] for t in tracks)),
        "bytes": sum(t["size"] for t in tracks),
        "genres_known": sum(1 for t in tracks if genre_of(t)),
        "added_by_month": [{"key": m, "value": added.get(m, 0)} for m in months],
        "top_artists": [{"key": a, "value": n} for a, n in artists.most_common(10)],
        "genres": [{"key": g, "value": n} for g, n in genres.most_common()],
        "decades": [{"key": f"{d}s", "value": decades.get(d, 0)} for d in decade_range],
        "years_known": sum(decades.values()),
    }


def listening_stats(plays, days, library_ids):
    """Listening in the last `days` days (0 = all time), plus the same-length period before it for deltas."""
    now = time.time()
    start = now - days * 86400 if days else (min((p["t"] for p in plays), default=now))
    current = [p for p in plays if p["t"] >= start]
    previous = [p for p in plays if days and start - days * 86400 <= p["t"] < start]

    # Time buckets: days for ranges up to 90 days, months beyond that
    by_day = days and days <= 90
    if by_day:
        first_day = datetime.fromtimestamp(now).date() - timedelta(days=days - 1)
        keys = [(first_day + timedelta(days=i)).isoformat() for i in range(days)]
        bucket = lambda ts: datetime.fromtimestamp(ts).date().isoformat()
    else:
        keys = _months_between(_month_key(start), _month_key(now)) if current else []
        bucket = _month_key
    per_bucket = defaultdict(float)
    for p in current:
        per_bucket[bucket(p["t"])] += p["s"]

    songs, song_seconds, song_meta = Counter(), defaultdict(float), {}
    artist_seconds, genre_seconds = defaultdict(float), defaultdict(float)
    heat = [[0.0] * 24 for _ in range(7)]  # weekday (Mon=0) × hour, seconds
    for p in current:
        key = p["id"]
        songs[key] += 1
        song_seconds[key] += p["s"]
        song_meta[key] = p
        for a in p["artists"][:1]:  # main artist only, so features don't double-count time
            artist_seconds[a] += p["s"]
        genre_seconds[p.get("genre") or "No genre"] += p["s"]
        moment = datetime.fromtimestamp(p["t"])
        heat[moment.weekday()][moment.hour] += p["s"]

    top_songs = sorted(songs, key=lambda k: (songs[k], song_seconds[k]), reverse=True)[:10]
    return {
        "days": days,
        "bucket": "day" if by_day else "month",
        "seconds": round(sum(p["s"] for p in current)),
        "plays": len(current),
        "songs": len(songs),
        "artists": len(artist_seconds),
        "previous_seconds": round(sum(p["s"] for p in previous)) if days else None,
        "previous_plays": len(previous) if days else None,
        "per_bucket": [{"key": k, "value": round(per_bucket.get(k, 0))} for k in keys],
        "top_songs": [{"id": k, "title": song_meta[k]["title"], "artists": song_meta[k]["artists"],
                       "in_library": k in library_ids, "plays": songs[k], "seconds": round(song_seconds[k])}
                      for k in top_songs],
        "top_artists": [{"key": a, "value": round(s)} for a, s in sorted(artist_seconds.items(), key=lambda x: -x[1])[:10]],
        # "No genre" isn't a genre: always last, whatever its size
        "genres": [{"key": g, "value": round(s)} for g, s in sorted(genre_seconds.items(), key=lambda x: (x[0] == "No genre", -x[1]))],
        "heatmap": [[round(v) for v in row] for row in heat],
    }
