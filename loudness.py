"""
How loud each song is, for "Even out volume".

FFmpeg's ebur128 filter measures integrated loudness in LUFS, the same measure Spotify and YouTube
normalize to. A typical download is -6 to -10 LUFS; the player turns louder songs down to -14 LUFS
(it never boosts, so nothing can clip). Measuring decodes the whole song, ~0.5–1 s each, so results
are cached per file (until it changes) in loudness.json, and a background pass measures the rest.
"""

import json
import os
import re
import subprocess
import sys
import threading
from pathlib import Path

INTEGRATED = re.compile(r"I:\s+(-?[\d.]+|-inf) LUFS")
PEAK = re.compile(r"Peak:\s+(-?[\d.]+|-inf) dBFS")


class Loudness:
    def __init__(self, path: Path, ffmpeg_path, library):
        self.path = path
        self.ffmpeg_path = ffmpeg_path
        self.library = library
        self.lock = threading.Lock()
        self.measuring = {}  # track id -> Event, so two requests for one song measure it once
        self.scan = {"running": False, "done": 0, "total": 0}
        try:
            self.data = json.loads(path.read_text(encoding="utf-8"))  # id -> [mtime, size, lufs, peak]
        except (OSError, ValueError):
            self.data = {}

    def _save(self):
        tmp = self.path.with_suffix(".tmp")
        with self.lock:
            text = json.dumps(self.data)
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, self.path)

    def known(self, track):
        """{lufs, peak} if measured since the file last changed, else None."""
        entry = self.data.get(track["id"])
        if entry and entry[0] == track["added"] and entry[1] == track["size"]:
            return {"lufs": entry[2], "peak": entry[3]}
        return None

    def get(self, track):
        """Measure now if needed (blocks ~1 s). None if FFmpeg is missing or the file can't be read."""
        found = self.known(track)
        if found:
            return found
        with self.lock:
            event = self.measuring.get(track["id"])
            mine = event is None
            if mine:
                event = self.measuring[track["id"]] = threading.Event()
        if not mine:
            event.wait(30)
            return self.known(track)
        try:
            result = self._measure(self.library.root / track["path"])
            if result:
                with self.lock:
                    self.data[track["id"]] = [track["added"], track["size"], result["lufs"], result["peak"]]
                self._save()
            return result
        finally:
            with self.lock:
                self.measuring.pop(track["id"], None)
            event.set()

    def _measure(self, path: Path):
        ffmpeg = self.ffmpeg_path()
        if not ffmpeg:
            return None
        flags = 0x08000000 if sys.platform == "win32" else 0  # CREATE_NO_WINDOW
        try:
            out = subprocess.run([ffmpeg, "-hide_banner", "-nostats", "-i", str(path), "-map", "0:a:0",
                                  "-af", "ebur128=peak=sample", "-f", "null", "-"],
                                 capture_output=True, text=True, timeout=120, creationflags=flags).stderr
        except (OSError, subprocess.TimeoutExpired):
            return None
        summary = out[out.rfind("Summary:"):]  # the per-frame lines above it carry running values
        lufs, peak = INTEGRATED.search(summary), PEAK.search(summary)
        if not lufs or lufs.group(1) == "-inf":
            return None  # silence
        return {"lufs": float(lufs.group(1)), "peak": float(peak.group(1)) if peak and peak.group(1) != "-inf" else 0.0}

    def start_scan(self):
        """Measure every song that isn't yet, one at a time, in the background."""
        with self.lock:
            if self.scan["running"]:
                return dict(self.scan)
            self.scan = {"running": True, "done": 0, "total": 0}
        threading.Thread(target=self._scan, daemon=True).start()
        return dict(self.scan)

    def _scan(self):
        try:
            todo = [t for t in self.library.scan() if not self.known(t)]
            self.scan["total"] = len(todo)
            for track in todo:
                self.get(track)
                self.scan["done"] += 1
        finally:
            self.scan["running"] = False
