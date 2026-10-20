# spotDLr: Local Deployment

This guide describes the current working tree, including unreleased native Mac and lyrics-save features. For first-time setup, use [SETUP.md](SETUP.md); for daily use, see [README.md](README.md). The display version remains `2.2.0`; this documentation update does not publish a release.

## Personal standalone Mac installer

`installer/build_mac.sh` builds an Apple Silicon `.app` and `.dmg` into `dist-mac/`.
It bundles Python, the interface, FFmpeg/ffprobe and Node.js, using the native
WebKit window and local ad hoc signing. No Developer ID or notarization is used.
It requires macOS 15+ at runtime, reflecting its bundled FFmpeg. See
[installer/MAC.md](installer/MAC.md) for build requirements and isolation testing.

The packaged app starts its own backend on a free local port, normally 8001, and
remembers that port. Its ready-file handshake avoids attaching to the source
server. Closing the window leaves the app running; ⌘Q terminates the owned backend.
Data is separate from the source build: music in `~/Music/spotDLr/`, settings and
caches in `~/Library/Application Support/spotDLr/`. Logs remain in
`~/Library/Logs/spotDLr.log`. Updating the app does not overwrite those folders.
No personal files are included in the DMG. This build is local and is not uploaded
to GitHub Releases automatically.

## Native Mac app from source

Requirements: macOS 12.3+, Xcode Command Line Tools or Xcode to build, Python 3.10–3.13 for the source runtime, FFmpeg, and Node.js for YouTube downloads.

Keep the project in a location such as `~/Projects/spotDLr-web_ui`, then run:

```bash
./make_launcher.sh
```

This builds and ad-hoc signs `spotDLr.app` in `/Applications` (or `~/Applications` if the existing destination is not writable). Pass a destination folder as the first argument to install elsewhere. Open it from Applications, Launchpad, Spotlight or the Dock.

The native executable is compiled from `launcher/macOS.swift` and hosts the existing web interface using Cocoa + Apple WebKit. No Chromium browser or App Store account is needed at runtime. The bundle records the project folder and executable PATH. Rebuild after moving the project or changing those tool paths.

This is a local build for the architecture of the build Mac, not a self-contained app for distribution to other computers. It uses the source folder, `.venv`, external FFmpeg/Node.js and existing music. Those files are not copied into the bundle.

### Startup and quitting

- Probes `http://127.0.0.1:8000/api/ping` and reuses a responding spotDLr server.
- If none responds, starts `run.sh` with `SPOTDLR_NO_BROWSER=1`; the script prepares/reuses `.venv` and executes `app.py`.
- Shows a loading view during startup and a native alert on failure. Server output appends to `~/Library/Logs/spotDLr.log`.
- Closing the window leaves the native app running; its Dock icon reopens the window. ⌘Q quits the native client and leaves Python running for downloads and phone access.
- Scheduled playback requires the designated client to remain running; a background server alone cannot play music.
- WebKit preferences, playback sessions and schedule device IDs are separate from Chrome and are not migrated automatically. Music, playlists, likes and saved schedules remain server-side.

## Terminal/browser mode on Mac or Linux

```bash
./run.sh
```

The launcher selects Python 3.10–3.13, manages `.venv`, checks FFmpeg, loads optional `.env` settings, and opens a browser unless `SPOTDLR_NO_BROWSER` is set. The Mac `run.command` opens this path in Terminal. The server listens on `127.0.0.1:8000`; an unrelated process on that port must be resolved before starting.

## Windows

The [Windows installer](https://github.com/HoldenGrant/spotDLr-web_ui/releases) bundles its runtime and uses `desktop.py`, with an Edge/Chrome app-mode window and its own browser profile. It can select ports 8000–8010 and stops its server after the last client window expires. This differs from the native Mac app's background-server behavior.

From-source shortcuts are created by `make_launcher.bat`; `run.bat` remains the console alternative. See [SETUP.md](SETUP.md). The native Mac conversion does not change Windows packaging.

## Files and settings

Source builds, including the source-dependent native Mac launcher, use `<project>/downloads/` for music and the project folder for settings/caches. The standalone Mac app uses `~/Music/spotDLr` and `~/Library/Application Support/spotDLr`. The frozen Windows installer uses the user's `Music/spotDLr` and `%LOCALAPPDATA%/spotDLr`.

`paths.py` supports `SPOTDLR_MUSIC_DIR` and `SPOTDLR_DATA_DIR` in the process environment. Set them before Python starts; `run.sh` also loads `.env` before executing Python. Spotify credentials are optional and can be entered in Settings → Spotify connection. Search and downloads fall back to YouTube Music when Spotify is unavailable.

## Updating a running installation

1. Finish active music downloads and lyrics-save passes before stopping Python; their job/progress records are in memory and do not resume automatically after a restart.
2. Update project files. Rebuild `spotDLr.app` with `make_launcher.sh` when its native wrapper, project path or recorded executable PATH changes.
3. Quit the native client with ⌘Q, then identify the running server with `lsof -nP -iTCP:8000 -sTCP:LISTEN` on the Mac. Stop only the confirmed spotDLr process, then reopen the app to start the updated server. ⌘Q alone does not stop it.
4. Refresh ordinary browser clients. A new frontend talking to an old backend can return **Method Not Allowed** for new operations such as lyrics saving.

Completed audio and `.lrc` files persist. Rerunning a library lyrics-save pass skips existing sidecars. Lyrics actions use `POST /api/lyrics/{track_id}`, `POST /api/lyrics/save-library`, and `GET /api/lyrics/save-status`; they are separate from the music download queue.

## Local and phone access

The main server uses a host/origin guard. Phone access is enabled through Settings and QR pairing, optionally with Tailscale; it is not an unrestricted LAN listener. Keep this configuration when using the local app. See [Phone Access](spotdl/architecture/Phone%20Access.md).

For the current routes and response fields, see [API Reference](spotdl/architecture/API%20Reference.md). The legacy `/api/status`, `/api/downloads`, and `/api/download/{filename}` routes are no longer used.
