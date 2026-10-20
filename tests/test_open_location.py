import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import organize

ROOT = Path(__file__).resolve().parents[1]


class OpenLocationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "Music folder"
        self.root.mkdir()
        self.song = self.root / "Artist - Café & song.mp3"
        self.song.write_bytes(b"audio")

    def test_mac_reveals_files_and_opens_folders_with_literal_paths(self):
        with patch.object(organize.sys, "platform", "darwin"), patch.object(organize.subprocess, "run") as run:
            organize.open_location(self.root, self.song)
            run.assert_called_with(["/usr/bin/open", "-R", str(self.song)], check=True, capture_output=True, timeout=10)
            organize.open_location(self.root, self.root)
            run.assert_called_with(["/usr/bin/open", str(self.root)], check=True, capture_output=True, timeout=10)

    def test_windows_and_linux_open_the_containing_folder(self):
        with patch.object(organize.sys, "platform", "win32"), patch.object(organize.os, "startfile", create=True) as start:
            organize.open_location(self.root, self.song)
            start.assert_called_once_with(str(self.root))
        with patch.object(organize.sys, "platform", "linux"), patch.object(organize.subprocess, "run") as run:
            organize.open_location(self.root, self.song)
            run.assert_called_once_with(["xdg-open", str(self.root)], check=True, capture_output=True, timeout=10)

    def test_missing_outside_and_symlink_targets_do_not_launch(self):
        outside = self.root.parent / "outside.mp3"
        outside.write_bytes(b"outside")
        link = self.root / "linked.mp3"
        link.symlink_to(outside)
        with patch.object(organize.subprocess, "run") as run:
            for path, status in ((self.root / "missing.mp3", 404), (outside, 403), (link, 403)):
                with self.subTest(path=path), self.assertRaises(organize.OrganizeError) as error:
                    organize.open_location(self.root, path)
                self.assertEqual(error.exception.status, status)
            run.assert_not_called()

    def test_file_manager_errors_are_reported(self):
        with patch.object(organize.sys, "platform", "darwin"):
            for failure in (OSError("unavailable"), subprocess.TimeoutExpired("open", 10), subprocess.CalledProcessError(1, "open")):
                with self.subTest(failure=failure), patch.object(organize.subprocess, "run", side_effect=failure), self.assertRaises(organize.OrganizeError) as error:
                    organize.open_location(self.root, self.song)
                self.assertEqual(error.exception.status, 500)

    def test_api_resolves_library_targets_and_refuses_phone_requests(self):
        code = """
import asyncio
from unittest.mock import AsyncMock, patch
from starlette.requests import Request
import app
from downloader import write_playlist

song = app.DOWNLOAD_DIR / 'Artist - Song.mp3'
song.write_bytes(b'audio')
write_playlist(app.DOWNLOAD_DIR / 'My playlist', [song])
track_id = app.library.scan()[0]['id']
with patch.object(app.organize, 'open_location') as opener:
    for body, target in (({}, app.DOWNLOAD_DIR), ({'track_id':track_id}, song), ({'collection_key':'My playlist'}, app.DOWNLOAD_DIR / 'My playlist')):
        assert app.reveal_location(app.RevealRequest(**body)) == {'opened': True}
        opener.assert_called_with(app.DOWNLOAD_DIR, target)
    opener.reset_mock()
    for body in ({'track_id':'unknown'}, {'collection_key':'../outside'}, {'collection_key':'missing'}, {'track_id':track_id,'collection_key':'My playlist'}):
        try: app.reveal_location(app.RevealRequest(**body))
        except app.OrganizeError as error: assert error.status == (400 if len(body) == 2 else 404)
        else: raise AssertionError('Invalid target accepted')
    opener.assert_not_called()

async def check_phone():
    request = Request({'type':'http','method':'POST','path':'/api/reveal','scheme':'http','query_string':b'',
                       'headers':[(b'host',b'127.0.0.1')],'client':('192.0.2.1',1234),'server':('127.0.0.1',8000)})
    next_handler = AsyncMock(side_effect=AssertionError('Phone request reached the endpoint'))
    with patch.object(app.phones,'is_remote',return_value=True), patch.object(app.phones,'allowed_host',return_value=True), patch.object(app.phones,'check',return_value='ok'):
        response = await app.local_only(request, next_handler)
        assert response.status_code == 403
        next_handler.assert_not_called()
asyncio.run(check_phone())
"""
        with tempfile.TemporaryDirectory() as temporary:
            environment = {**os.environ, "SPOTDLR_DATA_DIR": str(Path(temporary) / "data"),
                           "SPOTDLR_MUSIC_DIR": str(Path(temporary) / "music")}
            subprocess.run([sys.executable, "-c", code], env=environment, cwd=ROOT, check=True)
