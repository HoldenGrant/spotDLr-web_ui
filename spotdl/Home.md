# spotDLr Web UI — Project Hub

> A Spotify-style music library and player for your own files. Search Spotify, download with [spotDL](https://github.com/spotDL/spotify-downloader), and play in the browser.

**Repo:** `/Users/holden/Projects/spotDLr-web_ui`
**GitHub:** [HoldenGrant/spotDLr-web_ui](https://github.com/HoldenGrant/spotDLr-web_ui) (**public**)
**Runs at:** http://localhost:8000
**Stack:** Python · FastAPI · spotDL 4.4.3 · spotipy · mutagen · vanilla JS (`static/app.js`, no build step)
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
- [[Launchers & Setup]]: `run.command` (Mac), `run.sh`, `run.bat`, `run.ps1`, `.env`
- [[Bug Log]]: verified open issues
- [[History]]: what changed, when (day by day, with internal detail). The public, version-by-version list is `CHANGELOG.md` in the repo root.
- [[Roadmap]]: planned work (next: a `spotDLr.app` launcher so it opens like an app)

---

## Folders

| Folder | Purpose |
|---|---|
| `architecture/` | How the system is built: backend, frontend, API, launchers |
| `bugs/` | Bug Log: open issues and fixes |
| (root) | Hub, history |

---

## The whole system in one picture

```
 Browser (static/app.js)                    Server (FastAPI :8000)                     outside world
 ──────────────────────                     ─────────────────────                      ─────────────
 Home / Library / player ──GET /api/library──▶ library.py: tags + covers of downloads/ (cached by mtime)
 ▶ play ────────────────GET /api/stream/id──▶ Range → 206 (seeking)
 search box ────────────GET /api/search─────▶ spotify_api.py ───────────────────────▶ Spotify Web API
 ⬇ download ────────────POST /api/download──▶ downloader.py queue → worker thread
                                              └─ python -m spotdl download …  ─────▶ YouTube Music + FFmpeg
 every 1 s while busy ──GET /api/jobs───────▶ job status (success = new files on disk)
```

The two ideas everything rests on: **the `downloads/` folder is the library** (no database), and **every file carries its Spotify track ID** in a tag, so "do I already have this?" is an exact lookup. See [[How It Works]].

---

## Existing repo docs

`README.md`, `SETUP.md` and `DEPLOYMENT.md` sit in the repo root. They're partly out of date: README.md was rewritten for the media-library version on Oct 15; SETUP.md and DEPLOYMENT.md are still the old Windows-era guides. When this vault and those files disagree, trust the vault: it was written from the code.
