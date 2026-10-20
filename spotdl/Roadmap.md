# Roadmap

Completed work and remaining ideas; dated older proposals are retained as history. Related: [[Home]] · [[Launchers & Setup]] · [[Bug Log]]

---

## Done: phone access on the same Wi-Fi (option 1 below, Oct 19)

Built as **full** access for the owner's phone rather than play-only: downloads, likes, playlists and Tidy up work from the phone; only Spotify keys and phone access itself are computer-only. Option 2 (Tailscale) followed the same day: HTTPS through `tailscale serve`, so the QR code works away from home and "Add to Home Screen" installs it as an app. Still open: the Windows app keeping the server up with no window open on the PC, and testing Tailscale on Windows.

## Idea: companion player on a phone (noted Oct 16)

Play the computer's library from a phone or another device; the music stays on the Mac/Windows machine. Most of it exists already: the UI is a web page streaming from the server (`/api/stream` with Range support). Three things block it on purpose: the server listens only on `127.0.0.1`, the local-only guard accepts only `localhost`/`127.0.0.1`, and there is no login.

| Option | How the phone connects | Work | Away from home |
|---|---|---|---|
| **1. Same Wi-Fi** (recommended first) | `http://<computer's LAN IP>:8000` or a QR code shown in the app | small: listen on the LAN, pairing code, play-only access | no |
| **2. Tailscale** (recommended second) | free private network on both devices | almost none in spotDLr | yes |
| 3. Hosted web app + relay | desktop app connects out to a relay; the phone goes through it | large: run a server, and all audio passes through it | yes |

Things to design: keep the computer awake while sharing (and a background "keep sharing" mode, since the Windows app stops when its last window closes); a pairing code (scan a QR code once) plus **play-only** remote access (no downloads, no Settings/Spotify keys); HTTPS, which "Add to Home Screen" as an installed app needs (Tailscale can provide it). Bandwidth: 256 kbps ≈ 32 KB/s ≈ 7 MB per 3½-min song ≈ 115 MB/hour on mobile data; home upload easily covers it.

## Done: first Windows installer release (v2.0.0, then v2.0.1, Oct 16)

v2.0.0 built, installed and smoke-tested on GitHub's Windows machine, then published. Holden's first real-PC test found the window opening on a dead localhost (Edge handed the window to another process and spotDLr stopped its server; see [[Bug Log]]). v2.0.1 fixed it and is **confirmed working on Windows**. Releases: https://github.com/HoldenGrant/spotDLr-web_ui/releases

## Later: test the from-source Windows launcher on a real PC

Built Oct 15 but never run on Windows (no Windows machine here). First run: double-click `make_launcher.bat`, open spotDLr from the Start menu, and report any message box or the contents of `%LOCALAPPDATA%\spotDLr\spotDLr.log`. See [[Launchers & Setup#Windows: the spotDLr shortcut (launcher, from source)]].

## Done: native Mac app (Oct 20, 2026)

`make_launcher.sh` now builds `/Applications/spotDLr.app` from `launcher/macOS.swift`: Swift/Cocoa + Apple's WebKit, with a Dock icon, native menus, import file picker and fullscreen support. No Chrome or App Store account is needed to run it. It probes the local server and starts `run.sh` when necessary.

This replaces the **Oct 15 browser launcher** and the intermediate dedicated-Chrome-profile version. Those implementations and their memory measurements are historical. No native-app RAM benchmark has been recorded.

The current app remains tied to the project folder, Python environment and tools on this Mac; rebuild after moving the folder. Quitting the native app leaves the server running for downloads and phone access. Scheduled playback needs the designated client to remain running. See [[Launchers & Setup#spotDLr.app (native Mac app)]].

Verified on Oct 20: native build/signature, warm and cold startup, local-track playback/pause, synced lyrics, fullscreen entry/exit and opening/cancelling the import file picker. A self-contained distributable for other Macs is outside this local build.

## Done: lyrics for existing music (Oct 20, 2026)

Song menu → **Download lyrics**, or **Settings → Downloads → Download library lyrics** for the whole library. Available synced `.lrc` files are saved beside audio without replacing existing sidecars. The background pass exposes progress and failure counts. See [[Playback and Schedules#Saving lyrics for existing music]].
