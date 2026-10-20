"""Exercise a relocated Mac bundle with source, Homebrew and system Python denied.

Usage: python3 installer/test_mac_build.py /path/to/spotDLr.app
Only temporary test music and settings are created; no personal library is used.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import wave


def main():
    original = Path(sys.argv[1]).resolve()
    source = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="spotDLr isolated test ") as temporary:
        root = Path(temporary)
        bundle = root / "Moved app" / "spotDLr.app"
        shutil.copytree(original, bundle, symlinks=True)
        assert not list(bundle.rglob(".env")), "Personal settings must never be bundled"
        helper = bundle / "Contents/Helpers/spotDLr-server.app/Contents"
        tools = helper / "Frameworks/bin"
        # sandbox-exec blocks reads even if a stale absolute dependency path survived bundling.
        denied = [str(source), "/opt/homebrew", "/usr/local", "/Library/Frameworks/Python.framework"]
        profile = '(version 1)(allow default)(deny file-read* ' + ''.join(
            f'(subpath {json.dumps(path)})' for path in denied) + ')'
        sandbox = ["/usr/bin/sandbox-exec", "-p", profile]
        environment = {"HOME": str(root), "PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "TMPDIR": str(root)}
        music = root / "Music/spotDLr"
        data = root / "Library/Application Support/spotDLr"
        music.mkdir(parents=True)
        audio = music / "Packaging smoke test.wav"
        with wave.open(str(audio), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(44100)
            output.writeframes(b"\x00\x00" * 44100)
        subprocess.run(sandbox + [str(tools / "node"), "--version"], env=environment, check=True)
        subprocess.run(sandbox + [str(tools / "ffmpeg"), "-v", "error", "-i", str(audio),
                                 str(root / "converted.mp3")], env=environment, check=True)
        subprocess.run(sandbox + [str(tools / "ffprobe"), "-v", "error", "-show_entries", "format=duration",
                                 str(root / "converted.mp3")], env=environment, check=True)
        ready = root / "ready.json"
        environment["SPOTDLR_READY_FILE"] = str(ready)
        # No data/music overrides: test the packaged Mac defaults as well.
        with (root / "server.log").open("w+") as log:
            process = subprocess.Popen(sandbox + [str(helper / "MacOS/spotDLr-server")], cwd=root,
                                       env=environment, stdout=log, stderr=log)
            try:
                deadline = time.monotonic() + 60
                while not ready.exists():
                    if process.poll() is not None or time.monotonic() > deadline:
                        log.seek(0)
                        raise RuntimeError("Packaged server did not become ready:\n" + log.read())
                    time.sleep(.1)
                port = json.loads(ready.read_text())["port"]
                base = f"http://127.0.0.1:{port}"

                def get(path, headers=None):
                    with urllib.request.urlopen(urllib.request.Request(base + path, headers=headers or {}), timeout=10) as response:
                        return response.status, response.read()

                assert json.loads(get("/api/ping")[1])["app"] == "spotDLr"
                assert b"spotDLr" in get("/")[1]
                assert get("/static/app.js")[0] == 200
                library = json.loads(get("/api/library")[1])
                tracks = library["tracks"]
                assert len(tracks) == 1, library
                track_id = tracks[0]["id"]
                assert get(f"/api/stream/{track_id}", {"Range": "bytes=0-31"})[0] == 206
                request = urllib.request.Request(base + f"/api/likes/{track_id}", data=b'{"liked":true}',
                                                 headers={"Origin": base, "Content-Type": "application/json"})
                with urllib.request.urlopen(request, timeout=10) as response:
                    assert response.status == 200
                assert data.joinpath("likes.json").exists(), "Settings were not saved in Mac Application Support"
                assert not (helper / "Frameworks/likes.json").exists()
                print("PASS: relocated bundle, isolated runtime, bundled Node/FFmpeg/ffprobe, library, streaming and persistent likes")
            finally:
                process.terminate()
                process.wait(timeout=15)
            assert not ready.exists(), "Ready file was not cleaned up on quit"
            assert process.returncode == 0, process.returncode


if __name__ == "__main__":
    main()
