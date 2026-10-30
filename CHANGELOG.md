# Changelog

What changed in each version of spotDLr, newest first. Downloads are on the [Releases page](https://github.com/HoldenGrant/spotDLr-web_ui/releases).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.6.0] - 2026-10-31

### Added
- **Remote playback and Listen Here.** A connected phone can play independently, control the Mac or PC running spotDLr, or transfer the current song, timestamp, queue, shuffle and repeat state between devices. Remote controls include play/pause, previous/next, seek, volume, queue, shuffle and repeat.
- **Phone app caching** keeps the interface and up to 150 recently viewed covers available on the phone. Music streams and live library data still come from the source computer.
- **Surface styles** in Settings → Appearance: Glass, Liquid Glass, Neumorphism, Skeuomorphism, Claymorphism, Minimalism and Neo-brutalism, alongside Solid. Glass styles include adjustable transparency; custom colors can pair an accent with a readable text and icon color.
- **Day/night appearance schedules** in Settings → Appearance: light by day and dark at night, or the reverse, with adjustable start times using this device's local clock. **Custom colors** can be picked or entered as hex, named, and saved beside the six presets; matching light/dark variants keep controls readable.
- **Add to album** in a song's menu lets you group it under an existing album in spotDLr. The original file, tags, likes and playlists stay unchanged; albums keep their name and artist when songs are added.
- **Swipe left to like (phones).** Swipe a song left in any song list and let go to save it to Liked Songs. A green panel with a heart follows your finger, the heart pops when you let go, and the row springs back. Swipe a liked song the same way to remove it. A short swipe springs back without changing anything, and scrolling up and down works as before.
- **Liked songs show their ♥ on phones**, next to ⋯, so you can see what you've liked at a glance.
- **Cassette on phones:** double-tap the deck to turn it round, so its buttons are on the left instead of the right (handy for your left hand). Double-tap again to turn it back; your phone remembers which way you like it.

### Fixed
- **Remote controls respond faster:** the source player now waits for commands instead of relying on a fixed polling delay, and Listen Here preloads the current track before transfer.
- **Updates preserve the existing library and appearance.** On first launch, the standalone Mac build reuses a populated source library and copies its supporting data; it also recovers saved WebKit preferences and custom colors from the previous launcher where available.
- **Light theme system bars:** the native Mac title bar and the phone's browser or installed-app status area now follow spotDLr's resolved light or dark theme, including System and day/night schedules.
- **Phone playback** now recovers when a mobile browser leaves a song's Wi-Fi stream stalled without reporting an error. After eight seconds without progress, spotDLr reconnects at the same position; a stall at the final frame advances the shuffled queue.
- If Add to album is opened while an older server is still running, the error now explains that the spotDLr server needs restarting instead of only saying “Not Found”.

### Changed
- **Phones:** the mini player at the bottom shows **Previous** again, instead of the ♥. Like a song from Now Playing, or by swiping it left in a list.
- Download cards keep album and playlist artwork aligned with the top of expanded details. Completed collections now have a play button on the far right.
- On desktop, the library sidebar can collapse to a cover-only rail and expand again. The toggle remembers your choice, and hovering over a cover shows its name.
- On phones, inner pages now show a visible Back button in the top bar. Album and playlist download buttons use an icon with an accessible label; desktop buttons keep their text.
- The website's Mac buttons, README and setup guide now download the **v2.6.0** Mac DMG, attached to the v2.6.0 release with its checksum.

## [2.5.0] - 2026-10-21

### Added
- **Cassette visualizer.** Pick **Cassette** from the visualizer menu and Now Playing becomes a working tape deck. On phones it's a portable stereo that fills the screen (shown sideways with the phone upright; turn the phone and it stands up), with the song title handwritten on the cassette. On computers it's a hi-fi deck with the cover, the song and a progress bar you can drag. On both:
  - The reels turn like real ones: tape winds from one reel to the other as the song plays, and the thin reel spins faster than the full one.
  - **PLAY**, **PAUSE** and **STOP** work, and the one that matches what the deck is doing lights up. A quick press of **REWIND** or **FAST-FORWARD** goes to the previous or next song; hold it to wind through the song, faster the longer you hold.
  - **VOL** (a slider on the portable, a knob on the deck) sets the volume, and **POWER** closes Now Playing.
  - ♥, shuffle and repeat move to the top bar.
- **Equalizer, reverb and balance** in **Settings → Playback → Sound**:
  - **Equalizer:** 6 bands (60 Hz to 15 kHz, ±12 dB), shown as a curve you drag, or set with the arrow keys. The curve passes through every dot and is exactly what you hear (measured within 0.05 dB). 14 presets, from Bass booster and Vocal booster to Small speakers and Spoken word, plus Reset. Boosting turns everything down by the same amount first, so a boost can't distort (Settings says by how much).
  - **Reverb** adds the echo of a Small room, Studio, Concert hall or Cathedral, with an amount slider. The loudness stays about the same.
  - **Balance** shifts the sound left or right.
  - All three work on computers and Android, apply during crossfades too, and are remembered on each device. On iPhone and iPad, Safari would stop the music when the screen locks, so the section explains that instead.
- **The hi-fi deck's VU meters** show the left and right channels separately, with needles that swing like real ones, and its **BALANCE** knob shifts the sound left or right. Balance is remembered. Knobs turn by dragging, the scroll wheel or the arrow keys. On iPhone and iPad, Safari doesn't allow volume or balance changes, so those controls explain that instead, and the meters follow a generated pattern like the other visualizers.

### Fixed
- **Downloads failing with "HTTP Error 403: Forbidden"** on every song. YouTube had changed, and the copy of yt-dlp (the YouTube downloader) in use was 10 months old. It got picked up because spotDLr had been started with a plain `python3 app.py` instead of spotDLr.app or `run.sh`. To keep yt-dlp current:
  - spotDLr.app, `run.sh` and the Windows launcher now update yt-dlp once a week when started.
  - The Mac and Windows builds update it before packaging.
  - When YouTube still refuses a song and yt-dlp is over 90 days old, the error says so and how to fix it.

### Changed
- The website's Mac buttons, README and setup guide now download the **v2.4.1** Mac DMG, attached to the v2.4.1 release with its checksum.

## [2.4.1] - 2026-10-21

### Fixed
- **Mac app:** the volume slider stopped working after Now Playing had been opened (and with it even volume, crossfade and the sleep timer's fade). With a visualizer on, the volume is now applied inside the audio engine, so it works in every browser and in the Mac app.
- **Phones:** on the Particles and Retro visualizers, the song info and controls only filled two-thirds of the screen.

### Changed
- The website's Mac buttons, README and setup guide now download the **v2.4.0** Mac DMG, attached to the v2.4.0 release with its checksum.

## [2.4.0] - 2026-10-21

### Added
- **Open folder** from album and playlist menus, **Show in Finder** (or **Open containing folder**) from song menus, and **Open music folder** on Downloads. These actions are available on the computer running spotDLr.
- **Light, Dark and System appearance** in **Settings → Appearance**, with readable accent colors in both modes. System follows device changes automatically; preferences are saved on each device.
- **Theme colors** in **Settings → Appearance**: Green, Blue, Purple, Rose, Amber and Teal. Buttons, highlights and charts update immediately, and the choice is remembered on each device.
- **Delete song** in a library song's ⋯ menu. After confirmation, its audio and saved lyrics move to the Trash or Recycle Bin (or the recoverable Removed songs folder). Playlist entries, likes and the playback queue are updated.

### Fixed
- **Add to playlist** now lists downloaded playlists alongside playlists created in spotDLr. Songs are added as playlist references without moving or copying audio; albums remain separate.
- Regular YouTube and youtu.be links now download the exact video instead of searching for the URL as text and selecting an unrelated song. The search bar also recognizes these links, and track tags must match the requested video ID.

### Changed
- **Now Playing fills the whole window**, player bar included, and has its own controls under the ♥: a seek bar, shuffle, previous, play/pause, next, repeat, and volume on computers.
- Settings now shows one tab at a time: Appearance, Playback, Downloads, Spotify, Phone access and About. Tabs and Close stay visible while a section scrolls; arrow keys, Home and End navigate tabs.
- The website's Mac buttons now download the v2.3.1 Apple Silicon DMG directly from GitHub Releases, with macOS requirements and installation help. The verified DMG and checksum are attached to the existing release.

## [2.3.1] - 2026-10-20

### Added
- **Personal standalone Mac installer.** `installer/build_mac.sh` builds an ad hoc signed Apple Silicon app and drag-to-Applications DMG with Python, FFmpeg, ffprobe and Node.js included. Its native window owns a backend on a free local port; settings live in Mac Application Support and music in `~/Music/spotDLr`. Includes relocation/isolation smoke tests. Requires macOS 15+; the build script does not notarize or upload automatically.
- **Native Mac app.** `make_launcher.sh` now builds a Swift/Cocoa app using Apple's WebKit, with a Dock icon, standard menus, file picker, fullscreen support and automatic local-server startup. It uses the existing project and Python environment; no browser or App Store account is needed to run it. Mac interface preferences are separate from the former Chrome window.
- **Lyrics for existing music.** Choose **Download lyrics** from a song's ⋯ menu, or **Settings → Downloads → Download library lyrics** for a background library pass. Saves available synced `.lrc` files beside the audio, preserves existing sidecars, and reports saved/existing/unavailable/failed counts.
- **Sort Your Library.** The button next to "Search in Your Library" sorts it by **Recents** (what you played last comes first), **Recently added**, **Alphabetical** or **Creator** (by artist). Liked Songs stays on top, and spotDLr remembers your choice.
- **Search, filter and sort All songs.** Search by title, artist or album ("linkin numb" finds Numb). Tap a genre to show only those songs, and tap it again to show everything. Sort by date added, title, artist, album or length from the menu, or click a column title (click it again to reverse). Play then plays the list as you see it.
- **Grid view.** The ☰ / ▦ buttons on the right of any song list (All songs, playlists, albums, Liked Songs, artists, genres) switch between the list and a grid of covers. Hover a cover (or on a phone, tap its ▶) to play; ♥ and ⋯ are under each one. spotDLr remembers your choice.
- **Stats by calendar period.** Listening on the Stats page can now show **Today**, **This week**, **This month**, **Last month**, **This year** or **All time**, and under **More**: Yesterday, Last week, Last year and the last 7, 30 or 90 days or 12 months. The dates are shown under the buttons, Today's chart goes hour by hour, and the ▲/▼ compares like with like: this month so far against last month up to the same day and hour, and a finished period against the whole one before it.
- **Tidy up your library** (Stats → Tidy up, or Settings). **Duplicates:** songs you have more than once, with the best copy suggested (lossless, quality, cover, real album info) and a ▶ to listen to each. Keep one and the others go to the Trash (Recycle Bin on Windows); playlists switch to the copy you keep, and likes and play counts move over. Songs with a 432 Hz or sped-up copy are never merged without you looking first. **Album info:** songs whose album is a playlist's name ("Green Day Radio") are looked up on YouTube Music for the real album, artist, year and cover. You tick which to fix, and **Undo** puts the old info back.
- **Queue.** ⋯ on a song → **Play next** or **Add to queue** (or a whole playlist from its ⋯). The queue button in the player bar (or Q) shows what's playing, your queue and what's next from the playlist. Drag songs to reorder them (or use the arrow keys), ✕ to remove, and click any song to jump to it. In Now Playing, tap "Up next" to open it.
- **Sleep timer.** The moon in the player bar (and in Now Playing): pause after 5 minutes to an hour, fading out over the last 10 seconds, or at the end of the song.
- **Even out volume** (Settings → Playback). Every song plays at about the same loudness, like Spotify's "Normalize volume": loud songs are turned down, nothing is boosted. spotDLr measures each song once, in the background.
- **Crossfade** (Settings → Playback): blends the end of each song into the next, up to 12 seconds.
- **Reorder and rename your playlists.** Drag a song by its ⠿ handle (or use the arrow keys on it) in a playlist you made. ⋯ → **Rename** changes its name.
- **Phone access.** Settings → **Phone access** → scan the QR code with your phone's camera to use spotDLr in the phone's browser, on the same Wi-Fi. Music plays on the phone, streamed from your computer. Only phones that scanned the code get in; **New QR code** signs them all out; turning access off only pauses it, retaining pairing for when it is turned on again. Spotify keys and phone access itself can only be changed on the computer.
- **Phone access away from home, with Tailscale.** If Tailscale is on this computer and your phone (free, same account), tick **Also away from home** in Phone access: the QR code then opens spotDLr over HTTPS anywhere your phone has a connection, privately (only your devices can reach it). **Add to Home Screen** turns it into an app with its own icon, and if your computer is off or asleep it says so instead of a browser error.
- **Phone layout like Spotify's app.** A tab bar at the bottom (**Home · Search · Your Library**), and a full **Your Library** page with its filters, search, sort and **+** (new playlist, add files), which phones couldn't reach before. **Tap a song to play it**, and song lists show the title, artist and ⋯ (♥ is in ⋯), so titles aren't cut short.
- **Swipe the cover in Now Playing** (phones and tablets): up for the next song, down for the previous one. The cover follows your finger and springs back if you let go early; a quick flick is enough.
- **Schedule a play**, like an alarm: **⋯** on a song, album or playlist → **Schedule play**, then pick a time and once, every day, weekdays, weekends or your own days. It can shuffle and start quietly, fading in over a minute. It plays on the device you scheduled it on, if spotDLr is open there (on iPhone, on screen). See them all under **Scheduled plays** (in the sleep-timer menu and Settings), with an on/off switch each.
- **Phone access for devices without Tailscale** (Tailscale Funnel, off unless you turn it on): the same Anywhere address becomes reachable from the internet, so any phone or tablet with the QR code can use spotDLr anywhere, no app needed. Everyone else only sees "Scan the QR code".

### Changed
- On All songs, the genre buttons now filter the list instead of opening the genre's page (the page is one click away, next to the song count).

### Fixed
- **Windows release contents.** The installer now includes the app updates listed above. The v2.3.0 tag was created before those source changes were committed, so its installer contained the previous app code.
- **Phones:** the visualizer's bars covered the song title, ♥ and progress in Now Playing; long playlist names filled the screen; held sideways, the player bar was cut off and the Now Playing cover ran past its panel; and content didn't keep clear of the iPhone's notch and home bar.
- **Phones:** the Stats page cut off long totals ("54 hr 41 …"), and the page height now leaves room for the browser's own toolbars.
- **iPhone and iPad:** music stopped when the screen locked after Now Playing had been opened. Safari suspends the audio processing the visualizers listen through, so on iOS spotDLr no longer routes music through it: playback continues with the screen off, and the visualizers follow a generated pattern there (the menu says so). Even volume and crossfade are off on iOS, where Safari doesn't let pages change the volume.
- **Phone access:** opening the phone links on the computer running spotDLr asked for the QR code. The computer now opens its own Wi-Fi and Tailscale addresses directly.
- **Phone access:** turning it off signed every phone out and dropped the Tailscale address, so turning it back on meant scanning again on every phone. It's now a pause: nothing can connect while it's off, and phones get straight back in when it's on again. **New QR code** is the way to sign phones out.
- **Phone access:** the Home Wi-Fi link used the computer's number address, which the router changes now and then (three times in one day here), so saved links stopped working. On a Mac it now uses the computer's network name (like `Holdens-MacBook-Pro.local`), which stays the same. And when the Tailscale address can't be reached (Tailscale off on the phone), the "Can't reach your computer" page offers the home Wi-Fi link.
- **Phone access:** restarting spotDLr could move the Wi-Fi address to another port (8001), breaking phones' bookmarks. It now waits for its usual port.
- Saving Spotify keys in Settings no longer hides the version number and the Apple Music option until the app is reloaded.
- **Phones:** there was no way to open Now Playing (and its visualizers and lyrics) except tapping the small cover. Tapping the song anywhere in the player bar now opens it, as in Spotify's app.
- **Phones:** the search box at the top ran underneath the Stats and Downloads buttons.
- **Mac:** reopening spotDLr could say "Port 8000 is being used by another app" about spotDLr itself, when its connection check was slow (for example just after the Mac wakes up). It now recognises its own server and waits for it.
- **Windows:** the same slow check could start a second copy of spotDLr on another port. It now finds the running one.

## [2.3.0] - 2026-10-20

### Changed
- Updated the version and release notes. This tag preceded the app implementation commit; use v2.3.1 for the features and fixes listed above.

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

[Unreleased]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.6.0...HEAD
[2.6.0]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.4.1...v2.5.0
[2.4.1]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.3.1...v2.4.0
[2.3.1]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/HoldenGrant/spotDLr-web_ui/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/HoldenGrant/spotDLr-web_ui/releases/tag/v2.0.0
