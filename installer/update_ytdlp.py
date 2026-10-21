"""Bring yt-dlp up to date, and the yt-dlp-ejs package in step with it.

YouTube keeps changing how it guards audio links, and an old yt-dlp gets HTTP 403 on every song (seen Oct 21, 2026
with a 10-month-old copy). A package freezes yt-dlp on the day it's built, so both build scripts run this first, and
run.sh / server.ps1 run it once a week for spotDLr started from the source folder.

yt-dlp carries its own copy of the challenge solver and only uses the yt-dlp-ejs package when its major.minor
version matches that copy, so the package follows yt-dlp here rather than the pin in requirements.txt.
"""
import subprocess
import sys


def pip_install(*packages):
    return subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "--upgrade", "--disable-pip-version-check", *packages]).returncode == 0


def ask(code):
    # A fresh interpreter, because this one may still have the old yt-dlp loaded
    return subprocess.run([sys.executable, "-c", code], capture_output=True, text=True).stdout.strip()


if not pip_install("yt-dlp"):
    sys.exit("Could not update yt-dlp (offline?)")
solver = ask("from yt_dlp.extractor.youtube.jsc._builtin import vendor; print(vendor.VERSION)")
major_minor = ".".join(solver.split(".")[:2])
if solver and not pip_install(f"yt-dlp-ejs~={major_minor}.0"):
    print(f"Note: no yt-dlp-ejs {major_minor}.x yet; yt-dlp uses its built-in solver {solver}.")
print(ask("import yt_dlp, importlib.util as u; e = u.find_spec('yt_dlp_ejs') and __import__('yt_dlp_ejs').version; "
          "print(f'yt-dlp {yt_dlp.version.__version__}, solver package {e or \"none\"}')"))
