"""
Where spotDLr's files live.

Run from source: data stays in the project folder. Packaged apps keep music in the
user's Music folder and settings/caches in Application Support on Mac, or
LOCALAPPDATA on Windows. SPOTDLR_MUSIC_DIR / SPOTDLR_DATA_DIR override both.
"""

import os
import json
import shutil
import sqlite3
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


def _has_audio(folder):
    if not folder.is_dir():
        return False
    extensions = {".m4a", ".mp3", ".flac", ".opus", ".ogg", ".wav"}
    return any(path.suffix.lower() in extensions for path in folder.rglob("*"))


def _migrate_source_install(data_dir, default_music):
    """Reuse a source install on the first packaged launch, without moving its library."""
    manifest = APP_DIR / "source-migration.json"
    location_file = data_dir / "library-location.json"
    try:
        saved = Path(json.loads(location_file.read_text(encoding="utf-8"))["music_dir"]).expanduser()
        if saved.is_dir():
            return saved
    except (OSError, ValueError, KeyError, TypeError):
        pass
    if _has_audio(default_music):
        return default_music
    try:
        legacy = json.loads(manifest.read_text(encoding="utf-8"))
        music = Path(legacy["music_dir"]).expanduser()
        source_data = Path(legacy["data_dir"]).expanduser()
    except (OSError, ValueError, KeyError, TypeError):
        return default_music
    if not _has_audio(music):
        return default_music
    data_dir.mkdir(parents=True, exist_ok=True)
    location_file.write_text(json.dumps({"music_dir": str(music)}), encoding="utf-8")
    for name in (".env", ".genres.json", "likes.json", "loudness.json", "phone.json",
                 "plays.jsonl", "schedules.json"):
        source, target = source_data / name, data_dir / name
        if source.is_file() and not target.exists():
            shutil.copy2(source, target)
    for name in (".lyrics", "tag-backups"):
        source, target = source_data / name, data_dir / name
        if source.is_dir() and not target.exists():
            shutil.copytree(source, target)
    return music


def _migrate_webkit_preferences(data_dir):
    """Recover browser preferences from the old source launcher's WebKit origin."""
    target = data_dir / "client-preferences.json"
    theme_target = data_dir / "theme.json"
    if (target.exists() and theme_target.exists()) or sys.platform != "darwin":
        return
    storage = Path.home() / "Library" / "WebKit" / "com.holdengrant.spotdlr.launcher" / "WebsiteData" / "Default"
    databases = sorted(storage.glob("*/*/LocalStorage/localstorage.sqlite3"),
                       key=lambda path: path.stat().st_mtime, reverse=True)
    theme_keys = {"theme", "mode", "surface", "glass", "transparency", "themeSchedule", "customColors"}
    for database in databases:
        try:
            connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
            rows = connection.execute("SELECT key, value FROM ItemTable WHERE key LIKE 'spotdlr.%'").fetchall()
            connection.close()
            values, theme_values = {}, {}
            for key, value in rows:
                name = key.removeprefix("spotdlr.")
                if name == key or name == "preferencesRestored":
                    continue
                if isinstance(value, bytes):
                    value = value.decode("utf-16le").rstrip("\0")
                values[name] = json.loads(value)
                if name in theme_keys:
                    theme_values[name] = values[name]
            if values.get("customColors"):
                data_dir.mkdir(parents=True, exist_ok=True)
                if not target.exists():
                    target.write_text(json.dumps(values), encoding="utf-8")
                if not theme_target.exists():
                    theme_target.write_text(json.dumps(theme_values), encoding="utf-8")
                return
        except (OSError, sqlite3.Error, UnicodeDecodeError, ValueError):
            continue


if FROZEN:
    data_home = (Path.home() / "Library" / "Application Support" if sys.platform == "darwin"
                 else Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".local" / "share"))
    DATA_DIR = Path(os.environ.get("SPOTDLR_DATA_DIR") or data_home / "spotDLr")
    _migrate_webkit_preferences(DATA_DIR)
    if os.environ.get("SPOTDLR_MUSIC_DIR"):
        MUSIC_DIR = Path(os.environ["SPOTDLR_MUSIC_DIR"])
    else:
        MUSIC_DIR = _migrate_source_install(DATA_DIR, _music_folder() / "spotDLr")
else:
    MUSIC_DIR = Path(os.environ.get("SPOTDLR_MUSIC_DIR") or APP_DIR / "downloads")
    DATA_DIR = Path(os.environ.get("SPOTDLR_DATA_DIR") or APP_DIR)

MUSIC_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)


def bundled(name):
    """A program shipped inside the installer (bin/ffmpeg.exe, bin/node.exe), or None."""
    candidate = APP_DIR / "bin" / name
    return str(candidate) if candidate.exists() else None
