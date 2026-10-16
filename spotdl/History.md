# History

Built from `git log`, plus uncommitted work. 22 commits, Dec 15, 2025 to Jan 6, 2026. Related: [[Home]] · [[Bug Log]]

### Jan 6, 2026
- Fixed playlist/album folder naming on macOS.

### Dec 19, 2025
- UI update: the forest-green theme.
- Added macOS support (`run.sh`) and updated the README.
- FFmpeg is now installed automatically by the launchers (`spotdl --download-ffmpeg`).
- Fixed cover art (the `--force-update-metadata --ytm-data` flags).

### Dec 18, 2025
- Reworked the layout and added the **mini player** (prev/next/stop, seek, auto-advance).
- Added the **Include Lyrics** option (`--generate-lrc`).
- `run.bat` now installs Python 3.11 itself and adds it to PATH.
- Five commits fixing how `run.bat` reads `.env`.
- Download failures now show a message instead of failing silently.
- Another cover-art fix.

### Dec 15, 2025
- First version: FastAPI backend and a single-page UI.
- Added a screenshot to the README; clarified the Windows/Mac run steps; added a credits section.
- Pinned dependency versions so they install without conflicts.
- Added the **ETA countdown** and **folder accordions** in the downloads list.

### Oct 16, 2026
- **v2.0.0 released**: the first Windows installer is on the [Releases page](https://github.com/HoldenGrant/spotDLr-web_ui/releases/tag/v2.0.0) (`spotDLr-Setup.exe`, 92 MB). The build installed and started it on GitHub's Windows machine; search worked; the test download was blocked by YouTube's bot check, which happens to cloud machines, so downloads and lyrics get their first real Windows test on a home PC.
- **Lyrics.** In the Now Playing view, press **Lyrics** (or L) for lyrics that scroll along with the song: the current line lights up, and clicking any line jumps there. They come from LRCLIB, a free lyrics database. In a test of 40 random songs from the library, 38 had time-synced lyrics. Turn on **Include lyrics** in download settings and new downloads also save an `.lrc` lyrics file next to the song, for offline use and other players.
- **Picks up where you left off.** When you open spotDLr, it shows the playlist (or album, artist, genre) you were last playing, with that song in the player, paused at the same spot. Press play to continue.
- **Audio visualizer** in the Now Playing view, picked from a dropdown at the top right (or press V): **Bars**, **Wave**, **Ring** (the spectrum around a round cover), **Particles**, **Vinyl** (a spinning record with the cover as its label; the arm lifts when you pause), **Retro** (synthwave sun and mountains) or Off. Colours come from the cover, and the cover pulses with the bass.
- **Now Playing view.** Click the cover in the player bar (or the expand button by the volume) for a full view of the song: title, artist, album, a progress line, the genre as a tag, what's up next, and a vertical feed of covers. Scroll, use ↑/↓ or click the cover above or below to change songs. The background takes its colour from the cover.
- Playlists now include songs you already had. Before, downloading a 50-song playlist where 8 songs were already in your library showed only 42; the 8 stayed in their old folders. Each playlist folder now gets a `playlist.m3u8` that lists every song in the playlist's own order, with nothing copied twice.
- **Stats page** (chart icon, top right). Your library in numbers and charts: songs added per month, genres, top artists, release decades. Plus your listening: total time, top songs and artists, and a heatmap of when you listen, for the last week, month, 3 months, year or all time. spotDLr now remembers what you play (on your computer only).
- `SETUP.md` rewritten for the current app: the Windows installer, the Mac app, the from-source launchers, optional Spotify, and troubleshooting.

### Oct 15, 2026
- **Windows installer.** `spotDLr-Setup.exe` installs spotDLr like any Windows app (Start menu, own window, no Python or other setup), keeps music in **Music\spotDLr**, and is built and tested automatically on Windows by GitHub Actions; a version tag publishes it as a release.
- **Windows: open spotDLr like an app too.** Double-click `make_launcher.bat` once for a **spotDLr** Start-menu and Desktop shortcut that sets everything up and opens spotDLr in its own window (not yet tried on a real Windows PC).
- **spotDLr is an app now.** Open **spotDLr** from Applications, Launchpad or the Dock: it starts everything in the background and opens in its own window, with no Terminal and no `localhost:8000`. The project moved to `~/Projects/spotDLr-web_ui` (macOS blocks apps from reading Downloads).
- Spotify keys are optional at startup; the app no longer refuses to start without them.
- **Genres.** Home has a **Browse by genre** row (Pop, Alternative, Hip-Hop…), every genre opens as a playable playlist, and All songs has genre chips. Genres are found automatically for 96% of the library.
- Downloads that YouTube occasionally refuses ("403 Forbidden") are now retried automatically, and jobs with failed songs have a **Retry** button that fetches only what's missing.
- Album, playlist and artist covers load reliably: the app now fetches each cover once, caches it on your computer, and shows a placeholder if one is unavailable.
- Removed the "Spotify isn't connected" note from search and downloads: Spotify's API needs Premium now, and YouTube Music covers everything without it. Spotify stays available in Settings.
- **Works without Spotify.** Search now uses YouTube Music when Spotify isn't connected, and downloads come straight from YouTube Music. Pasted Spotify links still work: the app reads the song list from Spotify's public player and finds each song on YouTube Music (up to 100 songs per playlist).
- Spotify's February 2026 rules: the app explains when Spotify requires Premium on the app owner's account (instead of a bare "403"), keeps the keys, and starts working by itself once Spotify allows it. Playlists whose songs Spotify hides now say so.
- **Connect Spotify from the app.** Settings → Spotify connection takes your Client ID and Secret, tests them with Spotify, and saves them. No more editing `.env` by hand.
- Downloads now use your own Spotify keys. Before, spotDL quietly used its shared keys, which Spotify rate-limits, so downloads could hang.
- **Now a Spotify-style music library.** Dark UI with Home, Your Library (playlists, albums, artists, All songs), album/playlist/artist pages, and a bottom player with shuffle, repeat, seek, volume, keyboard shortcuts and Mac media keys.
- **Search Spotify from the top bar.** Every song shows a green ✓ if you already have it (matched by exact Spotify ID) or a download button; albums offer "Download N missing".
- **Download queue** with live progress, cancel, and the real reason when something fails. A download that produced nothing now shows as failed, not "completed".
- Seeking works in Safari (the server now answers HTTP Range requests).
- If the Spotify credentials stop working, the app says so up front instead of hanging, and your library still plays.
- **Mac:** double-click `run.command` to start. The launcher works from any folder, uses its own `.venv` (picking Python 3.10–3.13), and opens the browser.
- Downloads no longer freeze the server. Status polls, the file list and playback stay responsive while a download runs.
- Spotify credentials are no longer tracked in git (`.env`, `.cache`), and `run.ps1` reads `.env` instead of having the keys typed in.
- Wrote this Obsidian vault (`spotdl/`) from a full code read, and logged the open issues in [[Bug Log]].
