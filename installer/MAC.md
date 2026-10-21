# Personal Mac installer

Build for the Apple Silicon Mac using the current working tree:

```sh
.venv/bin/python -m pip install pyinstaller==6.22.3
./installer/build_mac.sh
```

Build requirements: macOS on Apple Silicon, Xcode Command Line Tools, the project's
Python environment with `requirements.txt` installed, and `ffmpeg`, `ffprobe` and
`node` on PATH. The build copies these tools; PyInstaller collects and relocates
their shared libraries. Runtime minimum is macOS 15 because the current Homebrew
FFmpeg requires it. Intel builds and older macOS versions are not validated.

Outputs:

- `dist-mac/spotDLr.app`
- `dist-mac/spotDLr-<version>-mac-arm64.dmg`
- `dist-mac/spotDLr-<version>-mac-arm64.dmg.sha256`

The v2.5.0 DMG is available on [GitHub Releases](https://github.com/HoldenGrant/spotDLr-web_ui/releases/tag/v2.5.0) and linked from the website. The build does not upload automatically: verify the app, upload the DMG and checksum, then update the website's pinned Mac URLs.

Open the DMG and drag the app onto Applications. The build does not replace the
currently installed source launcher or move its music. See [SETUP.md](../SETUP.md#mac-personal-standalone-installer)
for storage paths and copying your existing collection.

`launcher/macOS.swift` hosts Apple WebKit. Packaged mode launches the nested
PyInstaller helper at `Contents/Helpers/spotDLr-server.app`; source mode continues
to use `run.sh`. The helper imports the bundled app and listens on loopback. It
announces its port with a per-launch ready file only after server startup. It
prefers the last successful port (8001 initially), choosing another if occupied.
The native app only connects after that handshake. ⌘Q terminates its own helper;
closing and reopening the window does not restart the backend.

Music defaults to `~/Music/spotDLr/`; writable data goes to
`~/Library/Application Support/spotDLr/`. Logs go to `~/Library/Logs/spotDLr.log`.
`SPOTDLR_DATA_DIR` and `SPOTDLR_MUSIC_DIR` remain available for isolated tests.
No source paths, `.env`, music, likes or history are copied into the app.

The build verifies local ad hoc signatures and automatically runs:

```sh
.venv/bin/python installer/test_mac_build.py dist-mac/spotDLr.app
```

This relocates a copy to a temporary path containing spaces and tests with a
temporary home directory, a minimal PATH, and sandbox rules denying the project,
Homebrew, `/usr/local`, and external Python. It checks the bundled tools, server
readiness, interface assets, library scan, ranged audio streaming, likes storage,
and clean backend shutdown. It uses generated test audio, not personal music.

The native window and mounted disk image also need a manual check after packaging.
The DMG is compressed, includes an Applications shortcut, and has a SHA-256 file.
It is not uploaded or published by the build. Developer ID signing, notarization,
an automatic updater, and App Store distribution are outside this personal build.
