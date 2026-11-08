import hashlib
import http.server
import os
import plistlib
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

import updater

# "Check for updates" now installs. These run the real download + checksum code against a local web server, and on a
# Mac the real swap (hdiutil, ditto, codesign and the detached script) on a pretend app in a temporary folder.


def serve(folder):
    handler = lambda *args, **kwargs: http.server.SimpleHTTPRequestHandler(*args, directory=str(folder), **kwargs)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def asset_for(folder, name, payload, **overrides):
    (folder / name).write_bytes(payload)
    base = f"http://127.0.0.1:{overrides.pop('port')}/"
    asset = {"name": name, "size": len(payload), "digest": "sha256:" + hashlib.sha256(payload).hexdigest(), "browser_download_url": base + name}
    asset.update(overrides)
    return asset, base


class VersionTests(unittest.TestCase):
    def test_versions_compare_as_numbers_not_text(self):
        self.assertGreater(updater.version_tuple("v2.6.1"), updater.version_tuple("2.6.0"))
        self.assertGreater(updater.version_tuple("2.10.0"), updater.version_tuple("2.9.9"))
        self.assertEqual(updater.version_tuple("v2.6"), updater.version_tuple("2.6.0"))

    def test_each_computer_gets_its_own_download(self):
        release = {"assets": [{"name": "spotDLr-2.7.0-mac-arm64.dmg"}, {"name": "spotDLr-2.7.0-mac-arm64.dmg.sha256"}, {"name": "spotDLr-Setup.exe"}]}
        with mock.patch.object(sys, "platform", "win32"):
            self.assertEqual(updater.pick_asset(release)["name"], "spotDLr-Setup.exe")
        with mock.patch.object(sys, "platform", "darwin"), mock.patch("updater.platform.machine", return_value="arm64"):
            self.assertEqual(updater.pick_asset(release)["name"], "spotDLr-2.7.0-mac-arm64.dmg")  # not the .sha256 beside it
        with mock.patch.object(sys, "platform", "darwin"), mock.patch("updater.platform.machine", return_value="x86_64"):
            self.assertIsNone(updater.pick_asset(release))  # the DMG is Apple Silicon only
        with mock.patch.object(sys, "platform", "linux"):
            self.assertIsNone(updater.pick_asset(release))

    def test_source_runs_are_told_to_use_git_instead(self):
        with mock.patch.object(updater, "FROZEN", False):
            ok, why = updater.can_install({"name": "x"})
        self.assertFalse(ok)
        self.assertIn("git pull", why)


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.folder, ignore_errors=True)
        self.server = serve(self.folder)
        self.addCleanup(self.server.shutdown)
        self.port = self.server.server_address[1]
        patcher = mock.patch.object(updater, "UPDATES", self.folder / "updates")
        patcher.start()
        self.addCleanup(patcher.stop)

    def download(self, payload=b"installer bytes" * 1000, **overrides):
        asset, base = asset_for(self.folder, "spotDLr-Setup.exe", payload, port=self.port, **overrides)
        with mock.patch.object(updater, "DOWNLOAD_PREFIX", base):
            return updater._download(asset)

    def test_a_matching_download_is_kept(self):
        path = self.download()
        self.assertTrue(path.is_file())
        self.assertEqual(path.read_bytes(), b"installer bytes" * 1000)

    def test_a_damaged_download_is_refused_and_removed(self):
        with self.assertRaisesRegex(updater.UpdateError, "damaged"):
            self.download(digest="sha256:" + "0" * 64)
        self.assertEqual(list((self.folder / "updates").glob("spotDLr-Setup.exe*")), [])

    def test_a_download_without_a_published_checksum_is_refused(self):
        with self.assertRaisesRegex(updater.UpdateError, "no checksum"):
            self.download(digest=None)

    def test_a_download_from_anywhere_but_the_projects_releases_is_refused(self):
        asset, _ = asset_for(self.folder, "spotDLr-Setup.exe", b"x" * 10, port=self.port)  # prefix NOT patched: GitHub's
        with self.assertRaisesRegex(updater.UpdateError, "isn't from spotDLr's GitHub"):
            updater._download(asset)

    def test_progress_is_reported_while_downloading(self):
        seen = []
        with mock.patch.object(updater, "_set", side_effect=lambda **values: seen.append(values)):
            self.download(payload=os.urandom(3 * 1024 * 1024))
        self.assertTrue(any(0 < v.get("percent", 0) < 100 for v in seen))


