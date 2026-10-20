import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import cleanup
from downloader import write_playlist
from library import Library, _read_playlist
from organize import Likes


class DeleteTrackTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.root = self.directory / "music"
        self.root.mkdir()
        self.trash = self.directory / "trash"
        self.fallback = self.directory / "Removed songs"
        self.likes = Likes(self.directory / "likes.json")
        self.song = self.root / "Artist - Wrong song.mp3"
        self.song.write_bytes(b"test audio")
        self.other = self.root / "Artist - Keep me.mp3"
        self.other.write_bytes(b"other audio")
        self.library = Library(self.root)
        self.tracks = self.library.scan()
        self.track_id = next(t["id"] for t in self.tracks if t["path"] == self.song.name)
        self.other_id = next(t["id"] for t in self.tracks if t["path"] == self.other.name)
        environment = patch.dict(os.environ, {"SPOTDLR_TRASH_DIR": str(self.trash)})
        environment.start()
        self.addCleanup(environment.stop)

    def delete(self, track_id=None):
        return cleanup.delete_track(self.root, self.tracks, track_id or self.track_id, self.likes, self.fallback)

    def test_trashes_audio_and_lyrics_and_cleans_playlists_and_likes(self):
        self.song.with_suffix(".lrc").write_text("[00:01.00]Words")
        self.likes.set(self.track_id, True)
        self.likes.set(self.other_id, True)
        for name in ("Favorites", "Downloaded playlist"):
            write_playlist(self.root / name, [self.other, self.song, self.other])
        result = self.delete()
        self.assertEqual(result, {"deleted": self.track_id, "trash": "the Trash"})
        self.assertEqual((self.trash / self.song.name).read_bytes(), b"test audio")
        self.assertTrue((self.trash / self.song.with_suffix(".lrc").name).is_file())
        self.assertFalse(self.song.exists())
        self.assertFalse(self.song.with_suffix(".lrc").exists())
        self.assertEqual(self.other.read_bytes(), b"other audio")
        self.assertEqual(self.likes.ids(), [self.other_id])
        for name in ("Favorites", "Downloaded playlist"):
            self.assertEqual(_read_playlist(self.root / name / "playlist.m3u8", self.root), [self.other.name, self.other.name])
        self.assertEqual([t["id"] for t in self.library.scan()], [self.other_id])

    def test_last_song_leaves_an_empty_user_playlist(self):
        write_playlist(self.root / "My playlist", [self.song])
        self.delete()
        collection = next(c for c in self.library.snapshot()["collections"] if c["key"] == "My playlist")
        self.assertEqual(collection["track_ids"], [])
        self.assertTrue(collection["editable"])

    def test_unknown_or_missing_song_does_not_change_other_files(self):
        with self.assertRaises(cleanup.CleanupError) as error:
            self.delete("unknown")
        self.assertEqual(error.exception.status, 404)
        self.song.unlink()
        with self.assertRaises(cleanup.CleanupError) as error:
            self.delete()
        self.assertEqual(error.exception.status, 404)
        self.assertTrue(self.other.exists())
        self.assertFalse(self.trash.exists())

    def test_failed_trash_keeps_playlist_and_like_references(self):
        self.likes.set(self.track_id, True)
        write_playlist(self.root / "Favorites", [self.song])
        with patch.object(cleanup, "trash", side_effect=PermissionError("File busy")), self.assertRaises(cleanup.CleanupError):
            self.delete()
        self.assertTrue(self.song.exists())
        self.assertIn(self.track_id, self.likes.ids())
        self.assertEqual(_read_playlist(self.root / "Favorites/playlist.m3u8", self.root), [self.song.name])

    def test_shared_lyrics_stay_with_the_other_audio_format(self):
        self.song.with_suffix(".flac").write_bytes(b"another format")
        lrc = self.song.with_suffix(".lrc")
        lrc.write_text("Shared lyrics")
        self.tracks = self.library.scan()
        self.delete()
        self.assertEqual(lrc.read_text(), "Shared lyrics")

    def test_outside_library_path_is_rejected(self):
        outside = self.directory / "outside.mp3"
        outside.write_bytes(b"untouched")
        self.tracks = [{"id": "outside", "path": "../outside.mp3"}]
        with self.assertRaises(cleanup.CleanupError) as error:
            self.delete("outside")
        self.assertEqual(error.exception.status, 403)
        self.assertEqual(outside.read_bytes(), b"untouched")

    def test_trash_name_collision_preserves_both_files(self):
        self.trash.mkdir()
        (self.trash / self.song.name).write_bytes(b"already trashed")
        self.delete()
        self.assertEqual((self.trash / self.song.name).read_bytes(), b"already trashed")
        self.assertEqual((self.trash / (self.song.stem + " (2).mp3")).read_bytes(), b"test audio")

    @unittest.skipUnless(shutil.which("node"), "Node.js is needed for queue tests")
    def test_frontend_queue_keeps_play_order(self):
        subprocess.run(["node", str(Path(__file__).with_suffix(".js"))], check=True)


if __name__ == "__main__":
    unittest.main()
