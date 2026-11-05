import os
import re
import unittest

from app import BASE_DIR, asset_version, root, service_worker

# A phone saves /static files and serves them from that copy keyed by URL (static/sw.js), so a change to the page's
# files must change the URL, or the phone keeps the old app. This once needed a tag bumped by hand, and was forgotten.


class AssetVersionTests(unittest.TestCase):
    def test_page_and_worker_use_the_same_tag_and_leave_no_placeholder(self):
        page = root().body.decode()
        worker = service_worker().body.decode()
        tag = asset_version()
        self.assertNotIn("__ASSET_V__", page + worker)
        self.assertEqual(set(re.findall(r"app\.(?:js|css)\?v=(\w+)", page)), {tag})
        self.assertIn(f"spotdlr-phone-{tag}", worker)
        self.assertIn(f"/static/app.js?v={tag}", worker)

    def test_tag_changes_when_a_page_file_changes(self):
        path = BASE_DIR / "static" / "app.css"
        stat = path.stat()
        before = asset_version()
        try:
            os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))
            self.assertNotEqual(before, asset_version())
        finally:
            os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns))
        self.assertEqual(before, asset_version())

    def test_phone_uses_the_live_page_when_it_is_reachable(self):
        worker = (BASE_DIR / "static" / "sw.js").read_text()
        self.assertIn("return network.catch(() => cached);", worker)
        self.assertNotIn("Promise.race([network", worker)


if __name__ == "__main__":
    unittest.main()
