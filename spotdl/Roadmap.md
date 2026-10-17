# Roadmap

Planned work, not started. Related: [[Home]] · [[Launchers & Setup]] · [[Bug Log]]

---

## Idea: companion player on a phone (noted Oct 16, not started)

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

## Done: open spotDLr like an app (no typing `localhost:8000`)

**Built Oct 15, 2026:** `/Applications/spotDLr.app`, made by `make_launcher.sh`. See [[Launchers & Setup#spotDLr.app (the launcher)]].

**The problem:** today you double-click `run.command` (Terminal opens) and use a browser tab at `localhost:8000`. Holden wants to open the app directly.

**What the launcher does when double-clicked (Applications/Dock):**
1. Starts the server in the background if it isn't already running (no Terminal window).
2. Opens spotDLr in its own window with Chrome's app mode (`--app=http://localhost:8000`): no address bar, no tabs.
3. Shows its own icon in the Dock.

**Why this option:**

| Option | Verdict |
|---|---|
| Web-app install (Chrome *Install* / Safari *Add to Dock*) | Own window, but you still have to start the server first |
| **Launcher `.app` + Chrome app mode** | **Chosen.** ~15 min of work, a few KB, nothing moves |
| Packaged `spotDLr.app` (pywebview + PyInstaller/py2app) | Closest to a real app, but 150–250 MB, unsigned (right-click → Open the first time), needs Node.js anyway, and the library must move out of the bundle (e.g. `~/Music/spotDLr/`) |
| Electron / Tauri | Rebuilds the shell for no gain |

**Trade-offs we accepted:**
- Needs Google Chrome (or Edge/Brave). Safari has no "app window" mode.
- The server keeps running after the window closes, so relaunching is instant. A "Quit server" option can be added if wanted.
- The launcher points at the project folder (`~/Projects/spotDLr-web_ui`), so moving that folder means rebuilding the launcher.

**Build notes for later:**
- Check the server by request (`curl localhost:8000/api/library`), not by port alone; ports can be held by other apps (see `lsof` + process cwd).
- Start it with `run.sh` (handles the venv/deps) in the background, logging to a file. Wait until it answers, then open the window.
- An icon in `.icns` format (the green download mark from the favicon).
- Test: cold start, already running, Chrome missing (show a clear message), port 8000 busy.
