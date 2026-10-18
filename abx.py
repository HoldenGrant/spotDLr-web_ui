"""
Blind listening test (ABX): can you hear the difference between a song and a compressed copy of it?

A = the original clip, B = the same clip encoded (AAC / MP3 / Opus at a bitrate) and decoded back.
Each trial, X is secretly A or B; you listen to all three and say which one X is.

What keeps it honest (anything except the sound would give the answer away):
- Both clips are decoded to identical WAVs (same format, same length, to the sample), so file size,
  format and loading speed reveal nothing.
- The lossy copy is encoded from a wider window and then cut, so the encoder's start-up delay
  (AAC ≈ 2,112 samples) and fade-in fall outside the clip and the two line up sample for sample.
- X is served from a fresh random URL each trial; which one it is lives only on the server, and the
  answers are only checked there.
"""

import math
import secrets
import shutil
import struct
import subprocess
import sys
import threading
import time
import wave
from pathlib import Path

CODECS = {  # name -> (ffmpeg encoder, container, label)
    "aac": ("aac", "mp4", "AAC"),  # MP4, not ADTS: only MP4 records the encoder delay so the decoder can remove it
    "mp3": ("libmp3lame", "mp3", "MP3"),
    "opus": ("libopus", "ogg", "Opus"),
}
BITRATES = (64, 96, 128, 160, 192, 256, 320)
LOSSLESS_SUFFIXES = {".flac", ".wav", ".aif", ".aiff"}
MARGIN = 1.0          # seconds of extra audio on each side when encoding, cut off afterwards
SESSION_TTL = 3600    # unused sessions (and their WAVs) are removed after an hour
RATE = 44100


class ABXError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def describe_source(path: Path):
    """{lossless, codec, bitrate_kbps}: a lossy source only compares compressed against more compressed."""
    import mutagen
    info = mutagen.File(path)
    codec = getattr(info.info, "codec", None) if info else None
    lossless = path.suffix.lower() in LOSSLESS_SUFFIXES or codec == "alac"
    name = "ALAC" if codec == "alac" else path.suffix.lower().lstrip(".").upper()
    if codec and codec.startswith("mp4a"):
        name = "AAC"
    bitrate = round((getattr(info.info, "bitrate", 0) or 0) / 1000) if info else 0
    return {"lossless": lossless, "codec": name, "bitrate_kbps": bitrate}


def binomial_p(correct, trials):
    """Chance of getting at least `correct` right out of `trials` by pure guessing (each guess 50/50).
    8 of 10 → 56/1024 ≈ 5.5%: unlikely, but not rare enough to be sure."""
    return sum(math.comb(trials, k) for k in range(correct, trials + 1)) / 2 ** trials


