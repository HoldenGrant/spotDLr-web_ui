import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

import ytmusic

ROOT = Path(__file__).resolve().parents[1]
CASES = json.loads((Path(__file__).with_name("youtube_urls.json")).read_text())
VIDEO_ID = "8PTDv_szmL0"


class YouTubeURLTests(unittest.TestCase):
    def test_youtube_urls_keep_their_exact_ids(self):
        client = Mock()
        client.get_album_browse_id.return_value = "MPREb_example"
        with patch.object(ytmusic, "_client", return_value=client):
            for case in CASES:
                with self.subTest(url=case["url"]):
                    self.assertEqual(ytmusic.parse_url(case["url"]),
                                     (case.get("resolvedKind", case["kind"]), case.get("resolvedId", case["id"])))

    def test_invalid_youtube_links_fail_instead_of_becoming_text_searches(self):
        for url in ("https://youtube.com/watch?v=short", "https://youtu.be/8PTDv_szmL0extra",
                    "https://music.youtube.com/watch?v=", "https://youtube.com/watch", "https://youtube.com/playlist"):
            with self.subTest(url=url), self.assertRaises(ytmusic.YTMusicError):
                ytmusic.parse_url(url)

    def test_plain_text_and_unrelated_hosts_are_not_youtube_links(self):
        for text in ("B.o.B Nothin' On You", "https://notyoutube.com/watch?v=" + VIDEO_ID,
                     "https://music.youtube.com.example.org/watch?v=" + VIDEO_ID):
            with self.subTest(text=text):
                self.assertIsNone(ytmusic.parse_url(text))

    @unittest.skipUnless(shutil.which("node"), "Node.js is needed for frontend URL tests")
    def test_frontend_uses_the_same_urls(self):
        subprocess.run(["node", str(ROOT / "tests/test_youtube_urls.js")], check=True, cwd=ROOT)

    def test_download_api_does_not_search_for_a_video_url(self):
        # Import the actual route in an isolated process: never load personal .env or music.
        code = """
from unittest.mock import patch
import app
for connected, frozen in ((False, False), (True, False), (True, True)):
    with patch.object(app.spotify_api, 'check', return_value=(connected, None)), \\
         patch.object(app, 'FROZEN', frozen), \\
         patch.object(app.ytmusic, 'search', side_effect=AssertionError('An exact URL must not be searched')), \\
         patch.object(app.ytmusic, 'describe', return_value=('B.o.B - Nothin On You', None, 1)), \\
         patch.object(app.downloader, 'submit', side_effect=lambda **kwargs: kwargs):
        job = app.download(app.DownloadRequest(query='https://www.youtube.com/watch?v=8PTDv_szmL0'))
        assert job['item_id'] == '8PTDv_szmL0', job
        assert job['source'] == 'ytm', job
        assert job['kind'] == 'track', job
"""
        with tempfile.TemporaryDirectory() as temporary:
            environment = {**os.environ, "SPOTDLR_DATA_DIR": str(Path(temporary) / "data"),
                           "SPOTDLR_MUSIC_DIR": str(Path(temporary) / "music")}
            subprocess.run([sys.executable, "-c", code], env=environment, cwd=ROOT, check=True)


class ExactVideoMetadataTests(unittest.TestCase):
    def test_watch_queue_recommendations_cannot_supply_the_tags(self):
        client = Mock()
        client.get_watch_playlist.return_value = {"tracks": [
            {"videoId": "OTHERid1234", "title": "Wrong song", "artists": [{"name": "Wrong artist"}]},
            {"videoId": VIDEO_ID, "title": "Nothin' On You", "artists": [{"name": "B.o.B"}]}]}
        with patch.object(ytmusic, "_client", return_value=client):
            meta = ytmusic.track_meta(VIDEO_ID)
        self.assertEqual(meta["video_id"], VIDEO_ID)
        self.assertEqual(meta["title"], "Nothin' On You")
        self.assertEqual(meta["artists"], ["B.o.B"])

    def test_missing_requested_video_fails_instead_of_using_a_recommendation(self):
        client = Mock()
        for tracks in ([], [{"videoId": "OTHERid1234", "title": "Wrong song"}]):
            client.get_watch_playlist.return_value = {"tracks": tracks}
            with self.subTest(tracks=tracks), patch.object(ytmusic, "_client", return_value=client), self.assertRaises(ytmusic.YTMusicError):
                ytmusic.track_meta(VIDEO_ID)


if __name__ == "__main__":
    unittest.main()
