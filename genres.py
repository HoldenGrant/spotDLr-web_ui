"""
Song genres, looked up once on Deezer's public API (no account, no key) and kept in
.genres.json next to app.py.

Why not the files' own tags: spotDL only wrote a genre for ~20% of songs, in narrow
Spotify terms ("red dirt", "country hip hop"), and YouTube Music has none. Deezer gives
broad, consistent buckets (Pop, Rock, Rap/Hip Hop, R&B, Country…), right for browsing.

Why a cache file instead of writing tags: rewriting tags changes each file's mtime, and
"Date added" is the mtime, so every song would suddenly look added today.
"""

import json
import re
import threading
import time
from pathlib import Path

import requests

DEEZER = "https://api.deezer.com"
RETRY_MISSES_AFTER = 86400       # songs Deezer missed get another try a day later (its search is inconsistent)
REQUEST_GAP = 0.15               # Deezer allows 50 requests / 5 s; stay well under it
LOOKUP_VERSION = 5               # bump when matching improves: older misses get retried right away

# Deezer's own names, tidied for display
RENAMES = {"Rap/Hip Hop": "Hip-Hop", "Films/Games": "Soundtracks", "Dance": "Dance & Electronic",
           "Electro": "Dance & Electronic", "Latin Music": "Latin", "Asian Music": "Asian"}
# Fallback when Deezer has nothing: map the spotDL (Spotify) genre tag to a broad bucket
TAG_BUCKETS = [("k-pop", "K-Pop"), ("christmas", "Holiday"), ("worship", "Christian"), ("christian", "Christian"),
               ("hip hop", "Hip-Hop"), ("rap", "Hip-Hop"), ("r&b", "R&B"), ("country", "Country"), ("red dirt", "Country"),
               ("reggaeton", "Latin"), ("corrido", "Latin"), ("latin", "Latin"), ("edm", "Dance & Electronic"),
               ("house", "Dance & Electronic"), ("rock", "Rock"), ("metal", "Metal"), ("jazz", "Jazz"),
               ("soul", "Soul & Funk"), ("folk", "Folk"), ("pop", "Pop"), ("spoken word", "Spoken Word")]


def song_key(title, artist):
    """Same song, same key: lowercase, no "(feat./with …)" credits, no punctuation."""
    title = re.sub(r"\s*[([](feat|ft|with)\b[^)\]]*[)\]]", "", (title or "").lower())
    norm = lambda s: re.sub(r"[^\w]+", "", s)
    return f"{norm(artist.lower())}|{norm(title)}"


VIDEO_JUNK = r"official|video|audio|lyric|visuali[sz]er|\bhd\b|\bhq\b|\bmv\b|\bm/v\b|part \d|remaster|explicit|clean"


def _search_title(title):
    """Title as Deezer knows it. Fan uploads look like 'The Phoenix (Official Video) [Part 2 of 11]'
    or 'Save Rock And Roll - Fall Out Boy Lyrics', so drop credits and video junk."""
    title = re.sub(r"\s*[([](feat|ft|with)\b[^)\]]*[)\]]", "", title or "", flags=re.I)
    title = re.sub(rf"\s*[([][^)\]]*({VIDEO_JUNK})[^)\]]*[)\]]", "", title, flags=re.I)  # (Official Video), [Lyrics]
    title = re.sub(r"\s*-\s*(\d{4}\s*)?remaster(ed)?.*$", "", title, flags=re.I)
    title = re.sub(r"\b(with\s+)?lyrics?\b|\bwith\s+(song|audio)\b|\bpart\s*\d+(\s*of\s*\d+)?\b|\bofficial\s+(music\s+)?video\b", "", title, flags=re.I)
    return re.sub(r"\s{2,}", " ", title).strip(" -|·")


def _search_artist(artist):
    """'Fall Out Boy VEVO' / 'Fall Out Boy - Topic' / 'FallOutBoyOfficial' → the artist."""
    artist = re.sub(r"\s*(-\s*topic|vevo|official)\s*$", "", artist or "", flags=re.I)
    return artist.strip()


def _norm(x):
    return re.sub(r"[^\w]+", "", (x or "").lower())


def _similar(a, b):
    from difflib import SequenceMatcher
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _title_match(found, wanted):
    """Close, or one contains the other: Deezer often ranks "Wonderwall (Live at Knebworth…)" first,
    and knows "Light Em Up" as "My Songs Know What You Did In The Dark (Light Em Up)"."""
    a, b = _norm(found), _norm(wanted)
    return _similar(a, b) > 0.6 or (len(b) >= 4 and b in a) or (len(a) >= 4 and a in b)


