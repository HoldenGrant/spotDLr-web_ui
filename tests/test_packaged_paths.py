import json
import os
from pathlib import Path
import subprocess
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

    def test_windows_bundled_tools_still_work(self):
        tools = {"node.exe": "C:/bundle/node.exe", "ffmpeg.exe": "C:/bundle/ffmpeg.exe"}
        with patch("paths.bundled", side_effect=tools.get):
            self.assertEqual(ytmusic.js_runtime(), ("node", tools["node.exe"]))
            self.assertEqual(ytmusic.ffmpeg_path(), tools["ffmpeg.exe"])


if __name__ == "__main__":
    unittest.main()