class RunTests(unittest.TestCase):
    def setUp(self):
        updater._set(phase="idle", percent=0, version=None, error=None)  # an earlier test's download leaves "downloading" behind

    def tearDown(self):
        updater._set(phase="idle", percent=0, version=None, error=None)

    def finished(self):
        for _ in range(100):
            if updater.status()["phase"] not in ("starting", "downloading", "installing"):
                return updater.status()
            time.sleep(0.05)
        self.fail("update never finished")

    def test_already_up_to_date_is_said_plainly_and_nothing_runs(self):
        with mock.patch.object(updater, "fetch_latest", return_value={"tag_name": f"v{updater.VERSION}", "assets": []}):
            updater.start()
            state = self.finished()
        self.assertEqual(state["phase"], "error")
        self.assertIn("up to date", state["error"])

    def test_only_one_update_runs_at_a_time(self):
        updater._set(phase="downloading")
        with mock.patch.object(updater.threading, "Thread") as thread:
            updater.start()
        thread.assert_not_called()

    def test_windows_runs_the_installer_silently_then_reopens_spotdlr(self):
        command = updater.windows_command(r"C:\Users\O'Neil\AppData\Local\spotDLr\updates\spotDLr-Setup.exe", r"C:\Users\O'Neil\AppData\Local\Programs\spotDLr\spotDLr.exe")
        self.assertIn("/VERYSILENT", command)
        self.assertIn("/CLOSEAPPLICATIONS", command)
        self.assertIn("-Wait", command)
        self.assertIn("O''Neil", command)  # a quote in a folder name can't break out of the string
        self.assertLess(command.index("Setup.exe"), command.index("Start-Process -FilePath 'C:\\Users\\O''Neil\\AppData\\Local\\Programs"))


@unittest.skipUnless(sys.platform == "darwin" and shutil.which("hdiutil"), "the swap is a Mac procedure")
class MacSwapTests(unittest.TestCase):
    def make_app(self, folder, version):
        app = folder / "spotDLr.app"
        (app / "Contents" / "MacOS").mkdir(parents=True)
        (app / "Contents" / "Helpers").mkdir()
        (app / "Contents" / "Info.plist").write_bytes(plistlib.dumps({
            "CFBundleName": "spotDLr", "CFBundleIdentifier": "com.example.updatetest", "CFBundleExecutable": "spotDLr",
            "CFBundlePackageType": "APPL", "CFBundleShortVersionString": version, "CFBundleVersion": "1"}))
        launcher = app / "Contents" / "MacOS" / "spotDLr"
        launcher.write_text("#!/bin/bash\nsleep 300\n")
        launcher.chmod(0o755)
        subprocess.run(["codesign", "--force", "--sign", "-", str(app)], check=True, capture_output=True)
        return app

    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.applications = self.root / "Applications"
        self.applications.mkdir()
        self.installed = self.make_app(self.applications, "1.0.0")
        built = self.root / "built"
        built.mkdir()
        self.make_app(built, "9.9.9")
        self.dmg = self.root / "update.dmg"
        subprocess.run(["hdiutil", "create", "-volname", "spotDLr", "-srcfolder", str(built), "-ov", "-format", "UDZO", str(self.dmg)], check=True, capture_output=True)
        # the running app: its window process is the installed app's own executable
        self.host = subprocess.Popen([str(self.installed / "Contents" / "MacOS" / "spotDLr")], start_new_session=True,
                                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.addCleanup(self.stop_host)
        self.opened = self.root / "opened.txt"
        stub = self.root / "open-stub.sh"
        stub.write_text(f'#!/bin/bash\necho "$1" > "{self.opened}"\n')
        stub.chmod(0o755)
        for patcher in (mock.patch.object(updater, "UPDATES", self.root / "updates"), mock.patch.dict(os.environ, {"SPOTDLR_UPDATE_OPEN": str(stub)})):
            patcher.start()
            self.addCleanup(patcher.stop)
        (self.root / "updates").mkdir()

    def stop_host(self):
        try:
            os.killpg(self.host.pid, signal.SIGKILL)  # the launcher's own `sleep` too, which outlives it when the launcher is killed
        except ProcessLookupError:
            pass
        self.host.wait()

    def version_installed(self):
        return plistlib.loads((self.installed / "Contents" / "Info.plist").read_bytes())["CFBundleShortVersionString"]

    def test_the_new_app_replaces_the_old_one_and_is_opened(self):
        updater._install_mac(self.dmg, self.installed, self.host.pid, "9.9.9")
        for _ in range(200):
            if self.opened.exists():
                break
            time.sleep(0.1)
        self.assertTrue(self.opened.exists(), (self.root / "updates" / "swap.log").read_text())
        self.assertEqual(self.opened.read_text().strip(), str(self.installed))
        self.assertEqual(self.version_installed(), "9.9.9")
        self.assertEqual(sorted(p.name for p in self.applications.iterdir()), ["spotDLr.app"])  # no staged copy, no .old copy left
        self.assertIsNotNone(self.host.wait(timeout=5))  # the old app was closed
        subprocess.run(["codesign", "--verify", "--deep", "--strict", str(self.installed)], check=True)

    def test_a_download_of_the_wrong_version_changes_nothing(self):
        with self.assertRaisesRegex(updater.UpdateError, "9.9.9, not 5.0.0"):
            updater._install_mac(self.dmg, self.installed, self.host.pid, "5.0.0")
        self.assertEqual(self.version_installed(), "1.0.0")
        self.assertEqual(sorted(p.name for p in self.applications.iterdir()), ["spotDLr.app"])
        self.assertIsNone(self.host.poll())  # still running: nothing was closed

    def test_it_will_not_close_a_process_that_is_not_the_app(self):
        other = subprocess.Popen(["sleep", "60"])
        self.addCleanup(other.kill)
        with self.assertRaisesRegex(updater.UpdateError, "Couldn't find the spotDLr window"):
            updater._install_mac(self.dmg, self.installed, other.pid, "9.9.9")
        self.assertIsNone(other.poll())
        self.assertEqual(self.version_installed(), "1.0.0")


if __name__ == "__main__":
    unittest.main()
