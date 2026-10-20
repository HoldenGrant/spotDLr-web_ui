"""
Statistics: what's in the library, and what you listen to.

Listening history is one JSON line per listen in plays.jsonl (in the data folder):
  {"t": 1760600000.0, "id": "3f2a…", "s": 187.4, "title": "…", "artists": [...], "album": "…", "genre": "Pop"}
Title/artist/genre are copied in at listen time, so stats survive a song being deleted or renamed.
A listen counts once the song has actually played for 30 s (or half of a shorter song).
"""

import json
import os
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

    def rename_ids(self, mapping):
        """Duplicates merged: their plays count for the copy that was kept."""
        if not mapping or not self.path.exists():
            return
        with self.lock:
            lines = self.path.read_text(encoding="utf-8").splitlines()
            out = []
            for line in lines:
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                if entry.get("id") in mapping:
                    entry["id"] = mapping[entry["id"]]
                out.append(json.dumps(entry, ensure_ascii=False))
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text("\n".join(out) + ("\n" if out else ""), encoding="utf-8")
            os.replace(tmp, self.path)

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


RANGES = ("today", "yesterday", "week", "last-week", "month", "last-month", "year", "last-year",
          "7d", "30d", "90d", "365d", "all")


def _shift_months(day, n):
    """The 1st of the month n months from `day`'s month."""
    index = day.year * 12 + day.month - 1 + n
    return day.replace(year=index // 12, month=index % 12 + 1, day=1)


def period(range_key, now=None, first_play=None):
    """Where a range starts and ends, what to compare it with, and how to bucket its chart.

    Calendar ranges ("week", "last-month", …) follow the calendar; weeks start on Monday.
    A period still going on (today, this week/month/year) is compared with the same stretch of the one
    before ("this month so far" vs "last month up to the same day and hour"), since comparing a half
    month with a whole one would always look like a drop. A finished period is compared with the whole
    one before it; "Last 30 days" with the 30 days before that.
    Returns {start, end, prev_start, prev_end, bucket ("hour" | "day" | "month"), keys, compare}."""
    now = now or datetime.now()
    today = datetime(now.year, now.month, now.day)
    monday = today - timedelta(days=today.weekday())
    month1 = today.replace(day=1)
    year1 = today.replace(month=1, day=1)
    calendar = {  # key: (start, end, previous start, bucket, in progress, what it's compared with)
        "today": (today, today + timedelta(days=1), today - timedelta(days=1), "hour", True, "yesterday by this time"),
        "yesterday": (today - timedelta(days=1), today, today - timedelta(days=2), "hour", False, "the day before"),
        "week": (monday, monday + timedelta(days=7), monday - timedelta(days=7), "day", True, "last week by this time"),
        "last-week": (monday - timedelta(days=7), monday, monday - timedelta(days=14), "day", False, "the week before"),
        "month": (month1, _shift_months(month1, 1), _shift_months(month1, -1), "day", True, "last month by this time"),
        "last-month": (_shift_months(month1, -1), month1, _shift_months(month1, -2), "day", False, "the month before"),
        "year": (year1, year1.replace(year=year1.year + 1), year1.replace(year=year1.year - 1), "month", True, "last year by this time"),
        "last-year": (year1.replace(year=year1.year - 1), year1, year1.replace(year=year1.year - 2), "month", False, "the year before"),
    }
    if range_key in calendar:
        start, end, prev_start, bucket, ongoing, compare = calendar[range_key]
        prev_end = min(prev_start + (now - start), start) if ongoing else start
        end_of_data = min(end, now) if ongoing else end
    elif range_key == "all":
        start = datetime.fromtimestamp(first_play) if first_play else today
        end = end_of_data = now
        prev_start = prev_end = compare = None
        bucket = "month"
    else:
        days = int(range_key.rstrip("d"))
        start, end = now - timedelta(days=days), now
        end_of_data = now
        prev_start, prev_end = start - timedelta(days=days), start
        bucket = "day" if days <= 90 else "month"
        compare = "the year before" if days == 365 else f"the {days} days before"
        start_day = today - timedelta(days=days - 1)  # chart: the last N calendar days, today included

    # Chart columns: the whole period (days still to come show as empty), so its shape is familiar
    if bucket == "hour":
        keys = [(start + timedelta(hours=h)).strftime("%Y-%m-%dT%H") for h in range(24)]
    elif bucket == "day":
        first = start_day if range_key.endswith("d") else start
        last = today if range_key.endswith("d") else end - timedelta(days=1)
        keys = [(first + timedelta(days=i)).date().isoformat() for i in range((last - first).days + 1)]
    else:
        keys = _months_between(start.strftime("%Y-%m"), (end_of_data if range_key in ("all", "365d") else end - timedelta(days=1)).strftime("%Y-%m"))
    return {"start": start.timestamp(), "end": end.timestamp(),
            "prev_start": prev_start.timestamp() if prev_start else None, "prev_end": prev_end.timestamp() if prev_end else None,
            "bucket": bucket, "keys": keys, "compare": compare}


BUCKET_FORMAT = {"hour": "%Y-%m-%dT%H", "day": "%Y-%m-%d", "month": "%Y-%m"}


def listening_stats(plays, range_key, library_ids, now=None):
    """Listening in a range (see `period`), plus the period it's compared with for the ▲/▼ deltas."""
    p_ = period(range_key, now, min((p["t"] for p in plays), default=None))
    current = [p for p in plays if p_["start"] <= p["t"] < p_["end"]]
    compared = p_["prev_start"] is not None
    previous = [p for p in plays if compared and p_["prev_start"] <= p["t"] < p_["prev_end"]]
    keys = p_["keys"]
    fmt = BUCKET_FORMAT[p_["bucket"]]
    per_bucket = defaultdict(float)
    for p in current:
        per_bucket[datetime.fromtimestamp(p["t"]).strftime(fmt)] += p["s"]

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
        "range": range_key,
        "start": p_["start"],
        "end": p_["end"],
        "compare": p_["compare"],
        "bucket": p_["bucket"],
        "seconds": round(sum(p["s"] for p in current)),
        "plays": len(current),
        "songs": len(songs),
        "artists": len(artist_seconds),
        "previous_seconds": round(sum(p["s"] for p in previous)) if compared else None,
        "previous_plays": len(previous) if compared else None,
        "per_bucket": [{"key": k, "value": round(per_bucket.get(k, 0))} for k in keys],
        "top_songs": [{"id": k, "title": song_meta[k]["title"], "artists": song_meta[k]["artists"],
                       "in_library": k in library_ids, "plays": songs[k], "seconds": round(song_seconds[k])}
                      for k in top_songs],
        "top_artists": [{"key": a, "value": round(s)} for a, s in sorted(artist_seconds.items(), key=lambda x: -x[1])[:10]],
        # "No genre" isn't a genre: always last, whatever its size
        "genres": [{"key": g, "value": round(s)} for g, s in sorted(genre_seconds.items(), key=lambda x: (x[0] == "No genre", -x[1]))],
        "heatmap": [[round(v) for v in row] for row in heat],
    }
