import threading
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

    def test_waiting_source_wakes_as_soon_as_a_command_arrives(self):
        state = {"playing": True, "volume": 1}
        self.remote.publish("mac", "Mac", state)
        result = {}
        waiting = threading.Event()

        def publish_and_wait():
            waiting.set()
            result.update(self.remote.publish("mac", "Mac", state, wait=1))

        thread = threading.Thread(target=publish_and_wait)
        thread.start()
        waiting.wait(timeout=0.5)
        time.sleep(0.02)
        started = time.monotonic()
        self.remote.command("volume", 0.35)
        thread.join(timeout=0.5)

        self.assertFalse(thread.is_alive())
        self.assertLess(time.monotonic() - started, 0.5)
        self.assertEqual(result["commands"], [{"action": "volume", "value": 0.35}])

    def test_transfer_delivers_the_complete_playback_snapshot(self):
        self.remote.publish("mac", "Mac", {"playing": False})
        snapshot = {"track_id": "song-1", "time": 42, "playing": True,
                    "queue": ["song-1", "song-2"], "shuffle": True, "repeat": "all"}
        self.remote.command("transfer", snapshot)

        result = self.remote.publish("mac", "Mac", {"playing": False})

        self.assertEqual(result["commands"], [{"action": "transfer", "value": snapshot}])


if __name__ == "__main__":
    unittest.main()
