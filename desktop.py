"""
spotDLr desktop entry point: what spotDLr.exe (the Windows installer) runs.

  already running?  → open another window and exit
  otherwise         → start the server on a thread, open an app window, and when the
                      user closes that window, stop the server and exit

The window is Edge (always on Windows) or Chrome in app mode, with its own profile folder,
so it's a separate browser process that exits when the window closes; that's how we know
when to stop. Env for tests: SPOTDLR_NO_BROWSER=1 (serve only), SPOTDLR_PORT=<first port>.
"""

import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

from paths import DATA_DIR, FROZEN

FIRST_PORT = int(os.environ.get("SPOTDLR_PORT", "8000"))
PORTS = range(FIRST_PORT, FIRST_PORT + 11)
LOG = DATA_DIR / "spotDLr.log"


def _route_output_to_log():
    """A windowed .exe has no console: sys.stdout/stderr are None and uvicorn's logging would crash."""
    if FROZEN or sys.stdout is None:
        if LOG.exists() and LOG.stat().st_size > 5_000_000:
            LOG.replace(LOG.with_name("spotDLr.log.old"))
        stream = open(LOG, "a", buffering=1, encoding="utf-8", errors="replace")
        sys.stdout = sys.stderr = stream
    print(f"=== {time.strftime('%Y-%m-%d %H:%M:%S')} spotDLr starting", flush=True)


def _message(text):
    if sys.platform == "win32":
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, text, "spotDLr", 0x10)  # MB_ICONERROR
    print(text, flush=True)


def _spotdlr_port():
    """The port a running spotDLr answers on (its /api/status/init has "search_source"), or None."""
    for port in PORTS:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/status/init", timeout=1) as response:
                if "search_source" in json.load(response):
                    return port
        except Exception:
            continue
    return None


def _free_port():
    for port in PORTS:
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return None


def _browser():
    if sys.platform == "win32":
        bases = [os.environ.get(k) for k in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")]
        relative = [r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe"]
        candidates = [os.path.join(b, r) for r in relative for b in bases if b]
    else:
        candidates = [f"/Applications/{name}.app/Contents/MacOS/{name}" for name in ("Microsoft Edge", "Google Chrome")]
    return next((c for c in candidates if os.path.exists(c)), None)


def _open_window(url, wait):
    browser = _browser()
    if not browser:
        webbrowser.open(url)  # no Edge/Chrome: a normal tab
        return None
    # Own profile → own browser process, which exits when the spotDLr window is closed
    profile = DATA_DIR / "browser-profile"
    process = subprocess.Popen([browser, f"--app={url}", f"--user-data-dir={profile}",
                                "--no-first-run", "--no-default-browser-check"])
    if wait:
        process.wait()
    return process


def main():
    _route_output_to_log()

    running = _spotdlr_port()
    if running:
        print(f"Already running on port {running}; opening a window", flush=True)
        if not os.environ.get("SPOTDLR_NO_BROWSER"):
            _open_window(f"http://localhost:{running}", wait=False)
        return

    port = _free_port()
    if port is None:
        _message(f"spotDLr couldn't find a free port between {PORTS[0]} and {PORTS[-1]}. Close some apps and try again.")
        return

    import uvicorn  # after the log redirect: uvicorn's logging grabs sys.stderr when it's configured
    import app as spotdlr

    server = uvicorn.Server(uvicorn.Config(spotdlr.app, host="127.0.0.1", port=port, log_level="info"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.time() + 60
    while _spotdlr_port() != port:
        if not thread.is_alive() or time.time() > deadline:
            _message(f"spotDLr couldn't start. Details are in {LOG}")
            return
        time.sleep(0.25)
    print(f"Serving on http://localhost:{port}", flush=True)

    if os.environ.get("SPOTDLR_NO_BROWSER"):
        thread.join()  # tests: serve until killed
        return

    _open_window(f"http://localhost:{port}", wait=True)
    print("Window closed; stopping", flush=True)
    server.should_exit = True
    thread.join(timeout=10)


if __name__ == "__main__":
    main()
