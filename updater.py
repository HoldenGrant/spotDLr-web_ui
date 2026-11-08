"""
In-app updates: Settings → About → "Check for updates" can also install the update.

What it does, in order:
  1. asks GitHub for the latest published release and picks this computer's download from it
  2. downloads it into <data>/updates, only from this project's GitHub releases, and refuses it unless its
     SHA-256 matches the checksum GitHub publishes for that file
  3. Mac: opens the DMG, copies the new app next to the installed one, checks its signature, then a small
     detached script waits for spotDLr to quit, swaps the two, and opens the new one
     Windows: runs the installer silently (it replaces spotDLr in place), then opens spotDLr again
  4. this server exits so the files can be replaced; the page waits for the new one and reloads

The page never says which file to download: it only asks to "install the latest", so a web page can't point this
at another address. Packaged apps only: from the source folder there is nothing to replace (use git pull).
"""

import hashlib
import json
import logging
import os
import platform
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.request
from pathlib import Path

from paths import DATA_DIR, FROZEN
from version import VERSION

logger = logging.getLogger("spotdlr.updater")

REPO = "HoldenGrant/spotDLr-web_ui"
LATEST_URL = f"https://api.github.com/repos/{REPO}/releases/latest"
DOWNLOAD_PREFIX = f"https://github.com/{REPO}/releases/download/"  # the only place a download may come from
UPDATES = DATA_DIR / "updates"
WINDOWS_ASSET = "spotDLr-Setup.exe"
MAC_ASSET_SUFFIX = "-mac-arm64.dmg"

SWAP_SCRIPT = r'''#!/bin/bash
# Waits for spotDLr to quit, swaps the staged copy in, opens it. Args: installed staged host_pid server_pid
APP="$1"; STAGE="$2"; HOST="$3"; SERVER="$4"
alive() { local s; s=$(ps -p "$1" -o stat= 2>/dev/null); [ -n "$s" ] && [ "${s#Z}" = "$s" ]; }   # a zombie is gone
sleep 1.5
kill -TERM "$HOST" 2>/dev/null
for i in $(seq 1 40); do alive "$HOST" || break; sleep 0.5; done
alive "$HOST" && kill -KILL "$HOST" 2>/dev/null
ps -p "$SERVER" -o command= 2>/dev/null | grep -q spotDLr-server && kill -KILL "$SERVER" 2>/dev/null
OLD="${APP%.app}.old.app"
rm -rf "$OLD"
if mv "$APP" "$OLD"; then
    if mv "$STAGE" "$APP"; then rm -rf "$OLD"; else mv "$OLD" "$APP"; fi   # a failed swap puts the old app back
fi
${SPOTDLR_UPDATE_OPEN:-open} "$APP"
'''


class UpdateError(Exception):
    """Something that stops the update, worded for the person reading Settings."""


def version_tuple(text):
    numbers = [int(n) for n in re.findall(r"\d+", str(text).lstrip("vV").split("-")[0])]
    return tuple((numbers + [0, 0, 0])[:4])


def fetch_latest():
    request = urllib.request.Request(LATEST_URL, headers={"Accept": "application/vnd.github+json", "User-Agent": "spotDLr-updater"})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)


def pick_asset(release):
    """This computer's download in the release, or None."""
    for asset in release.get("assets", []):
        name = asset.get("name", "")
        if sys.platform == "win32" and name == WINDOWS_ASSET:
            return asset
        if sys.platform == "darwin" and platform.machine() == "arm64" and name.startswith("spotDLr-") and name.endswith(MAC_ASSET_SUFFIX):
            return asset
    return None


def app_bundle():
    """The installed spotDLr.app this server is running inside (Mac), or None."""
    for parent in Path(sys.executable).parents:
        if parent.suffix == ".app" and (parent / "Contents" / "Helpers").is_dir():
            return parent
    return None


def can_install(asset):
    """(True, "") or (False, why not), for a packaged app that this release has a download for."""
    if not FROZEN:
        return False, "spotDLr is running from its source folder: update it with git pull."
    if asset is None:
        return False, "This release has no download for this computer."
    if sys.platform == "darwin":
        app = app_bundle()
        if app is None:
            return False, "Couldn't find the spotDLr app to replace."
        if "AppTranslocation" in str(app) or str(app).startswith("/Volumes/"):
            return False, "Drag spotDLr into Applications and open it from there first."
        if not os.access(app.parent, os.W_OK):
            return False, "spotDLr can't change the folder it is in. Download the update and drag it in yourself."
    return True, ""


def describe(release):
    asset = pick_asset(release)
    ok, why = can_install(asset)
    latest = str(release.get("tag_name", "")).lstrip("vV")
    return {
        "current": VERSION, "latest": latest, "available": version_tuple(latest) > version_tuple(VERSION),
        "url": release.get("html_url"), "size": asset.get("size") if asset else None, "can_install": ok, "reason": why,
    }


# ---------- install, in the background ----------

_lock = threading.Lock()
_state = {"phase": "idle", "percent": 0, "version": None, "error": None}
ACTIVE = ("starting", "downloading", "installing", "restarting")


def status():
    with _lock:
        return dict(_state)


def _set(**values):
    with _lock:
        _state.update(values)


def _quit():
    os._exit(0)  # the files can only be replaced once this process is gone