class ABX:
    def __init__(self, work_dir: Path, ffmpeg_path):
        self.work_dir = work_dir
        self.ffmpeg_path = ffmpeg_path
        self.sessions = {}
        self.lock = threading.Lock()

    # ---------- making the clips ----------

    def _ffmpeg(self, *args):
        flags = 0x08000000 if sys.platform == "win32" else 0  # CREATE_NO_WINDOW
        result = subprocess.run([self.ffmpeg_path(), "-v", "error", "-y", *args], capture_output=True, text=True,
                                creationflags=flags, timeout=180)
        if result.returncode != 0:
            raise ABXError(f"FFmpeg failed: {result.stderr.strip()[-300:]}", 500)

    def create(self, source: Path, duration, codec, bitrate, start, length, trials):
        if codec not in CODECS:
            raise ABXError(f"Codec must be one of {', '.join(CODECS)}")
        if bitrate not in BITRATES:
            raise ABXError(f"Bitrate must be one of {BITRATES}")
        if trials not in (10, 16, 20):
            raise ABXError("Trials must be 10, 16 or 20")
        if not self.ffmpeg_path():
            raise ABXError("The blind test needs FFmpeg, which isn't installed", 500)
        length = max(5.0, min(float(length), 60.0))
        start = max(0.0, min(float(start), max(0.0, (duration or 0) - length)))
        self._cleanup()

        session_id = secrets.token_urlsafe(12)
        folder = self.work_dir / session_id
        folder.mkdir(parents=True)
        encoder, container, label = CODECS[codec]
        pcm = ["-ac", "2", "-ar", str(RATE), "-c:a", "pcm_s16le"]
        try:
            # A: the original clip
            self._ffmpeg("-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", str(source), "-vn", *pcm, str(folder / "a.wav"))
            # B: encode a wider window, decode it, then cut the same clip out of the middle
            window_start = max(0.0, start - MARGIN)
            lead = start - window_start
            encoded = folder / f"b.{container}"
            self._ffmpeg("-ss", f"{window_start:.3f}", "-t", f"{length + lead + MARGIN:.3f}", "-i", str(source), "-vn",
                         "-ac", "2", "-ar", "48000" if codec == "opus" else str(RATE),
                         "-c:a", encoder, "-b:a", f"{bitrate}k", "-f", container, str(encoded))
            self._ffmpeg("-i", str(encoded), "-ss", f"{lead:.6f}", "-t", f"{length:.3f}", *pcm, str(folder / "b.wav"))
            encoded.unlink()
            self._equalize_length(folder / "a.wav", folder / "b.wav")
        except Exception:
            shutil.rmtree(folder, ignore_errors=True)
            raise

        session = {
            "id": session_id, "folder": folder, "created": time.time(), "codec": label, "bitrate": bitrate,
            "start": round(start, 1), "length": length, "trials": trials,
            "answers": [secrets.choice("AB") for _ in range(trials)],  # what X really is, per trial
            "x_tokens": [secrets.token_urlsafe(9) for _ in range(trials)],
            "guesses": [None] * trials,
        }
        with self.lock:
            self.sessions[session_id] = session
        return self.public(session)

    def _equalize_length(self, a: Path, b: Path):
        """Trim both WAVs to the shorter one, so they're byte-for-byte the same size."""
        with wave.open(str(a)) as wa, wave.open(str(b)) as wb:
            frames = min(wa.getnframes(), wb.getnframes())
        for path in (a, b):
            with wave.open(str(path)) as w:
                params, data = w.getparams(), w.readframes(frames)
            with wave.open(str(path), "wb") as w:
                w.setparams(params)
                w.writeframes(data)

    # ---------- the test ----------

    def get(self, session_id):
        with self.lock:
            session = self.sessions.get(session_id)
        if not session:
            raise ABXError("This test has expired. Start a new one.", 404)
        return session

    def public(self, session):
        """What the page may know: never the answers, until the test is finished."""
        done = all(g is not None for g in session["guesses"])
        out = {k: session[k] for k in ("id", "codec", "bitrate", "start", "length", "trials")}
        out["x_urls"] = [f"/api/abx/{session['id']}/x/{token}" for token in session["x_tokens"]]
        out["answered"] = sum(g is not None for g in session["guesses"])
        if done:
            correct = sum(g == a for g, a in zip(session["guesses"], session["answers"]))
            out["result"] = {"correct": correct, "p_value": binomial_p(correct, session["trials"]),
                             "answers": session["answers"], "guesses": session["guesses"]}
        return out

    def clip_path(self, session_id, which):
        """'a', 'b', or an X token → the WAV to serve."""
        session = self.get(session_id)
        if which in ("a", "b"):
            return session["folder"] / f"{which}.wav"
        if which in session["x_tokens"]:
            return session["folder"] / f"{session['answers'][session['x_tokens'].index(which)].lower()}.wav"
        raise ABXError("No such clip", 404)

    def answer(self, session_id, trial, guess):
        session = self.get(session_id)
        if guess not in ("A", "B") or not 0 <= trial < session["trials"]:
            raise ABXError("Answer A or B for a trial in this test")
        if session["guesses"][trial] is not None:
            raise ABXError("That trial is already answered", 409)
        session["guesses"][trial] = guess
        return self.public(session)

    def _cleanup(self):
        now = time.time()
        with self.lock:
            for session_id in [s for s, v in self.sessions.items() if now - v["created"] > SESSION_TTL]:
                shutil.rmtree(self.sessions.pop(session_id)["folder"], ignore_errors=True)
        if self.work_dir.exists():  # folders left from a previous run of spotDLr
            for folder in self.work_dir.iterdir():
                if folder.is_dir() and folder.name not in self.sessions and now - folder.stat().st_mtime > SESSION_TTL:
                    shutil.rmtree(folder, ignore_errors=True)


def pcm_frames(path: Path, offset_frames, count):
    """Left-channel samples from a 16-bit stereo WAV (for the alignment check in tests)."""
    with wave.open(str(path)) as w:
        w.setpos(offset_frames)
        raw = w.readframes(count)
    return list(struct.unpack(f"<{len(raw) // 2}h", raw))[0::2]
