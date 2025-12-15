#!/usr/bin/env powershell
# SpotDL Web App Startup Script

Write-Host "SpotDL Web App Launcher"
Write-Host "========================"
Write-Host ""

# Check if Python is installed
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Python is not installed or not in PATH"
    exit 1
}

# Check if spotdl is installed
$spotdlInstalled = python -m pip show spotdl 2>$null
if (-not $spotdlInstalled) {
    Write-Host "spotdl is not installed. Installing..."
    python -m pip install spotdl
}

# Set your Spotify credentials here (get them from https://developer.spotify.com/dashboard)
$env:SPOTIPY_CLIENT_ID = "5f573c9620494bae87890c0f08a60293"
$env:SPOTIPY_CLIENT_SECRET = "212476d9b0f3472eaa762d90b19b0ba8"

Write-Host "✓ Spotify credentials loaded"
Write-Host ""

Write-Host "Starting SpotDL Web App..."
Write-Host "Server will run at: http://localhost:8000"
Write-Host "Press Ctrl+C to stop"
Write-Host ""

# Start the app
python app.py