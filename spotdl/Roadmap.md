# Roadmap

Planned work, not started. Related: [[Home]] · [[Launchers & Setup]] · [[Bug Log]]

---

## Next: test the Windows launcher on a real PC

Built Oct 15 but never run on Windows (no Windows machine here). First run: double-click `make_launcher.bat`, open spotDLr from the Start menu, and report any message box or the contents of `%LOCALAPPDATA%\spotDLr\spotDLr.log`. See [[Launchers & Setup#Windows: the spotDLr shortcut (launcher)]].

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
