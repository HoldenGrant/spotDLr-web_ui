"""
Add songs to Apple Music (the Music app on a Mac).

The Music app can't import FLAC or Opus. So each song is prepared as something it plays:
- lossless (FLAC, WAV, AIFF) → Apple Lossless (ALAC), then checked: both files are decoded and their
  audio fingerprints (MD5 of the raw samples) must match, which proves not one sample changed;
- AAC and MP3 (spotDLr's downloads) → added as they are;
- Opus / Ogg → AAC 256 kbps (the only case that re-encodes, since the Music app can't play them).

The prepared files go to ~/Music/spotDLr for Apple Music/<album or playlist>/, then AppleScript adds them.
Songs already in Apple Music (same title + album) are skipped. Text reaches AppleScript as arguments
(`on run argv`), never pasted into the script, so titles like `Wth>You` or ones with quotes can't break it.
"""

import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from downloader import safe_folder_name

MUSIC_APP = Path("/System/Applications/Music.app")
STAGING = Path.home() / "Music" / "spotDLr for Apple Music"
LOSSLESS = {".flac", ".wav", ".aif", ".aiff"}
NATIVE = {".m4a", ".mp3", ".aac"}  # the Music app plays these as they are (ALAC inside .m4a too)

# Which of these songs are already in the library? argv: name1, album1, name2, album2, … → "1,0,1"
CHECK_SCRIPT = """on run argv
    set out to {}
    tell application "Music"
        repeat with i from 1 to (count of argv) by 2
            set n to item i of argv
            set a to item (i + 1) of argv
            if exists (some track of library playlist 1 whose name is n and album is a) then
                set end of out to "1"
            else
                set end of out to "0"
            end if
        end repeat
    end tell
    set AppleScript's text item delimiters to ","
    return out as text
end run"""

# argv: playlist name ("" for none), then pairs of mode ("add" | "link") and path or name|album.
# add = a new file; link = already in the library, only put it in the playlist.
ADD_SCRIPT = """on run argv
    set playlistName to item 1 of argv
    tell application "Music"
        with timeout of 900 seconds
            set target to missing value
            if playlistName is not "" then
                if not (exists user playlist playlistName) then make new user playlist with properties {name:playlistName}
                set target to user playlist playlistName
            end if
            set added to 0
            repeat with i from 2 to (count of argv) by 2
                set mode to item i of argv
                set value to item (i + 1) of argv
                if mode is "add" then
                    if target is missing value then
                        add (POSIX file value)
                    else
                        add (POSIX file value) to target
                    end if
                    set added to added + 1
                else if target is not missing value then
                    set AppleScript's text item delimiters to "|"
                    set parts to text items of value
                    set found to (some track of library playlist 1 whose name is (item 1 of parts) and album is (item 2 of parts))
                    duplicate found to target
                end if
            end repeat
        end timeout
    end tell
    return added as text
end run"""


class AppleMusicError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def available():
    return sys.platform == "darwin" and MUSIC_APP.exists()