def start():
    """Begin installing the latest release (one at a time); progress is read from status()."""
    with _lock:
        if _state["phase"] in ACTIVE:
            return dict(_state)
        _state.update(phase="starting", percent=0, version=None, error=None)
    threading.Thread(target=_run, daemon=True, name="updater").start()
    return status()


def _run():
    try:
        release = fetch_latest()
        info = describe(release)
        if not info["available"]:
            raise UpdateError("spotDLr is already up to date.")
        if not info["can_install"]:
            raise UpdateError(info["reason"])
        asset = pick_asset(release)
        _set(version=info["latest"])
        installer = _download(asset)
        _set(phase="installing", percent=100)
        if sys.platform == "darwin":
            _install_mac(installer, app_bundle(), os.getppid(), info["latest"])
        else:
            _install_windows(installer)
        _set(phase="restarting")
        threading.Timer(1.5, _quit).start()
    except Exception as error:  # noqa: BLE001 - whatever went wrong is shown, and the app keeps running as it was
        logger.exception("Update failed")
        _set(phase="error", error=str(error) if isinstance(error, UpdateError) else f"The update didn't finish ({error}). spotDLr is unchanged.")


def _download(asset):
    url = asset.get("browser_download_url", "")
    if not url.startswith(DOWNLOAD_PREFIX):
        raise UpdateError("The download isn't from spotDLr's GitHub releases, so it was not used.")
    expected = str(asset.get("digest", "")).removeprefix("sha256:")
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise UpdateError("GitHub published no checksum for this download, so spotDLr won't install it.")
    shutil.rmtree(UPDATES, ignore_errors=True)
    UPDATES.mkdir(parents=True, exist_ok=True)
    target = UPDATES / Path(asset["name"]).name
    partial = target.with_name(target.name + ".part")
    digest, size = hashlib.sha256(), int(asset.get("size") or 0)
    _set(phase="downloading", percent=0)
    request = urllib.request.Request(url, headers={"User-Agent": "spotDLr-updater"})
    got = 0
    with urllib.request.urlopen(request, timeout=30) as response, open(partial, "wb") as out:
        while chunk := response.read(1 << 20):
            out.write(chunk)
            digest.update(chunk)
            got += len(chunk)
            if size:
                _set(percent=min(99, int(got * 100 / size)))
    if (size and got != size) or digest.hexdigest() != expected:
        partial.unlink(missing_ok=True)
        raise UpdateError("The download was damaged (its checksum doesn't match). Nothing was installed.")
    partial.replace(target)
    return target


def _install_mac(dmg, app, host_pid, version):
    if app is None:
        raise UpdateError("Couldn't find the spotDLr app to replace.")
    command = subprocess.run(["ps", "-p", str(host_pid), "-o", "command="], capture_output=True, text=True).stdout
    if f"{app}/Contents/MacOS/" not in command:
        raise UpdateError("Couldn't find the spotDLr window to restart, so nothing was changed.")
    mount = Path(tempfile.mkdtemp(prefix="spotdlr-update-"))
    stage = app.parent / ".spotDLr-update.app"  # beside the installed app, so the swap is a rename on one volume
    try:
        subprocess.run(["hdiutil", "attach", str(dmg), "-nobrowse", "-readonly", "-noverify", "-mountpoint", str(mount)],
                       check=True, capture_output=True, timeout=180)
        source = mount / "spotDLr.app"
        if not source.is_dir():
            raise UpdateError("The download didn't contain spotDLr.app.")
        shutil.rmtree(stage, ignore_errors=True)
        subprocess.run(["ditto", str(source), str(stage)], check=True, capture_output=True, timeout=300)
    finally:
        subprocess.run(["hdiutil", "detach", str(mount), "-force"], capture_output=True)
        shutil.rmtree(mount, ignore_errors=True)
    try:
        subprocess.run(["codesign", "--verify", "--deep", "--strict", str(stage)], check=True, capture_output=True)
        with open(stage / "Contents" / "Info.plist", "rb") as file:
            built = plistlib.load(file).get("CFBundleShortVersionString")
        if built != version:
            raise UpdateError(f"The download is version {built}, not {version}, so it was not installed.")
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise
    script = UPDATES / "swap.sh"
    script.write_text(SWAP_SCRIPT)
    script.chmod(0o755)
    with open(UPDATES / "swap.log", "wb") as log:
        subprocess.Popen(["/bin/bash", str(script), str(app), str(stage), str(host_pid), str(os.getpid())],
                         start_new_session=True, stdin=subprocess.DEVNULL, stdout=log, stderr=log, close_fds=True)


def windows_command(installer, exe):
    """The PowerShell that runs the installer silently, waits, then opens spotDLr again."""
    quote = lambda path: "'" + str(path).replace("'", "''") + "'"
    return (f"Start-Process -FilePath {quote(installer)} -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/CLOSEAPPLICATIONS' -Wait; "
            f"Start-Process -FilePath {quote(exe)}")


def _install_windows(installer):
    DETACHED_PROCESS, NEW_GROUP, NO_WINDOW = 0x00000008, 0x00000200, 0x08000000
    subprocess.Popen(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
                      "-Command", windows_command(installer, sys.executable)],
                     creationflags=DETACHED_PROCESS | NEW_GROUP | NO_WINDOW, stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True)
