# History

Development timeline from Git history and recorded working-tree changes, newest first. Larger days are grouped by topic; the groups do not imply an order within that day.

Related: [[Home]] · [[Bug Log]] · [[Documentation Log]]

Jump to: [[#2026]] · [[#2025]]

> [!note] Development history and releases
> Entries include uncommitted work. For versioned release notes, see `CHANGELOG.md`. Test results, timings, and library counts describe observations made at the time; arranging this note did not rerun those tests.

## 2026

### Oct 23, 2026
- **Cassette flip** (uncommitted): double-tap the phone deck to put its buttons on the left. Holden's idea.
- **Phone mini player** (uncommitted): Previous back, ♥ hidden.
- **Swipe left to like** (uncommitted): phones, any song list; heart panel follows the finger, pops on release, row springs back, and liked rows now show their ♥. Holden's idea. See [[Frontend]].

### Oct 21, 2026
- **v2.5.0 released**: Cassette visualizer, equalizer/reverb/balance, transform-based progress bars, and the yt-dlp freshness fix (weekly update + update before builds). Windows installer built by CI from the tag (its new update step logged yt-dlp 2026.08.19, solver 0.8.0). Mac DMG built locally with `installer/build_mac.sh` (relocation test passed; bundles yt-dlp 2026.08.19 + yt_dlp_ejs 0.8.0), uploaded with its checksum, and the website/README/SETUP/MAC links bumped.
- **Downloads 403 fix** (uncommitted): Claude had restarted :8000 with the system `python3`, whose 10-month-old yt-dlp got 403 on every song. Restarted it from `.venv`, then added `installer/update_ytdlp.py`. It runs before both builds and weekly from `run.sh`/`server.ps1`. A lasting 403 with an old yt-dlp now explains itself. See [[Bug Log]].
- **Cassette visualizer** (uncommitted): a portable stereo on phones and a hi-fi deck on computers, built from Holden's ChatGPT images with live reels, tape, buttons, VU needles, volume and a new balance knob; the audio graph now splits left/right for the meters and balance. Checked in headless Chrome (desktop, narrow window, iPhone portrait and landscape: every button, hold-to-wind, knobs, slider, keyboard, mode/lyrics switching, no console errors) and in WKWebView (routing measurements). See [[Frontend]].
- **Equalizer, reverb and balance** (uncommitted): Settings → Playback → Sound, on computers and Android (not iOS). The crossfade's outgoing player now goes through Web Audio too, so effects and balance reach it. Measured in Chrome and WKWebView. Final polish: the curve is drawn at the real playback rate (48 kHz, was 44.1), which fixed the drop after 15 kHz, and the section is one 560 px column on desktop. See [[Frontend]].
- **Progress bars** (uncommitted): all of them (uploads, send to phone, Apple import, album tidy, its job list, A/B test, the cassette's screen) fill with `setProgress()` → `--p` → `translateX`, instead of animating `width` (layout on every update; flagged by the design checker). Measured in Chrome: 0/25/50/100% exact, over 100% clamps, NaN shows empty.
- **v2.4.1 released** (bug fixes): the Mac app's volume slider after Now Playing (WebKit ignores `audio.volume` once audio goes through Web Audio; volume is now a GainNode), and full-width Particles/Retro controls on phones. See [[Bug Log]]. Committed, tagged and pushed from this session as HoldenGrant; Windows installer built by CI. Mac DMG built with `installer/build_mac.sh` (relocation test passed), checked (checksum, version 2.4.1, signature, both fixes inside the bundle), uploaded to the release; website/README/SETUP/MAC.md links moved from 2.4.0 to 2.4.1.
- **v2.4.0 released** (tag pushed by Holden; Windows installer built by CI). Mac DMG built locally with `installer/build_mac.sh` (its relocation test passed), checked (version 2.4.0, signature, checksum, new code inside), uploaded to the release, and the website/README/SETUP/MAC.md links moved from 2.3.1 to 2.4.0. **The Mac DMG is never built by CI**: every release needs this by hand.
- Fixed `.venv` scripts still pointing at `~/Downloads/spotDLr-web_ui` (29 files: `activate`, `pip`, …), which made VS Code report "Unable to handle .venv/bin/python".

### Oct 20, 2026

- **Native Mac app:** `launcher/macOS.swift` hosts the existing UI in Cocoa + Apple WebKit. `make_launcher.sh` compiles and ad-hoc signs `/Applications/spotDLr.app`, replacing the Chrome app-mode launcher. The window has a Dock presence, standard menus, import file picker and fullscreen support. It reuses the local Python server or starts `run.sh`; the server remains running after ⌘Q. The build remains tied to this Mac's project folder and runtime tools. See [[Launchers & Setup#spotDLr.app (native Mac app)]].
- **Native checks:** arm64 build/signature, installed warm launch, cold launch starting the server, library access (883 tracks at the time), local-track play/pause, synced lyrics, fullscreen entry/exit and opening/cancelling the native file picker. No new files were imported in the picker check; these checks do not claim that every feature or audio codec was retested.
- **Lyrics for existing music:** song ⋯ → Download lyrics; Settings → Downloads → Download library lyrics for all existing songs. Preserves existing `.lrc` files, saves available synced lyrics beside audio, and reports progress/outcomes from a background pass. Eight automated tests passed; HTTP checks covered saved/existing/unavailable/error outcomes and playback reading the saved sidecar. See [[Playback and Schedules#Saving lyrics for existing music]].
- **Stale-server diagnosis:** the first lyrics POST returned Method Not Allowed because the running server predated the new route. Restarting that server loaded the endpoint. Reopening the Mac window alone does not reload Python code.
- **Memory observations before the native build:** the earlier Chrome app-mode process tree plus Python measured about 1.1 GiB, including about 424 MiB in extension processes. A subsequent isolated Chrome-profile snapshot measured about 562 MiB including Python and no extension processes. These were different runtime snapshots, not controlled benchmarks or a measurement of the native WebKit app.
- **Documentation:** updated root setup/deployment guidance and the existing `spotdl/` architecture, API, roadmap and storage notes for the native app and existing-music lyrics. See [[Documentation Log]].

### Oct 19, 2026

#### Library, browsing, and stats

- **Sort Your Library:** Recents / Recently added / Alphabetical / Creator, from a button next to the library search (as in Spotify). Liked Songs and All songs stay pinned on top.
- **All songs: search, genre filter and sort.** Search box and sort menu on the action bar, sortable column titles, genre chips filter in place (they used to open the genre page).
- **Grid view** for song lists: a List/Grid switch on every local song page, remembered.
- **Stats by calendar period:** Today, This week, This month, Last month, This year, All time chips + a More menu (Yesterday, Last week, Last year, rolling 7/30/90 days and 12 months). Backend `stats.period()` with fair comparisons.
- **Tidy up page** (`#/tidy`, `cleanup.py`): duplicates (grouped by normalized title + main artist within 4 s, best copy ranked, merge rewrites m3u8s, moves likes/plays, files to the Trash) and album info (playlist-name albums looked up via `ytmusic.match_song`, reviewed, written with a backup; Undo). Real library: 47 songs with extra copies (59 files, 437 MB; 13 flagged 432 Hz/sped up) and 226 playlist-name albums, nothing changed yet.

#### Playback and schedules

- **Queue** (Play next / Add to queue, side panel, drag/keyboard reorder, saved with the session), **sleep timer**, **even out volume** (`loudness.py`, EBU R128 via FFmpeg, -14 LUFS, turn-down only), **crossfade** (spare `<audio>` plays the outgoing tail), **reorder and rename your playlists**.
- **Scheduled plays** (`schedules.py`, `#/schedules`): alarm-style plays per device, claimed once per occurrence on the server, fade-in, tap-to-play banner when autoplay is blocked; Windows window gets `--autoplay-policy=no-user-gesture-required`.
- **Swipe the Now Playing cover** up/down for next/previous (touch).
- **iPhone lock-screen playback:** no Web Audio on iOS (generated visualizer instead), volume features off where `audio.volume` is read-only; confirmed on the iPhone 13 Pro.

#### Phone layout

- **Phone layout audit + fixes:** 26 screens at 390 and 360 px had no overflow, but phones had no way to reach Your Library, tapping a row didn't play (▶ appears only on hover), and rows were cramped. Added the bottom tab bar (`#tabbar`, ≤600 px), the `#/library` page (`viewLibrary`, rendered by the same `renderLibraryInto` as the sidebar), tap-to-play on `(hover: none)`, lean rows (no header, number, ♥ or length on phones), `100dvh`.
- Fixed: on phones (≤600 px) Now Playing could only be opened by tapping the 56 px cover (the ⤢ button hides with the volume). Tapping the song in the player bar now opens it. Also fixed the top search box spilling under the Stats/Downloads buttons (a flex item's `min-width: auto` kept it 273 px wide in a 154 px column).
- **Phone layout from real screenshots:** visualizer kept low/faint under the song info, smaller long titles, landscape layout (≤500 px tall), notch/home-bar safe areas (`viewport-fit=cover`).

#### Phone access and Tailscale

- **Phone access** (`phone.py`): Settings toggle → a second server on the Wi-Fi address + a QR code with a pairing key; cookie after the first visit; a new key signs phones out. Disabling access also signed phones out in the initial implementation; a later update that day changed disabling to a pause, as recorded below. Tested with curl from the Wi-Fi address and a phone-sized Chrome; the QR decodes to the exact link.
- **Tailscale for phone access** (`tailscale.py`): `tailscale serve --bg --https=<443|8443>` → spotDLr, `.ts.net` Host treated as a phone (key required, Secure cookie); web app manifest, icons, `/sw.js` (offline page) for Add to Home Screen. Live-tested on this Mac's tailnet: Let's Encrypt cert, pairing, 898 songs, streaming, Chrome installability clean. Port 443 is taken here by Local's nginx (wp dev), so spotDLr serves on 8443.
- **Phone access fixes:** Wi-Fi link uses the Mac's `.local` name (the DHCP address changed three times in a day); the offline page offers the home link; turning phone access off is a pause (key and Tailscale kept); the Mac opens its own Wi-Fi/Tailscale addresses without a key.
- **Tailscale Funnel** option ("Also devices without Tailscale"): same address, public; built and tested with a stand-in CLI, left off on the real Mac.

#### Documentation

- Reviewed the current source and expanded the existing Obsidian vault: five new notes covering storage, downloads, playback/schedules, phone access, and the documentation log; six existing notes refreshed. See [[Documentation Log#2026-10-19 — Source-based documentation pass]].

### Oct 18, 2026

#### Playback and music tools

- **Full screen Now Playing:** a button next to the visualizer menu (or F). The controls fade when the mouse is still.
- Imported Reanimation into Apple Music as Apple Lossless (all 20 verified sample-identical), then built it in: **Add to Apple Music** on any song, album or playlist (Mac).
- **Blind listening test.** ⋯ on a song → Blind listening test: A (the original), B (compressed with AAC, MP3 or Opus at a bitrate you pick) and a hidden X. Say which X is, ten times, and see how likely your score is from guessing alone. It needs a lossless original to mean much; spotDLr's own downloads are already AAC 128, and the page says so.

#### Launcher fix

- Fixed reopening the Mac app showing "Port 8000 is being used by another app" about spotDLr itself (a slow Spotify check missed the launcher's 2 s deadline); new `/api/ping` for both launchers, and the status route never waits on Spotify.

#### Library maintenance

- Fixed Reanimation's tags from MusicBrainz (artists had become "101", "102"…; year 2022 → 2002; track numbers, official titles, the cover), after confirming from the spectrogram that the FLACs are genuinely lossless. Old tags backed up in `.backups/`.

### Oct 17, 2026

#### Versioning and releases

- **Version number in Settings** (bottom of the dialog), from `version.py`, with a "What's new" link to the changelog. The Windows build now refuses a version tag that doesn't match `version.py`.
- Added `CHANGELOG.md` (by version, Keep a Changelog format). Each GitHub Release now starts with that version's changelog section, above the install steps.

#### Library management

- **Like songs.** Tap ♥ on any song, in the player bar or in Now Playing. Liked Songs is at the top of Your Library.
- **Make your own playlists.** + next to Your Library → New playlist. Then ⋯ (or right-click) on any song → Add to playlist. Nothing is copied: a playlist is just a list, and deleting it never deletes songs.
- **Add your own music files.** + → Add music files, or drop files anywhere on the window. Add them as they are, or as **a new album**: the album name, artist, year and cover are written into the files, so every music player shows them as one album.
- **Send to device.** ⋯ on a song, album or playlist → Send to device copies it onto a plugged-in MP3 player or USB drive. It converts to MP3 by default, because many players can't play the .m4a files spotDLr downloads, and keeps the playlist order. Sending again only adds what's new.

### Oct 16, 2026

#### Releases

- **v2.0.1**: fixes the Windows app opening a window with nothing behind it on some PCs. The server now stays up until the last spotDLr window closes, instead of stopping when the first Edge process exits.
- **v2.0.0 released**: the first Windows installer is on the [Releases page](https://github.com/HoldenGrant/spotDLr-web_ui/releases/tag/v2.0.0) (`spotDLr-Setup.exe`, 92 MB). The build installed and started it on GitHub's Windows machine; search worked; the test download was blocked by YouTube's bot check, which happens to cloud machines, so downloads and lyrics get their first real Windows test on a home PC.

#### Now Playing and playback

- **Lyrics.** In the Now Playing view, press **Lyrics** (or L) for lyrics that scroll along with the song: the current line lights up, and clicking any line jumps there. They come from LRCLIB, a free lyrics database. In a test of 40 random songs from the library, 38 had time-synced lyrics. Turn on **Include lyrics** in download settings and new downloads also save an `.lrc` lyrics file next to the song, for offline use and other players.
- **Picks up where you left off.** When you open spotDLr, it shows the playlist (or album, artist, genre) you were last playing, with that song in the player, paused at the same spot. Press play to continue.
- **Audio visualizer** in the Now Playing view, picked from a dropdown at the top right (or press V): **Bars**, **Wave**, **Ring** (the spectrum around a round cover), **Particles**, **Vinyl** (a spinning record with the cover as its label; the arm lifts when you pause), **Retro** (synthwave sun and mountains) or Off. Colours come from the cover, and the cover pulses with the bass.
- **Now Playing view.** Click the cover in the player bar (or the expand button by the volume) for a full view of the song: title, artist, album, a progress line, the genre as a tag, what's up next, and a vertical feed of covers. Scroll, use ↑/↓ or click the cover above or below to change songs. The background takes its colour from the cover.

#### Playlists and stats

- Playlists now include songs you already had. Before, downloading a 50-song playlist where 8 songs were already in your library showed only 42; the 8 stayed in their old folders. Each playlist folder now gets a `playlist.m3u8` that lists every song in the playlist's own order, with nothing copied twice.
- **Stats page** (chart icon, top right). Your library in numbers and charts: songs added per month, genres, top artists, release decades. Plus your listening: total time, top songs and artists, and a heatmap of when you listen, for the last week, month, 3 months, year or all time. spotDLr now remembers what you play (on your computer only).

#### Documentation

- `SETUP.md` rewritten for the current app: the Windows installer, the Mac app, the from-source launchers, optional Spotify, and troubleshooting.

### Oct 15, 2026

#### Apps and launchers

- **Windows installer.** `spotDLr-Setup.exe` installs spotDLr like any Windows app (Start menu, own window, no Python or other setup), keeps music in **Music\spotDLr**, and is built and tested automatically on Windows by GitHub Actions; a version tag publishes it as a release.
- **Windows: open spotDLr like an app too.** Double-click `make_launcher.bat` once for a **spotDLr** Start-menu and Desktop shortcut that sets everything up and opens spotDLr in its own window (not yet tried on a real Windows PC).
- **spotDLr is an app now.** Open **spotDLr** from Applications, Launchpad or the Dock: it starts everything in the background and opens in its own window, with no Terminal and no `localhost:8000`. The project moved to `~/Projects/spotDLr-web_ui` (macOS blocks apps from reading Downloads).
- **Mac:** double-click `run.command` to start. The launcher works from any folder, uses its own `.venv` (picking Python 3.10–3.13), and opens the browser.

#### Search and downloads

- **Works without Spotify.** Search now uses YouTube Music when Spotify isn't connected, and downloads come straight from YouTube Music. Pasted Spotify links still work: the app reads the song list from Spotify's public player and finds each song on YouTube Music (up to 100 songs per playlist).
- **Search Spotify from the top bar.** Every song shows a green ✓ if you already have it (matched by exact Spotify ID) or a download button; albums offer "Download N missing".
- Downloads that YouTube occasionally refuses ("403 Forbidden") are now retried automatically, and jobs with failed songs have a **Retry** button that fetches only what's missing.
- Downloads now use your own Spotify keys. Before, spotDL quietly used its shared keys, which Spotify rate-limits, so downloads could hang.
- **Download queue** with live progress, cancel, and the real reason when something fails. A download that produced nothing now shows as failed, not "completed".
- Downloads no longer freeze the server. Status polls, the file list and playback stay responsive while a download runs.

#### Spotify connection

- Spotify keys are optional at startup; the app no longer refuses to start without them.
- Removed the "Spotify isn't connected" note from search and downloads: Spotify's API needs Premium now, and YouTube Music covers everything without it. Spotify stays available in Settings.
- Spotify's February 2026 rules: the app explains when Spotify requires Premium on the app owner's account (instead of a bare "403"), keeps the keys, and starts working by itself once Spotify allows it. Playlists whose songs Spotify hides now say so.
- **Connect Spotify from the app.** Settings → Spotify connection takes your Client ID and Secret, tests them with Spotify, and saves them. No more editing `.env` by hand.
- If the Spotify credentials stop working, the app says so up front instead of hanging, and your library still plays.

#### Library and playback

- **Now a Spotify-style music library.** Dark UI with Home, Your Library (playlists, albums, artists, All songs), album/playlist/artist pages, and a bottom player with shuffle, repeat, seek, volume, keyboard shortcuts and Mac media keys.
- **Genres.** Home has a **Browse by genre** row (Pop, Alternative, Hip-Hop…), every genre opens as a playable playlist, and All songs has genre chips. Genres are found automatically for 96% of the library.
- Album, playlist and artist covers load reliably: the app now fetches each cover once, caches it on your computer, and shows a placeholder if one is unavailable.
- Seeking works in Safari (the server now answers HTTP Range requests).

#### Security and documentation

- Spotify credentials are no longer tracked in git (`.env`, `.cache`), and `run.ps1` reads `.env` instead of having the keys typed in.
- Wrote this Obsidian vault (`spotdl/`) from a full code read, and logged the open issues in [[Bug Log]].

### Jan 6, 2026

- Fixed playlist/album folder naming on macOS.

## 2025

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
