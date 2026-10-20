# spotDLr Web UI — Project Hub

> A local music library and player. Search YouTube Music or Spotify, download songs, organize your files, and play on your computer or a paired phone.

**Documentation reviewed:** 2026-10-19; native Mac app and existing-music lyrics updated 2026-10-20 against the working tree. `version.py` declares **2.2.0**; `CHANGELOG.md` also contains **Unreleased** features. These notes describe the working tree, including those features.

**Repo:** `/Users/holden/Projects/spotDLr-web_ui`
**GitHub:** [HoldenGrant/spotDLr-web_ui](https://github.com/HoldenGrant/spotDLr-web_ui) (**public**)
**Runs at:** http://localhost:8000
**Stack:** Swift/Cocoa + WebKit (Mac app) · Python · FastAPI · spotDL 4.4.3 · spotipy · mutagen · vanilla JS (`static/app.js`, no build step)
**Start it (Mac):** open **spotDLr** from Applications/Launchpad/Dock (or double-click `run.command`)

---

> [!warning] Spotify needs Premium; the app works without it
> Since Feb 2026, Spotify's API only works if the account that owns the Spotify app has **Premium**. Until then the app uses **YouTube Music** for search and downloads, and reads pasted Spotify links from Spotify's public player (up to 100 songs per playlist). See [[Bug Log#Blocked: Spotify requires Premium for the app owner]]. Also: [[Bug Log#Spotify secret: rotate once working]].

---

## Quick links

- [[How It Works]]: one download traced end to end. **Start here.**
- [[Backend]]: `app.py`
- [[Frontend]]: `index.html`
- [[API Reference]]
- [[Launchers & Setup]]: native Mac app (`launcher/macOS.swift`, `make_launcher.sh`), source launchers, Windows installer, `.env`
- [[Data and Storage]]: music, settings, caches, playlists, and what survives a restart
- [[Search and Downloads]]: source selection, Spotify fallback, queue states, and cancellation
- [[Playback and Schedules]]: player state, volume, lyrics, listening history, and scheduled plays
- [[Phone Access]]: pairing, Wi-Fi, Tailscale, Funnel, and phone limitations
- [[Documentation Log]]: this documentation pass, source references, and remaining gaps
- [[Bug Log]]: verified open issues
- [[History]]: what changed, when (day by day, with internal detail). The public, version-by-version list is `CHANGELOG.md` in the repo root.
- [[Roadmap]]: done and planned work (phone access over Wi-Fi/Tailscale is done; the phone companion idea is mostly covered by it)

---

## Folders

| Folder | Purpose |
|---|---|
| `architecture/` | Backend, frontend, API, launchers, storage, and feature workflows |
| `bugs/` | Bug Log: open issues and fixes |
| (root) | Hub, history |

---

## The whole system in one picture

```
 WebKit / browser (static/app.js)                    Server (FastAPI :8000)                     outside world
 ──────────────────────                     ─────────────────────                      ─────────────
 Home / Library / player ──GET /api/library──▶ library.py: tags + covers of downloads/ (cached by mtime)
 ▶ play ────────────────GET /api/stream/id──▶ Range → 206 (seeking)
 search box ────────────GET /api/search─────▶ ytmusic.py / spotify_api.py ───────────▶ YouTube Music / Spotify
 ⬇ download ────────────POST /api/download──▶ downloader.py queue → worker thread
                                              └─ yt-dlp or spotDL ────────────────▶ YouTube Music + FFmpeg
 every 1 s while busy ──GET /api/jobs───────▶ job status (success = new files on disk)
```

The music folder is the library; there is no database. Source tags provide exact Spotify/YouTube ID matches when present, with title + main artist as a frontend fallback. Imported files need not have source IDs. See [[How It Works]] and [[Data and Storage]].

---

## Existing repo docs

`README.md`, `SETUP.md`, `DEPLOYMENT.md`, and `CHANGELOG.md` sit in the repo root. Some setup instructions and older vault paragraphs describe earlier behavior. Use the current source to resolve disagreements; dated test reports are historical observations, not checks repeated during this documentation pass. See [[Documentation Log#Remaining documentation work]].

This is the existing **`spotdl/`** vault. The separate **`spotDLr/`** folder contains a new Obsidian vault and is not the documentation destination for this pass.
