#!/bin/bash
# Build a local Cocoa + WebKit app. No App Store account or browser is needed to run it.
# Usage: ./make_launcher.sh [destination folder]
# Rebuild after moving the project: this app uses its existing Python environment and music.

set -euo pipefail
cd "$(dirname "$0")"
REPO="$(pwd)"
DEST="${1:-/Applications}"
if [ ! -w "$DEST" ] && [ -d "$DEST" ]; then DEST="$HOME/Applications"; fi
mkdir -p "$DEST"
APP="$DEST/spotDLr.app"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Building native Mac window..."
xcrun swiftc -swift-version 5 -O -target "$(uname -m)-apple-macos12.3" \
    -framework Cocoa -framework WebKit -module-cache-path "$WORK/swift-cache" \
    "$REPO/launcher/macOS.swift" -o "$WORK/spotDLr"

# Reuse the unchanged icon when updating an installed app.
if [ -f "$APP/Contents/Resources/spotDLr.icns" ]; then
    cp "$APP/Contents/Resources/spotDLr.icns" "$WORK/spotDLr.icns"
elif [ -f "/Applications/spotDLr.app/Contents/Resources/spotDLr.icns" ]; then
    cp "/Applications/spotDLr.app/Contents/Resources/spotDLr.icns" "$WORK/spotDLr.icns"
else
    echo "Rendering icon..."
    CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    if [ -x "$CHROME" ]; then
        "$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
            --user-data-dir="$WORK/chrome" --window-size=1024,1024 \
            --screenshot="$WORK/icon.png" "file://$REPO/launcher/icon.svg" >/dev/null 2>&1
    else
        qlmanage -t -s 1024 -o "$WORK" "$REPO/launcher/icon.svg" >/dev/null 2>&1
        mv "$WORK/icon.svg.png" "$WORK/icon.png"
    fi
    ICONSET="$WORK/spotDLr.iconset"
    mkdir -p "$ICONSET"
    for size in 16 32 128 256 512; do
        sips -z $size $size "$WORK/icon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
        sips -z $((size * 2)) $((size * 2)) "$WORK/icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
    done
    iconutil -c icns "$ICONSET" -o "$WORK/spotDLr.icns"
fi

BUNDLE="$WORK/spotDLr.app"
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources"
cp "$WORK/spotDLr" "$BUNDLE/Contents/MacOS/spotDLr"
cp "$WORK/spotDLr.icns" "$BUNDLE/Contents/Resources/spotDLr.icns"
cat > "$BUNDLE/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>CFBundleName</key><string>spotDLr</string>
    <key>CFBundleDisplayName</key><string>spotDLr</string>
    <key>CFBundleIdentifier</key><string>com.holdengrant.spotdlr.launcher</string>
    <key>CFBundleExecutable</key><string>spotDLr</string>
    <key>CFBundleIconFile</key><string>spotDLr</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>2.2.0</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>LSMinimumSystemVersion</key><string>12.3</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>NSAppTransportSecurity</key><dict>
        <key>NSAllowsLocalNetworking</key><true/>
    </dict>
</dict></plist>
PLIST
plutil -insert SpotDLrProjectPath -string "$REPO" "$BUNDLE/Contents/Info.plist"
# Finder's PATH does not include Python, FFmpeg or Node installed in Homebrew.
plutil -insert SpotDLrExecutablePath -string "$PATH:/opt/homebrew/bin:/usr/local/bin" "$BUNDLE/Contents/Info.plist"
codesign --force --sign - "$BUNDLE"
codesign --verify --strict "$BUNDLE"

# Build and validate completely before updating the installed copy.
ditto "$BUNDLE" "$APP"
touch "$APP"
echo "Done: $APP"
echo "Open it from Applications or the Dock. Keep the project at $REPO."
