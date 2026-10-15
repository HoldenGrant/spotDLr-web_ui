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

# Install/check dependencies
python -m pip install -r requirements.txt --quiet

# Load Spotify credentials from .env (get them from https://developer.spotify.com/dashboard)
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*(SPOTIPY_CLIENT_ID|SPOTIPY_CLIENT_SECRET)\s*=\s*(.+?)\s*$') {
            Set-Item -Path "env:$($Matches[1])" -Value $Matches[2]
        }
    }
}

if (-not $env:SPOTIPY_CLIENT_ID -or -not $env:SPOTIPY_CLIENT_SECRET) {
    Write-Host "Spotify credentials are required. Create an app at https://developer.spotify.com/dashboard/"
    $env:SPOTIPY_CLIENT_ID = Read-Host "Enter your Spotify Client ID"
    $env:SPOTIPY_CLIENT_SECRET = Read-Host "Enter your Spotify Client Secret"
    "SPOTIPY_CLIENT_ID=$env:SPOTIPY_CLIENT_ID`nSPOTIPY_CLIENT_SECRET=$env:SPOTIPY_CLIENT_SECRET" | Set-Content ".env"
    Write-Host "Credentials saved to .env for future use"
}

Write-Host "✓ Spotify credentials loaded"
Write-Host ""

Write-Host "Starting SpotDL Web App..."
Write-Host "Server will run at: http://localhost:8000"
Write-Host "Press Ctrl+C to stop"
Write-Host ""

# Start the app
python app.py
