#!/bin/bash
# Build a personal, self-contained Apple Silicon app and drag-to-Applications DMG.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"
PYTHON="${SPOTDLR_BUILD_PYTHON:-$REPO/.venv/bin/python}"
OUT="$REPO/dist-mac"
WORK="$REPO/build/mac"
export MACOSX_DEPLOYMENT_TARGET="15.0"  # the bundled Homebrew FFmpeg requires macOS 15
if [ "$(uname -m)" != arm64 ]; then echo "This build targets Apple Silicon Macs." >&2; exit 1; fi
"$PYTHON" -m PyInstaller --version
# The DMG freezes yt-dlp as it is today, and an old one gets HTTP 403 from YouTube, so start from the newest
"$PYTHON" installer/update_ytdlp.py
VERSION="$("$PYTHON" -c 'from version import VERSION; print(VERSION)')"
mkdir -p "$WORK/tools" "$OUT"
for tool in ffmpeg ffprobe node; do
    SOURCE="$(command -v "$tool")"
    rm -f "$WORK/tools/$tool"
    cp -L "$SOURCE" "$WORK/tools/$tool"
done
export SPOTDLR_MAC_TOOLS="$WORK/tools"
"$PYTHON" -m PyInstaller installer/mac.spec --noconfirm --distpath "$WORK/frozen" --workpath "$WORK/pyinstaller"

APP="$OUT/spotDLr.app"
STAGED="$WORK/stage/spotDLr.app"
rm -rf "$WORK/stage"
mkdir -p "$STAGED/Contents/MacOS" "$STAGED/Contents/Resources" "$STAGED/Contents/Helpers"
xcrun swiftc -swift-version 5 -O -target arm64-apple-macos15.0 \
    -framework Cocoa -framework WebKit -module-cache-path "$WORK/swift-cache" \
    launcher/macOS.swift -o "$STAGED/Contents/MacOS/spotDLr"
ditto "$WORK/frozen/spotDLr-server.app" "$STAGED/Contents/Helpers/spotDLr-server.app"
if [ -f /Applications/spotDLr.app/Contents/Resources/spotDLr.icns ]; then
    cp /Applications/spotDLr.app/Contents/Resources/spotDLr.icns "$STAGED/Contents/Resources/spotDLr.icns"
else
    # The existing launcher can render the project icon without changing Applications.
    ./make_launcher.sh "$WORK/icon"
    cp "$WORK/icon/spotDLr.app/Contents/Resources/spotDLr.icns" "$STAGED/Contents/Resources/spotDLr.icns"
fi
cat > "$STAGED/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>spotDLr</string>
<key>CFBundleDisplayName</key><string>spotDLr</string>
<key>CFBundleIdentifier</key><string>com.holdengrant.spotdlr</string>
<key>CFBundleExecutable</key><string>spotDLr</string>
<key>CFBundleIconFile</key><string>spotDLr</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$VERSION</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>15.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>SpotDLrBundledBackend</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
<key>NSAppleEventsUsageDescription</key><string>Add the music you select to your Apple Music library.</string>
<key>NSLocalNetworkUsageDescription</key><string>Share your music with your phone when you enable Phone access.</string>
</dict></plist>
PLIST
plutil -lint "$STAGED/Contents/Info.plist"
# PyInstaller signs the nested binaries after relocating their dependencies.
codesign --verify --deep --strict "$STAGED/Contents/Helpers/spotDLr-server.app"
codesign --force --sign - "$STAGED"
codesign --verify --deep --strict "$STAGED"
rm -rf "$APP"
ditto "$STAGED" "$APP"
"$PYTHON" installer/test_mac_build.py "$APP"
ln -s /Applications "$WORK/stage/Applications"
DMG="$OUT/spotDLr-$VERSION-mac-arm64.dmg"
hdiutil create -volname "spotDLr" -srcfolder "$WORK/stage" -ov -format UDZO "$DMG"
(cd "$OUT" && shasum -a 256 "$(basename "$DMG")" > "$(basename "$DMG").sha256")
echo "Created $DMG"
