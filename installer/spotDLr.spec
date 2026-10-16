# PyInstaller build for spotDLr (used by the Windows installer workflow; also builds on macOS for testing).
#   pyinstaller installer/spotDLr.spec --noconfirm
# Windows: put ffmpeg.exe and node.exe in installer/bin/ first (the workflow downloads them).
import os
import sys
from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))
IS_WIN = sys.platform == "win32"

datas = [(os.path.join(ROOT, "index.html"), "."), (os.path.join(ROOT, "static"), "static")]
binaries = []
hiddenimports = collect_submodules("uvicorn")  # uvicorn picks its loop/protocol modules by name at runtime

# Packages whose data files or plugins PyInstaller can't see from imports alone
for package in ("ytmusicapi", "yt_dlp_ejs", "yt_dlp"):
    package_datas, package_binaries, package_hidden = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hidden

# Bundled tools (Windows): yt-dlp needs ffmpeg for audio and Node.js for YouTube's JS challenge
bin_dir = os.path.join(ROOT, "installer", "bin")
for tool in ("ffmpeg.exe", "node.exe"):
    if os.path.exists(os.path.join(bin_dir, tool)):
        binaries.append((os.path.join(bin_dir, tool), "bin"))

a = Analysis(
    [os.path.join(ROOT, "desktop.py")],
    pathex=[ROOT],
    datas=datas,
    binaries=binaries,
    hiddenimports=hiddenimports,
    excludes=["spotdl", "tkinter", "matplotlib", "numpy", "PIL"],  # spotDL is never used in the installed app
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="spotDLr",
    icon=os.path.join(ROOT, "launcher", "icon.ico") if IS_WIN else None,
    console=False,  # no console window; output goes to %LOCALAPPDATA%\spotDLr\spotDLr.log
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="spotDLr", upx=False)
