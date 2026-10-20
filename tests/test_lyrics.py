import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from lyrics import Lyrics, LyricsError, parse_lrc


class SaveExistingLyricsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.lyrics = Lyrics(self.root / "cache")
        self.track = {"title": "Song", "artists": ["Artist"], "duration": 123, "path": "Song.mp3"}
        self.audio = self.root / self.track["path"]
        self.audio.write_bytes(b"original audio")
        self.result = {"lines": [{"t": 17.04, "text": "Café"}, {"t": 65.5, "text": "Next line"}]}

    def test_saves_utf8_synced_lyrics_without_changing_audio(self):
        with patch.object(self.lyrics, "lookup", return_value=self.result) as lookup:
            self.assertEqual(self.lyrics.save_existing(self.track, self.audio), "saved")
        lookup.assert_called_once_with("Song", ["Artist"], 123)
        text = self.audio.with_suffix(".lrc").read_text(encoding="utf-8")
        self.assertEqual(text, "[00:17.04]Café\n[01:05.50]Next line\n")
        self.assertEqual(parse_lrc(text), self.result["lines"])
        self.assertEqual(self.audio.read_bytes(), b"original audio")

    def test_existing_sidecar_is_kept_without_a_lookup(self):
        lrc = self.audio.with_suffix(".lrc")
        lrc.write_bytes(b"my custom lyrics")
        with patch.object(self.lyrics, "lookup") as lookup:
            self.assertEqual(self.lyrics.save_existing(self.track, self.audio), "existing")
        lookup.assert_not_called()
        self.assertEqual(lrc.read_bytes(), b"my custom lyrics")

    def test_sidecar_created_during_lookup_is_kept(self):
        def lookup(*args):
            self.audio.with_suffix(".lrc").write_text("custom lyrics", encoding="utf-8")
            return self.result

        with patch.object(self.lyrics, "lookup", side_effect=lookup):
            self.assertEqual(self.lyrics.save_existing(self.track, self.audio), "existing")
        self.assertEqual(self.audio.with_suffix(".lrc").read_text(), "custom lyrics")

    def test_plain_instrumental_and_missing_results_create_no_file(self):
        for result in ({"lines": None, "plain": "Words"}, {"lines": None, "instrumental": True}, {"lines": None}):
            with self.subTest(result=result), patch.object(self.lyrics, "lookup", return_value=result):
                self.assertEqual(self.lyrics.save_existing(self.track, self.audio), "unavailable")
                self.assertFalse(self.audio.with_suffix(".lrc").exists())

    def test_service_error_is_reported_and_can_be_retried(self):
        with patch.object(self.lyrics, "lookup", side_effect=LyricsError("Service offline")):
            with self.assertRaises(LyricsError):
                self.lyrics.save_existing(self.track, self.audio)
        self.assertFalse(self.audio.with_suffix(".lrc").exists())
        with patch.object(self.lyrics, "lookup", return_value=self.result):
            self.assertEqual(self.lyrics.save_existing(self.track, self.audio), "saved")

    def test_missing_audio_and_unwritable_sidecar_report_errors(self):
        with self.assertRaises(OSError):
            self.lyrics.save_existing(self.track, self.root / "missing.mp3")
        with patch.object(self.lyrics, "lookup", return_value=self.result), \
                patch.object(Path, "open", side_effect=PermissionError("Read-only folder")):
            with self.assertRaises(PermissionError):
                self.lyrics.save_existing(self.track, self.audio)

    def test_batch_reports_outcomes_and_prevents_overlapping_passes(self):
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        tracks = [dict(self.track, title=name) for name in ("saved", "existing", "unavailable", "failed", "last")]

        def save(track, path):
            if track["title"] == "saved":
                entered.set()
                if not release.wait(2):
                    raise RuntimeError("Test timed out")
            if track["title"] == "failed":
                raise LyricsError("Service offline")
            return "saved" if track["title"] == "last" else track["title"]

        worker = self.lyrics._save_library

        def run(*args):
            try:
                worker(*args)
            finally:
                finished.set()

        with patch.object(self.lyrics, "save_existing", side_effect=save) as save_mock, \
                patch.object(self.lyrics, "_save_library", side_effect=run):
            status = self.lyrics.start_save(tracks, self.root)
            self.assertTrue(status["running"])
            self.assertTrue(entered.wait(2))
            self.assertEqual(self.lyrics.start_save([], self.root)["total"], 5)
            release.set()
            self.assertTrue(finished.wait(2))
        self.assertEqual(save_mock.call_count, 5)
        self.assertEqual(self.lyrics.save_status(), {
            "running": False, "done": 5, "total": 5, "saved": 2,
            "existing": 1, "unavailable": 1, "failed": 1, "error": "failed: Service offline",
        })

    def test_empty_batch_finishes(self):
        with patch("lyrics.threading.Thread") as thread:
            self.lyrics.start_save([], self.root)
            thread.assert_called_once()
        self.lyrics._save_library([], self.root)
        self.assertFalse(self.lyrics.save_status()["running"])
        self.assertEqual(self.lyrics.save_status()["total"], 0)


if __name__ == "__main__":
    unittest.main()
