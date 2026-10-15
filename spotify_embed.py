"""
Read Spotify tracks, albums and playlists without API keys, from the public embed
player (open.spotify.com/embed/...), which carries the song list as JSON.

Used when the Web API is unavailable (since Feb 2026 it needs the app owner to have
Premium). Unlike the API, the embed still lists songs in Spotify-owned playlists.
"""

import json
import re

import requests

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}
NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S)


class EmbedError(Exception):
    pass


def _entity(kind, spotify_id):
    try:
        response = requests.get(f"https://open.spotify.com/embed/{kind}/{spotify_id}", headers=HEADERS, timeout=15)
    except requests.RequestException as e:
        raise EmbedError(f"Couldn't reach Spotify: {e}")
    if response.status_code == 404:
        raise EmbedError("Spotify says this link doesn't exist.")
    match = NEXT_DATA.search(response.text)
    if not response.ok or not match:
        raise EmbedError(f"Couldn't read this Spotify page (HTTP {response.status_code}).")
    try:
        return json.loads(match.group(1))["props"]["pageProps"]["state"]["data"]["entity"]
    except (KeyError, ValueError):
        raise EmbedError("Spotify changed its embed page; this link can't be read right now.")


def _cover(entity):
    images = (entity.get("visualIdentity") or {}).get("image") or []
    if images:
        return max(images, key=lambda i: i.get("maxWidth") or 0).get("url")
    sources = (entity.get("coverArt") or {}).get("sources") or []
    return max(sources, key=lambda s: s.get("width") or 0).get("url") if sources else None


def _split_artists(subtitle):
    # The embed joins artists with ", " (or a non-breaking variant)
    return [a.strip() for a in re.split(r",\s*", (subtitle or "").replace(" ", " ")) if a.strip()]


def _track(item, album=None):
    uri = item.get("uri") or ""
    spotify_id = uri.rsplit(":", 1)[-1] if uri.startswith("spotify:track:") else item.get("id")
    if not spotify_id:
        return None
    artists = [a.get("name") for a in item.get("artists") or [] if a.get("name")] or _split_artists(item.get("subtitle"))
    album = album or {}
    return {
        "source": "spotify",
        "id": spotify_id,
        "name": item.get("title") or item.get("name"),
        "artists": [{"id": None, "name": a} for a in artists],
        "album": {"id": album.get("id"), "name": album.get("name"), "image": album.get("image")},
        "duration_ms": item.get("duration") or 0,
        "explicit": bool(item.get("isExplicit")),
        "url": f"https://open.spotify.com/track/{spotify_id}",
    }


def item(kind, spotify_id):
    """Album / playlist / track in the same shape as spotify_api's pages."""
    entity = _entity(kind, spotify_id)
    cover = _cover(entity)
    year = ((entity.get("releaseDate") or {}).get("isoString") or "")[:4] or None
    if kind == "track":
        track = _track(dict(entity, uri=f"spotify:track:{spotify_id}"), album={"image": cover})
        return dict(track, image=cover, tracks=[track], total_tracks=1, year=year)
    info = {
        "source": "spotify",
        "id": spotify_id,
        "name": entity.get("name") or entity.get("title"),
        "image": cover,
        "year": year,
        "url": f"https://open.spotify.com/{kind}/{spotify_id}",
        "via_embed": True,
    }
    if kind == "album":
        info.update(artists=[{"id": None, "name": a} for a in _split_artists(entity.get("subtitle"))], album_type="album")
        album = {"id": spotify_id, "name": info["name"], "image": cover}
    else:
        info.update(owner=entity.get("subtitle") or ", ".join(a.get("name", "") for a in entity.get("authors") or []), description="")
        album = {"image": None}
    info["tracks"] = [t for t in (_track(x, album) for x in entity.get("trackList") or []) if t]
    info["total_tracks"] = len(info["tracks"])
    return info
