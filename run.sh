#!/bin/bash
# SpotDL Web App Launcher for Mac/Linux

echo "SpotDL Web App Launcher (Mac/Linux)"
echo "========================="

# Check Python installation
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Install required libraries
echo "Installing required Python libraries..."
pip3 install --upgrade pip
pip3 install -r requirements.txt

# Set Spotify credentials (edit these as needed)
export SPOTIPY_CLIENT_ID=5f573c9620494bae87890c0f08a60293
export SPOTIPY_CLIENT_SECRET=212476d9b0f3472eaa762d90b19b0ba8

echo "Starting SpotDL Web App..."
echo "Server will run at: http://localhost:8000"
echo "Press Ctrl+C to stop"
echo

python3 app.py
