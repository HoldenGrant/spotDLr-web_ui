"""Native Mac window + this onedir Python backend, assembled by build_mac.sh."""
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_submodules

root = Path(SPECPATH).parent
tools = Path(os.environ["SPOTDLR_MAC_TOOLS"])
datas = [(str(root / "index.html"), "."), (str(root / "static"), "static")]
if os.environ.get("SPOTDLR_LEGACY_MANIFEST"):
    datas.append((os.environ["SPOTDLR_LEGACY_MANIFEST"], "."))
binaries = [(str(tools / tool), "bin") for tool in ("ffmpeg", "ffprobe", "node")]
hiddenimports = collect_submodules("uvicorn")
for package in ("ytmusicapi", "yt_dlp_ejs", "yt_dlp"):
    package_datas, package_binaries, package_hidden = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hidden

a = Analysis(
    [str(root / "installer" / "mac_backend.py")], pathex=[str(root)],
    datas=datas, binaries=binaries, hiddenimports=hiddenimports,
    excludes=["spotdl", "tkinter", "matplotlib", "numpy", "PIL"],
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="spotDLr-server",
          console=True, upx=False, target_arch="arm64")
coll = COLLECT(exe, a.binaries, a.datas, name="spotDLr-server", upx=False)
backend = BUNDLE(coll, name="spotDLr-server.app", bundle_identifier="com.holdengrant.spotdlr.backend",
                 info_plist={"LSMinimumSystemVersion": "15.0"})
