import time
import unittest

from app import RemotePlayback


class RemotePlaybackTests(unittest.TestCase):
    def setUp(self):
        self.remote = RemotePlayback()

    def test_publishes_state_and_delivers_commands_once(self):
        state = {"track_id": "song-1", "playing": True, "time": 12.5}
        self.assertEqual(self.remote.publish("mac", "Holden's Mac", state), {"commands": []})
        self.assertEqual(self.remote.status()["state"], state)

        self.remote.command("pause", None)
        result = self.remote.publish("mac", "Holden's Mac", state)
        self.assertEqual(result["commands"], [{"action": "pause", "value": None}])
        self.assertEqual(self.remote.publish("mac", "Holden's Mac", state), {"commands": []})

    def test_rejects_unknown_commands_and_offline_sources(self):
        with self.assertRaises(RuntimeError):
            self.remote.command("play", None)
        self.remote.publish("mac", "Mac", {})
        with self.assertRaises(ValueError):
            self.remote.command("erase_library", None)
        self.remote.source["seen"] = time.time() - 6
        self.assertFalse(self.remote.status()["online"])

    def test_an_idle_second_window_does_not_steal_the_player(self):
        self.remote.publish("app", "Mac app", {"playing": True})
        self.remote.command("next", None)
        self.assertEqual(self.remote.publish("browser", "Browser", {"playing": False})["commands"], [])
        self.assertEqual(self.remote.status()["source"]["id"], "app")
        self.assertEqual(self.remote.publish("app", "Mac app", {"playing": True})["commands"][0]["action"], "next")


if __name__ == "__main__":
    unittest.main()
