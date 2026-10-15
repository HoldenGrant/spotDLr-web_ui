#!/bin/bash
# SpotDL Web App Launcher for Mac/Linux

# Always run from this script's folder (Finder and new Terminal windows start in ~)
cd "$(dirname "$0")" || exit 1

PORT=8000

echo "SpotDL Web App Launcher (Mac/Linux)"
echo "====================================="
echo ""

# Find a Python that spotDL 4.4.3 supports (3.10 - 3.13; it refuses 3.14+)
echo "Checking Python installation..."
PYTHON=""
for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$candidate" &> /dev/null; then
        if "$candidate" -c 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 13) else 1)' 2> /dev/null; then
            PYTHON="$candidate"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    echo "No compatible Python found. spotDL needs Python 3.10 to 3.13."
    echo ""
    echo "Please install one:"
    echo "  macOS: brew install python@3.13"
    echo "  Ubuntu/Debian: sudo apt install python3 python3-venv python3-pip"
    echo "  Fedora: sudo dnf install python3 python3-pip"
    exit 1
fi

"$PYTHON" --version
echo "Python is installed"
echo ""

# Check for requirements.txt
if [ ! -f "requirements.txt" ]; then
    echo "Error: requirements.txt file not found"
    exit 1
fi

# Use a local virtual environment so the pinned versions don't touch your system Python
if [ ! -x ".venv/bin/python" ]; then
    echo "Creating virtual environment (.venv)..."
    "$PYTHON" -m venv .venv
    if [ $? -ne 0 ]; then
        echo "Could not create a virtual environment"
        echo "  Ubuntu/Debian: sudo apt install python3-venv"
        exit 1
    fi
fi
VENV_PYTHON=".venv/bin/python"

# Only reinstall when requirements.txt changes
if [ ! -f ".venv/.installed" ] || [ "requirements.txt" -nt ".venv/.installed" ]; then
    echo "Installing dependencies (first run takes a minute)..."
    "$VENV_PYTHON" -m pip install --upgrade pip --quiet
    "$VENV_PYTHON" -m pip install -r requirements.txt --quiet
    if [ $? -ne 0 ]; then
        echo "Dependency installation failed"
        echo "You may need to install dependencies manually:"
        echo "  $VENV_PYTHON -m pip install -r requirements.txt"
        exit 1
    fi
    touch .venv/.installed
    echo "Dependencies installed successfully"
else
    echo "Dependencies already installed"
fi
echo ""

# FFmpeg: use the system one, or the copy spotDL downloads to ~/.spotdl
echo "Checking FFmpeg installation for SpotDL..."
if command -v ffmpeg &> /dev/null || [ -x "$HOME/.spotdl/ffmpeg" ]; then
    echo "FFmpeg is already installed"
else
    echo "FFmpeg not found. Installing via SpotDL..."
    "$VENV_PYTHON" -m spotdl --download-ffmpeg
    if [ $? -eq 0 ]; then
        echo "FFmpeg installed successfully"
    else
        echo "Warning: FFmpeg installation may have failed"
        echo "You may need to install it manually:"
        echo "  macOS: brew install ffmpeg"
        echo "  Ubuntu/Debian: sudo apt install ffmpeg"
    fi
fi
echo ""

# Load Spotify credentials from .env (optional: search and downloads work through YouTube Music without them)
if [ -f ".env" ]; then
    echo "Reading settings from .env..."
    set -a
    . ./.env
    set +a
elif [ -t 0 ]; then
    # Only ask when someone is at the Terminal; spotDLr.app starts this with no keyboard attached
    echo "No .env file found. Spotify is optional: press Enter to skip, or paste your app keys"
    echo "(you can also add them later in Settings → Spotify connection)."
    read -p "Spotify Client ID: " SPOTIPY_CLIENT_ID
    if [ -n "$SPOTIPY_CLIENT_ID" ]; then
        read -p "Spotify Client Secret: " SPOTIPY_CLIENT_SECRET
        export SPOTIPY_CLIENT_ID SPOTIPY_CLIENT_SECRET
        printf 'SPOTIPY_CLIENT_ID=%s\nSPOTIPY_CLIENT_SECRET=%s\n' "$SPOTIPY_CLIENT_ID" "$SPOTIPY_CLIENT_SECRET" > .env
        chmod 600 .env
        echo "Saved to .env"
    fi
fi
echo ""

# Port check
if command -v lsof &> /dev/null && lsof -nP -iTCP:$PORT -sTCP:LISTEN &> /dev/null; then
    echo "Error: port $PORT is already in use. Is the app already running?"
    echo "  See what's using it: lsof -nP -iTCP:$PORT -sTCP:LISTEN"
    exit 1
fi

echo "Starting SpotDL Web App..."
echo "Server will run at: http://localhost:$PORT"
echo "Press Ctrl+C to stop"
echo ""

# Open the browser once the server answers (macOS: open, Linux: xdg-open).
# spotDLr.app sets SPOTDLR_NO_BROWSER because it opens its own app window instead.
[ -z "$SPOTDLR_NO_BROWSER" ] && (
    for _ in $(seq 1 30); do
        if curl -s -o /dev/null "http://localhost:$PORT/api/status/init"; then
            if command -v open &> /dev/null; then open "http://localhost:$PORT"
            elif command -v xdg-open &> /dev/null; then xdg-open "http://localhost:$PORT" &> /dev/null
            fi
            break
        fi
        sleep 1
    done
) &

exec "$VENV_PYTHON" app.py