def _osascript(script, args, timeout=120):
    try:
        result = subprocess.run(["osascript", "-e", script, *args], capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise AppleMusicError("The Music app didn't answer in time. Is it showing a dialog?", 504)
    if result.returncode != 0:
        err = result.stderr.strip()
        if "-1743" in err or "Not authorized" in err:
            raise AppleMusicError("spotDLr isn't allowed to control the Music app. Turn it on in System Settings → "
                                  "Privacy & Security → Automation (look for Terminal or Python), then try again.", 403)
        raise AppleMusicError(f"The Music app said: {err[-300:]}", 502)
    return result.stdout.strip()


class AppleMusic:
    def __init__(self, ffmpeg_path):
        self.ffmpeg_path = ffmpeg_path
        self.jobs = {}
        self.lock = threading.Lock()

    def start(self, tracks, collection, make_playlist):
        """tracks: [{path, title, album, artists}] in order."""
        if not available():
            raise AppleMusicError("Adding to Apple Music works on a Mac with the Music app", 501)
        if not tracks:
            raise AppleMusicError("No songs to add")
        if not self.ffmpeg_path() and any(t["path"].suffix.lower() not in NATIVE for t in tracks):
            raise AppleMusicError("Converting for Apple Music needs FFmpeg, which isn't installed", 500)
        job = {"id": uuid.uuid4().hex[:12], "status": "working", "step": "Checking what's already in Apple Music",
               "done": 0, "total": len(tracks), "added": 0, "skipped": 0, "converted": 0, "verified": 0,
               "playlist": collection if make_playlist else None, "error": None, "started": time.time()}
        with self.lock:
            self.jobs[job["id"]] = job
        threading.Thread(target=self._run, args=(job, tracks, collection, make_playlist), daemon=True).start()
        return dict(job)

    def get(self, job_id):
        with self.lock:
            job = self.jobs.get(job_id)
            return dict(job) if job else None

    def _run(self, job, tracks, collection, make_playlist):
        try:
            pairs = [x for t in tracks for x in (t["title"], t["album"])]
            existing = _osascript(CHECK_SCRIPT, pairs).split(",") if pairs else []
            folder = STAGING / (safe_folder_name(collection or "") or "Songs")
            folder.mkdir(parents=True, exist_ok=True)
            plan = []  # (mode, value) for ADD_SCRIPT
            for i, (track, already) in enumerate(zip(tracks, existing)):
                if already == "1":
                    job["skipped"] += 1
                    plan += ["link", f"{track['title']}|{track['album']}"]
                else:
                    job["step"] = f"Preparing {track['title']}"
                    plan += ["add", str(self._prepare(track, folder, job))]
                job["done"] = i + 1
            job["step"] = "Adding to the Music app"
            if any(plan[k] == "add" for k in range(0, len(plan), 2)) or (make_playlist and plan):
                added = _osascript(ADD_SCRIPT, [collection if make_playlist else "", *plan], timeout=960)
                job["added"] = int(added or 0)
            job.update(status="done", step=None, finished=time.time())
        except AppleMusicError as e:
            job.update(status="failed", error=str(e), step=None)
        except Exception as e:  # never die silently on a thread
            job.update(status="failed", error=str(e)[:300], step=None)

    def _prepare(self, track, folder, job):
        """A file the Music app can import, in the staging folder. Returns its path."""
        src = track["path"]
        suffix = src.suffix.lower()
        if suffix in NATIVE:
            target = folder / src.name
            if not target.exists():
                shutil.copy2(src, target)
            return target
        target = folder / f"{src.stem}.m4a"
        lossless = suffix in LOSSLESS
        codec = ["-c:a", "alac"] if lossless else ["-c:a", "aac", "-b:a", "256k"]
        self._ffmpeg("-i", str(src), "-map", "0:a:0", "-map", "0:v:0?", *codec, "-c:v", "copy",
                     "-disposition:v:0", "attached_pic", "-map_metadata", "0", str(target))
        job["converted"] += 1
        if lossless:
            if self._fingerprint(src) != self._fingerprint(target):
                target.unlink()
                raise AppleMusicError(f"The Apple Lossless copy of {src.name} didn't match the original, so it wasn't added", 500)
            job["verified"] += 1
        self._tidy_tags(target, track)
        return target

    def _ffmpeg(self, *args):
        result = subprocess.run([self.ffmpeg_path(), "-v", "error", "-y", *args], capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            raise AppleMusicError(f"Couldn't convert: {result.stderr.strip()[-200:]}", 500)

    def _fingerprint(self, path):
        """MD5 of the decoded audio samples: equal fingerprints = every sample identical."""
        result = subprocess.run([self.ffmpeg_path(), "-v", "error", "-i", str(path), "-map", "0:a:0", "-f", "md5", "-"],
                                capture_output=True, text=True, timeout=600)
        return result.stdout.strip()

    @staticmethod
    def _tidy_tags(path, track):
        """M4A joins several artists with ';', which the Music app shows as is: write them as 'A, B'."""
        from mutagen.mp4 import MP4
        audio = MP4(path)
        audio.tags["\xa9ART"] = [", ".join(track["artists"])]
        audio.save()
