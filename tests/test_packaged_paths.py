import json
import os
from pathlib import Path
import subprocess
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

import ytmusic


class PackagedPathsTests(unittest.TestCase):
    def test_mac_data_is_outside_bundle_and_overrides_are_preserved(self):
        paths_file = Path(__file__).resolve().parents[1] / "paths.py"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            script = """
import json, runpy, sys
sys.frozen = True
sys._MEIPASS = sys.argv[2]
sys.platform = 'darwin'
p = runpy.run_path(sys.argv[1])
print(json.dumps({key: str(p[key]) for key in ('APP_DIR', 'DATA_DIR', 'MUSIC_DIR')}))
"""
            environment = {**os.environ, "HOME": str(root)}
            for key in ("SPOTDLR_DATA_DIR", "SPOTDLR_MUSIC_DIR"):
                environment.pop(key, None)
            command = [sys.executable, "-c", script, str(paths_file), str(root / "App/Resources")]
            defaults = json.loads(subprocess.check_output(command, env=environment))
            self.assertEqual(defaults["DATA_DIR"], str(root / "Library/Application Support/spotDLr"))
            self.assertEqual(defaults["MUSIC_DIR"], str(root / "Music/spotDLr"))
            self.assertFalse(Path(defaults["APP_DIR"]).exists())
            environment.update(SPOTDLR_DATA_DIR=str(root / "custom data"), SPOTDLR_MUSIC_DIR=str(root / "custom music"))
            custom = json.loads(subprocess.check_output(command, env=environment))
            self.assertEqual(custom["DATA_DIR"], environment["SPOTDLR_DATA_DIR"])
            self.assertEqual(custom["MUSIC_DIR"], environment["SPOTDLR_MUSIC_DIR"])

    def test_bundled_mac_tools_win_over_system_tools(self):
        tools = {"node": "/bundle/bin/node", "ffmpeg": "/bundle/bin/ffmpeg"}
        with patch("paths.bundled", side_effect=tools.get), patch("shutil.which") as system:
            self.assertEqual(ytmusic.js_runtime(), ("node", tools["node"]))
            self.assertEqual(ytmusic.ffmpeg_path(), tools["ffmpeg"])
            system.assert_not_called()

    def test_first_packaged_launch_reuses_source_library_and_data(self):
        paths_file = Path(__file__).resolve().parents[1] / "paths.py"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            resources = root / "App/Resources"
            legacy = root / "source"
            (legacy / "downloads/Album").mkdir(parents=True)
            (legacy / "downloads/Album/song.mp3").write_bytes(b"audio")
            (legacy / "likes.json").write_text('{"song": 1}', encoding="utf-8")
            resources.mkdir(parents=True)
            (resources / "source-migration.json").write_text(json.dumps({
                "music_dir": str(legacy / "downloads"), "data_dir": str(legacy),
            }), encoding="utf-8")
            script = """
import json, runpy, sys
sys.frozen = True
sys._MEIPASS = sys.argv[2]
sys.platform = 'darwin'
p = runpy.run_path(sys.argv[1])
print(json.dumps({key: str(p[key]) for key in ('DATA_DIR', 'MUSIC_DIR')}))
"""
            environment = {**os.environ, "HOME": str(root)}
            for key in ("SPOTDLR_DATA_DIR", "SPOTDLR_MUSIC_DIR"):
                environment.pop(key, None)
            result = json.loads(subprocess.check_output(
                [sys.executable, "-c", script, str(paths_file), str(resources)], env=environment
            ))
            self.assertEqual(result["MUSIC_DIR"], str(legacy / "downloads"))
            data = Path(result["DATA_DIR"])
            self.assertEqual(json.loads((data / "library-location.json").read_text())["music_dir"],
                             str(legacy / "downloads"))
            self.assertEqual((data / "likes.json").read_text(), '{"song": 1}')

    def test_first_packaged_launch_recovers_launcher_theme(self):
        paths_file = Path(__file__).resolve().parents[1] / "paths.py"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            resources = root / "Resources"
            resources.mkdir()
            database = root / "Library/WebKit/com.holdengrant.spotdlr.launcher/WebsiteData/Default/a/a/LocalStorage/localstorage.sqlite3"
            database.parent.mkdir(parents=True)
            connection = sqlite3.connect(database)
            connection.execute("CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB NOT NULL ON CONFLICT FAIL)")
            colors = '[{"id":"custom-test-color","name":"Sunset","color":"#ff4013"}]'
            for key, value in (("spotdlr.customColors", colors), ("spotdlr.theme", '"custom-test-color"')):
                connection.execute("INSERT INTO ItemTable VALUES (?, ?)", (key, value.encode("utf-16le")))
            connection.commit()
            connection.close()
            script = """
import runpy, sys
sys.frozen = True
sys._MEIPASS = sys.argv[2]
sys.platform = 'darwin'
runpy.run_path(sys.argv[1])
"""
            environment = {**os.environ, "HOME": str(root)}
            for key in ("SPOTDLR_DATA_DIR", "SPOTDLR_MUSIC_DIR"):
                environment.pop(key, None)
            subprocess.check_call([sys.executable, "-c", script, str(paths_file), str(resources)], env=environment)
            saved = json.loads((root / "Library/Application Support/spotDLr/theme.json").read_text())
            self.assertEqual(saved["customColors"][0]["name"], "Sunset")
            self.assertEqual(saved["theme"], "custom-test-color")
            client = json.loads((root / "Library/Application Support/spotDLr/client-preferences.json").read_text())
            self.assertEqual(client["customColors"][0]["name"], "Sunset")

    def test_windows_bundled_tools_still_work(self):
        tools = {"node.exe": "C:/bundle/node.exe", "ffmpeg.exe": "C:/bundle/ffmpeg.exe"}
        with patch("paths.bundled", side_effect=tools.get):
            self.assertEqual(ytmusic.js_runtime(), ("node", tools["node.exe"]))
            self.assertEqual(ytmusic.ffmpeg_path(), tools["ffmpeg.exe"])


if __name__ == "__main__":
    unittest.main()
