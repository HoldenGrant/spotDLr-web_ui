"""
Where spotDLr's files live.

Run from source: data stays in the project folder. Packaged apps keep music in the
user's Music folder and settings/caches in Application Support on Mac, or
LOCALAPPDATA on Windows. SPOTDLR_MUSIC_DIR / SPOTDLR_DATA_DIR override both.
"""

import os
import sys
from pathlib import Path

FROZEN = bool(getattr(sys, "frozen", False))  # True inside the PyInstaller build

# Read-only app files: index.html, static/, bin/ (bundled ffmpeg.exe and node.exe)
APP_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


def _music_folder():
    """The user's real Music folder. On Windows it can be moved (OneDrive), so ask Windows."""
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes
            from uuid import UUID

            class GUID(ctypes.Structure):
                _fields_ = [("data", ctypes.c_byte * 16)]

            folder_id = GUID()
            folder_id.data[:] = UUID("{4BD8D571-6D19-48D3-BE97-422220080E43}").bytes_le  # FOLDERID_Music
            path = wintypes.LPWSTR()
            if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(folder_id), 0, None, ctypes.byref(path)) == 0:
                try:
                    return Path(path.value)
                finally:
                    ctypes.windll.ole32.CoTaskMemFree(path)
        except Exception:
            pass
    return Path.home() / "Music"


if FROZEN:
    MUSIC_DIR = Path(os.environ.get("SPOTDLR_MUSIC_DIR") or _music_folder() / "spotDLr")
    data_home = (Path.home() / "Library" / "Application Support" if sys.platform == "darwin"
                 else Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".local" / "share"))
    DATA_DIR = Path(os.environ.get("SPOTDLR_DATA_DIR") or data_home / "spotDLr")
else:
    MUSIC_DIR = Path(os.environ.get("SPOTDLR_MUSIC_DIR") or APP_DIR / "downloads")
    DATA_DIR = Path(os.environ.get("SPOTDLR_DATA_DIR") or APP_DIR)

MUSIC_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)


def bundled(name):
    """A program shipped inside the installer (bin/ffmpeg.exe, bin/node.exe), or None."""
    candidate = APP_DIR / "bin" / name
    return str(candidate) if candidate.exists() else None
