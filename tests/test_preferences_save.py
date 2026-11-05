import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

import app

# Settings change in bursts, and each change is saved as its own request. Two saves at once shared one temporary file:
# the second's rename found it gone ("No such file or directory"), and one save could overwrite the other's change.


class PreferenceSaveTests(unittest.TestCase):
    def test_saves_at_the_same_time_all_land_and_none_fail(self):
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(app, "CLIENT_PREFERENCES_FILE", Path(folder) / "client-preferences.json"):
            failures = []

            def save(i):
                try:
                    app.save_client_preferences({f"setting{i}": i})
                except Exception as error:  # noqa: BLE001 - the test reports whatever went wrong
                    failures.append(repr(error))

            threads = [threading.Thread(target=save, args=(i,)) for i in range(40)]
            for thread in threads: thread.start()
            for thread in threads: thread.join()
            saved = json.loads((Path(folder) / "client-preferences.json").read_text())
            self.assertEqual(failures, [])
            self.assertEqual(saved, {f"setting{i}": i for i in range(40)})


if __name__ == "__main__":
    unittest.main()
