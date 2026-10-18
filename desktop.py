"""
spotDLr desktop entry point: what spotDLr.exe (the Windows installer) runs.

  already running?  → open another window and exit
  otherwise         → start the server on a thread, open an app window, and when the
                      last spotDLr window closes, stop the server and exit

The window is Edge (always on Windows) or Chrome in app mode, with its own profile folder.
When to stop comes from the page, not the browser process: every window checks in every 15 s
(/api/window/alive) and says goodbye on close (/api/window/bye). Waiting on the Edge process
we started doesn't work: Edge often hands the window to another process and exits at once, and
v2.0.0 stopped the server before the page had even loaded.

Env for tests: SPOTDLR_NO_BROWSER=1 (serve only), SPOTDLR_PORT=<first port>,
SPOTDLR_BROWSER=<path> (use this browser executable).

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
FIRST_CONTACT_WAIT = 45   # seconds for the window to load the page before trying the default browser
CLOSE_GRACE = 5           # seconds after the last window leaves before stopping (a reload comes straight back)
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
    """The port a running spotDLr answers on, or None. Asks /api/ping, which answers at once: the old
    /api/status/init sometimes waited on Spotify for seconds, missed the deadline, and a second server
    would start on the next port."""
    for port in PORTS:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping", timeout=3) as response:
                if json.load(response).get("app") == "spotDLr":
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
    if os.environ.get("SPOTDLR_BROWSER"):
        return os.environ["SPOTDLR_BROWSER"]
    if sys.platform == "win32":
        bases = [os.environ.get(k) for k in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")]
        relative = [r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe"]
        candidates = [os.path.join(b, r) for r in relative for b in bases if b]
    else:
        candidates = [f"/Applications/{name}.app/Contents/MacOS/{name}" for name in ("Microsoft Edge", "Google Chrome")]
    return next((c for c in candidates if os.path.exists(c)), None)


def _open_window(url):
    browser = _browser()
    if not browser:
        webbrowser.open(url)  # no Edge/Chrome: a normal tab
        return
    # Own profile: the window doesn't mix with the user's normal browsing (tabs, history, extensions)
    profile = DATA_DIR / "browser-profile"
    subprocess.Popen([browser, f"--app={url}", f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check"])


def _wait_for_windows(open_windows, url):
    """Return once the last spotDLr window has closed."""
    started = time.time()
    while not open_windows():  # first, the window has to load the page
        if started and time.time() - started > FIRST_CONTACT_WAIT:
            print(f"No window after {FIRST_CONTACT_WAIT} s; opening the default browser", flush=True)
            webbrowser.open(url)
            started = None  # then just keep serving until a page turns up
        time.sleep(0.5)
    print("Window connected", flush=True)
    empty_since = None
    while True:
        if open_windows():
            empty_since = None
        elif empty_since is None:
            empty_since = time.time()
        elif time.time() - empty_since > CLOSE_GRACE:
            return
        time.sleep(0.5)


def main():
    _route_output_to_log()

    running = _spotdlr_port()
    if running:
        print(f"Already running on port {running}; opening a window", flush=True)
        if not os.environ.get("SPOTDLR_NO_BROWSER"):
            _open_window(f"http://127.0.0.1:{running}")
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
    # 127.0.0.1, not "localhost": the server listens on IPv4 only, and Windows may try localhost as IPv6 (::1) first
    url = f"http://127.0.0.1:{port}"
    print(f"Serving on {url}", flush=True)

    if os.environ.get("SPOTDLR_NO_BROWSER"):
        thread.join()  # tests: serve until killed
        return

    _open_window(url)
    _wait_for_windows(spotdlr.open_windows, url)
    print("Last window closed; stopping", flush=True)
    server.should_exit = True
    thread.join(timeout=10)


if __name__ == "__main__":
    main()
