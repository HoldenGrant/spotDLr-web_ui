---
tags: [spotdlr, architecture, storage]
updated: 2026-10-20
---

# Data and Storage

The music folder is the library. Audio tags supply metadata; JSON, JSONL, and M3U8 files hold the remaining state. There is no database.

Related: [[Home]] · [[Backend]] · [[Search and Downloads]] · [[Playback and Schedules]]

## Directory selection

`paths.py` selects directories before `app.py` loads `.env`.

| Location | Running from source | Windows installer |
|---|---|---|
| `APP_DIR` | Repository directory | PyInstaller resource directory |
| `MUSIC_DIR` | `<repo>/downloads/` | User's Music folder + `spotDLr/` |
| `DATA_DIR` | Repository directory | `%LOCALAPPDATA%/spotDLr/` |

`SPOTDLR_MUSIC_DIR` and `SPOTDLR_DATA_DIR` override the writable directories. Set them in the process environment before launch; for direct `python app.py`, putting them only in `.env` is too late for `paths.py`. The shell launcher sources `.env` before starting Python.

## Persistent files

Paths below are relative to `DATA_DIR` unless stated otherwise.

| File or directory | Contents / owner |
|---|---|
| `MUSIC_DIR` | Audio files, embedded tags/covers, optional `.lrc` sidecars |
| `MUSIC_DIR/<folder>/playlist.m3u8` | Ordered references to songs; `downloader.write_playlist` |
| `.env` | Optional Spotify credentials and environment settings; `app._write_env` |
| `likes.json` | Track IDs and like timestamps; `organize.Likes` |
| `plays.jsonl` | One JSON object per accepted listen; `stats.Plays` |
| `.genres.json` | Song/album genre lookup cache; `genres.Genres` |
| `.lyrics/` | Lyrics lookup cache; `lyrics.Lyrics` |
| `.imgcache/` | Remote cover bytes and MIME sidecars; `app.remote_image` |
| `loudness.json` | Track ID → modification time, size, LUFS, peak; `loudness.Loudness` |
| `schedules.json` | Saved schedules and their last claimed occurrence; `schedules.Schedules` |
| `phone.json` | Phone access options and pairing key; `phone.PhoneAccess` |
| `tag-backups/` | Album-tag/cover backups before applying fixes; `cleanup.AlbumFixer` |
| `Removed songs/` | Fallback destination when duplicate files cannot be moved to Trash |
| `.abx/` | Temporary blind-test WAV clips; session metadata stays in memory |
| `browser-profile/` | Dedicated Chromium profile used by `desktop.py` and the superseded Mac browser launcher; the native Mac app uses WebKit website storage |
| `spotDLr.log` | Desktop executable log; the Mac launcher instead uses `~/Library/Logs/spotDLr.log` |

Apple Music preparation files live separately in `~/Music/spotDLr for Apple Music/<collection>/`.

## Track identity

`library._read_track` produces an ID from `sha1(relative_path)[:16]`. It stays the same when tags change, but changes when a file moves or is renamed. Likes, schedules, playback sessions, and playlist references depend on these identities or paths.

The supported audio extensions are `.mp3`, `.m4a`, `.flac`, `.opus`, `.ogg`, `.wav`, and `.aac`. Tags fall back to the filename when unreadable or missing. `added` is the file's modification time, not a separate import timestamp: editing tags can change its position in Recently added.

Source IDs are optional: Spotify and YouTube URLs are extracted from tags where available. The frontend ownership lookup checks the source ID first, then normalized title + main artist.

## Collections and playlists

`Library.snapshot()` returns tracks and one collection per top-level music folder.

- A non-editable collection whose songs share one album tag is shown as an album.
- Other collections are playlists.
- A folder with `playlist.m3u8` and no audio of its own is an editable user playlist, including when empty.
- M3U8 entries set the order and may reference songs in another folder, such as `../Album/song.m4a`.
- Files owned by the folder but absent from the M3U8 are appended to the collection.
- Deleting an editable playlist removes its list, leaving the referenced music files in place.

Example layout:

```text
downloads/
├── Example Album/
│   ├── Artist - First Song.m4a
│   └── Artist - First Song.lrc
└── Morning Mix/
    └── playlist.m3u8
```

```m3u
#EXTM3U
../Example Album/Artist - First Song.m4a
```

## What a restart loses

Audio, playlists, likes, history, schedules, phone options, and disk caches persist. The download queue/job records, lyrics-save pass progress, export job records, Apple Music job records, ABX session metadata, and open-window registrations are held in memory. A restart does not resume an unfinished queue.

The frontend stores preferences and paused playback sessions under `spotdlr.*` in browser `localStorage`. This belongs to the browser profile and origin: a different hostname, port, browser, or phone can have different settings and schedule device identity.

The native Mac app uses WebKit's persistent website storage, separate from Chrome's profile and the prior `localhost` browser origin. Its preferences, paused session and schedule device identity are not migrated automatically; existing server-side audio, playlists, likes and schedules remain. An older schedule still targets its original device ID. Closing the native window keeps the app running; ⌘Q quits the native client but leaves Python running. A server restart interrupts a lyrics-save pass, while completed `.lrc` files remain and are skipped on the next pass.

## Cleanup behavior

Duplicate merging updates playlist references, likes, and listening-history IDs before moving removed audio and `.lrc` files to Trash/Recycle Bin, with `Removed songs/` as fallback. The duplicate tool suggests a copy; it does not compare decoded audio samples.

Album fixes save the old album, album artist, date, and cover before writing accepted changes. Undo restores the newest available backup and marks it `.undone`. These backups cover album-fix changes, not every metadata edit or duplicate merge.

## Source references

`paths.py`; `library.py`: `Library.scan`, `_read_track`, `_read_playlist`, `_collections`; `downloader.py`: `write_playlist`; `organize.py`: `Likes`, playlist helpers; `stats.py`: `Plays`; `cleanup.py`: `merge`, `AlbumFixer`; `static/app.js`: `store`, `saveSession`, `DEVICE_ID`.
