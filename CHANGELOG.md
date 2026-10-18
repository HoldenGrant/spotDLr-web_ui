# Changelog

What changed in each version of spotDLr, newest first. Downloads are on the [Releases page](https://github.com/HoldenGrant/spotDLr-web_ui/releases).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.2.0] - 2026-10-18

### Added
- **Full screen Now Playing.** The new button next to the visualizer menu (or the F key) fills the screen with the song, its cover or lyrics, and the visualizer. The controls and cursor fade after a few seconds without moving the mouse. Esc leaves full screen.
- **Add to Apple Music** (Mac). **⋯** on a song, album or playlist → **Add to Apple Music**. Lossless songs (FLAC, WAV) become Apple Lossless, and spotDLr checks every sample matches the original before adding them; AAC and MP3 go in as they are. Songs already in Apple Music are skipped, and a playlist can get a matching playlist in Apple Music.
- **Blind listening test.** **⋯** on any song → **Blind listening test**: can you hear the difference between the original and a compressed copy (AAC, MP3 or Opus, 64–320 kbps)? You hear A, B and a hidden X, say which X is, and after 10 rounds see how likely your score is from guessing alone. Works best with a lossless original (FLAC, WAV or Apple Lossless); spotDLr's own downloads are already compressed, and the test says so.

### Fixed
- The "running from source" line in Settings updates after a commit without restarting spotDLr.

## [2.1.0] - 2026-10-17

### Added
- **Like songs.** Tap ♥ on any song, in the player bar or in Now Playing. **Liked Songs** is at the top of Your Library.
- **Make your own playlists.** Click **+** next to Your Library → **New playlist**, then **⋯** (or right-click) on any song → **Add to playlist**. A playlist is a list of songs, so nothing is copied, and deleting a playlist never deletes songs.
- **Add your own music files.** **+** → **Add music files**, or drop files anywhere on the window (MP3, M4A, FLAC, WAV, OGG, Opus). Add them as they are, as **a new album** (the album name, artist, year and cover are written into the files, so every music player shows them as one album), or straight into one of your playlists.
- **Version number in Settings** (at the bottom), with a link to what's new. When running from source it also says whether your copy has changes since that version.
- **Send to device.** **⋯** on a song, album or playlist → **Send to device** copies it onto a plugged-in MP3 player or USB drive. It converts to MP3 by default, because many players can't play the .m4a files spotDLr downloads, keeps the playlist order, and only adds what's new when you send again.

### Fixed
- Screen readers now hear whether toggles such as Shuffle, Lyrics and ♥ are on or off.

## [2.0.1] - 2026-10-16

### Fixed
- **Windows:** on some PCs the spotDLr window opened on an empty "localhost" page. spotDLr now keeps running until the last spotDLr window is closed.

## [2.0.0] - 2026-10-16

The first version with a Windows installer, and a rebuild into a Spotify-style music library.

### Added
- **Windows installer** (`spotDLr-Setup.exe`). Installs like any Windows app, with no Python or other setup and no admin password. It opens in its own window from the Start menu, and keeps your music in **Music → spotDLr**.
- **Mac app.** Run `./make_launcher.sh` once, then open **spotDLr** from Applications, Launchpad or the Dock, in its own window.
- **Spotify-style library.** Home, Your Library (playlists, albums, artists, All songs), album, playlist and artist pages, and a player with shuffle, repeat, seek, volume, keyboard shortcuts and media keys.
- **Search and download without a Spotify account**, using YouTube Music. Pasted Spotify and YouTube Music links still download whole songs, albums and playlists (Spotify playlists: the first 100 songs). Songs you already have show a green check.
- **Genres.** Browse by genre on Home, a page for every genre, and genre chips on All songs.
- **Stats page.** Your library and your listening in charts: songs added per month, genres, top artists and songs, release decades, and when you listen.
- **Now Playing view.** Click the cover in the player bar for a full view of the song, with a scrolling feed of covers and a background tinted from the cover.
- **Visualizers** in Now Playing: Bars, Wave, Ring, Particles, Vinyl and Retro. Pick one from the menu, or press V.
- **Lyrics** that scroll along with the song. Click a line to jump there, or press L. **Save synced lyrics** in download settings also saves an `.lrc` file next to each new song.
- **Picks up where you left off.** Opening spotDLr shows the playlist you were playing, with the song paused at the same spot.
- **Spotify connection in Settings** (optional): paste your Client ID and Secret and spotDLr tests them before saving.
- **Download queue** with progress, cancel, the real reason when something fails, and **Retry** for only the songs that failed.

### Changed
- Spotify is optional. Since February 2026 Spotify's API needs a Premium account, so search and downloads use YouTube Music unless Spotify is connected.
- Spotify keys are no longer kept in the repository, and spotDLr no longer refuses to start without them.

### Fixed
- Downloading a playlist now includes songs you already had, in the playlist's order, without copying them again.
- Downloads no longer freeze the app while they run, and no longer hang on Spotify's shared, rate-limited keys.
- Seeking works in Safari.
- Covers load reliably, and missing ones show a placeholder.
- Downloads that YouTube occasionally refuses ("HTTP Error 403") are retried automatically.
- After an update, the app no longer keeps showing the old version until a hard reload.

## 1.x - 2025-12-15 to 2026-01-06

The original spotDLr: a web page for downloading with spotDL. These versions weren't tagged.

### Added
- A web interface for spotDL, with a FastAPI backend (Dec 15, 2025).
- A countdown (ETA) for downloads, and folders you can open and close in the downloads list.
- A mini player with previous/next/stop, seeking and auto-advance (Dec 18).
- An **Include lyrics** option.
- Mac support (`run.sh`), and FFmpeg installed automatically by the launchers (Dec 19).
- `run.bat` installs Python on Windows if it's missing.

### Changed
- The forest-green theme (Dec 19).

### Fixed
- Cover art on downloaded songs.
- Download failures show a message instead of failing silently.
- Reading `.env` in `run.bat`.
- Playlist and album folder names on macOS (Jan 6, 2026).

[Unreleased]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/HoldenGrant/spotDLr-web_ui/releases/tag/v2.0.0