def primary(genres):
    """One display genre: Deezer lists "Asian Music, K-Pop", where the second is the useful one."""
    names = [RENAMES.get(g, g) for g in genres if g]
    if not names:
        return None
    if names[0] == "Asian" and len(names) > 1:
        return names[1]
    return names[0]


def from_tag(tag):
    tag = (tag or "").lower()
    return next((bucket for needle, bucket in TAG_BUCKETS if needle in tag), None) if tag else None


class Genres:
    def __init__(self, cache_file: Path, tracks_source):
        self.cache_file = cache_file
        self.tracks_source = tracks_source  # callable → library tracks
        self.lock = threading.Lock()
        self.data = {"songs": {}, "albums": {}}
        if cache_file.exists():
            try:
                self.data.update(json.loads(cache_file.read_text()))
            except ValueError:
                pass  # corrupt cache: start over
        self.session = requests.Session()
        self.pending = 0
        threading.Thread(target=self._worker, daemon=True).start()

    # ---------- reading ----------

    def genre_for(self, track):
        entry = self.data["songs"].get(song_key(track["title"], track["artists"][0]))
        if entry and entry.get("genre"):
            return entry["genre"]
        return from_tag(track.get("genre_tag"))

    def status(self):
        return {"pending": self.pending, "known": sum(1 for e in self.data["songs"].values() if e.get("genre"))}

    # ---------- background fill ----------

    def _needs_lookup(self, track, now):
        entry = self.data["songs"].get(song_key(track["title"], track["artists"][0]))
        if entry is None:
            return True
        if entry.get("genre"):
            return False
        return entry.get("v", 1) < LOOKUP_VERSION or now - entry.get("checked", 0) > RETRY_MISSES_AFTER

    def _worker(self):
        time.sleep(3)  # let the server finish starting
        while True:
            try:
                now = time.time()
                todo, seen = [], set()
                for t in self.tracks_source():
                    key = song_key(t["title"], t["artists"][0])
                    if key not in seen and self._needs_lookup(t, now):
                        seen.add(key)
                        todo.append(t)
                self.pending = len(todo)
                for i, t in enumerate(todo):
                    genres = self._lookup(t["title"], t["artists"][0])
                    with self.lock:
                        self.data["songs"][song_key(t["title"], t["artists"][0])] = {
                            "genre": primary(genres), "genres": genres, "checked": time.time(), "v": LOOKUP_VERSION}
                    self.pending = len(todo) - i - 1
                    if i % 10 == 9:
                        self._save()
                if todo:
                    self._save()
            except Exception:
                pass  # network trouble: try again next round
            time.sleep(20)  # pick up new downloads

    def _get(self, path, **params):
        for attempt in range(3):
            time.sleep(REQUEST_GAP)
            try:
                data = self.session.get(f"{DEEZER}{path}", params=params, timeout=10).json()
            except (requests.RequestException, ValueError):
                time.sleep(2)
                continue
            if isinstance(data, dict) and (data.get("error") or {}).get("code") == 4:  # quota: back off
                time.sleep(5)
                continue
            return data
        return {}

    def _lookup(self, title, artist):
        """Try progressively looser searches; return the album's Deezer genres, or []."""
        clean, artist = _search_title(title), _search_artist(artist)
        attempts = [(artist, clean)]
        # "Fall Out Boy - Save Rock And Roll" uploaded by someone else: the artist is inside the title
        if " - " in clean:
            left, right = [part.strip() for part in clean.split(" - ", 1)]
            attempts += [(left, right), (right, left)]
        hit = None
        for who, what in attempts:
            if not who or not what:
                continue
            # Strict syntax first; Deezer's strict search sometimes returns nothing for songs it has
            # ("Fall Out Boy" / "Miss Missing You"), so also try a plain "artist song" search.
            # Never take hits[0] blindly: the artist and title must both agree.
            for query in (f'artist:"{who}" track:"{what}"', f"{who} {what}"):
                hits = self._get("/search", q=query, limit=5).get("data") or []
                hit = next((h for h in hits if _similar((h.get("artist") or {}).get("name"), who) > 0.85
                            and _title_match(h.get("title"), what)), None)
                if hit:
                    break
            if hit:
                break
        if not hit:
            return []
        album_id = str((hit.get("album") or {}).get("id") or "")
        if not album_id:
            return []
        if album_id not in self.data["albums"]:
            album = self._get(f"/album/{album_id}")
            with self.lock:
                self.data["albums"][album_id] = [g.get("name") for g in ((album.get("genres") or {}).get("data") or [])]
        return self.data["albums"][album_id]

    def _save(self):
        with self.lock:
            tmp = self.cache_file.with_name(self.cache_file.name + ".tmp")
            tmp.write_text(json.dumps(self.data))
            tmp.replace(self.cache_file)
