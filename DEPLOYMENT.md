# SpotDL Web App - Deployment Guide

## Quick Start

### Windows (Recommended)
```powershell
cd "c:\Users\holde\Desktop\gitlab\spodl"
powershell -ExecutionPolicy Bypass -File ".\run.ps1"
```

The app will start at: **http://localhost:8000**

### Linux/Mac
```bash
cd /path/to/spodl
export SPOTIPY_CLIENT_ID="your_client_id"
export SPOTIPY_CLIENT_SECRET="your_client_secret"
python app.py
```

## Features

✅ Download Spotify tracks, playlists, albums, and artists
✅ Real-time progress tracking (song count)
✅ Automatic playlist/album folder organization
✅ Download manager with file browser
✅ Modern, responsive web UI
✅ No external dependencies beyond spotdl

## System Requirements

- **Python 3.8+**
- **spotdl 4.4.3+** (includes FastAPI, uvicorn)
- **Windows/Linux/Mac**
- **Internet connection** (for Spotify API)

## Installation

### 1. Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 2. Get Spotify Credentials
1. Visit https://developer.spotify.com/dashboard
2. Log in or create an account (free)
3. Create an app
4. Copy your **Client ID** and **Client Secret**

### 3. Configure Credentials

**Windows (PowerShell):**
Edit `run.ps1` and replace:
```powershell
$env:SPOTIPY_CLIENT_ID = "your_client_id_here"
$env:SPOTIPY_CLIENT_SECRET = "your_client_secret_here"
```

**Linux/Mac:**
```bash
export SPOTIPY_CLIENT_ID="your_client_id"
export SPOTIPY_CLIENT_SECRET="your_client_secret"
python app.py
```

## Usage

1. **Open browser**: http://localhost:8000
2. **Enter Spotify URL or song name**:
   - Track: `https://open.spotify.com/track/...` or `"Song Name - Artist"`
   - Playlist: `https://open.spotify.com/playlist/...`
   - Album: `https://open.spotify.com/album/...`
   - Artist: `https://open.spotify.com/artist/...`
3. **Select download options**:
   - Format: MP3, WAV, FLAC, Opus
   - Bitrate: 128-320 kbps
4. **Click "Start Download"**
5. **Monitor progress** with real-time song count
6. **Access files** from Downloaded Files section

## File Structure

```
spodl/
├── app.py                 # FastAPI backend
├── index.html            # Web UI (embedded CSS/JS)
├── requirements.txt      # Python dependencies
├── run.ps1              # Windows launcher
├── README.md            # User guide
├── SETUP.md             # Setup instructions
├── DEPLOYMENT.md        # This file
├── .gitignore           # Git ignore rules
└── downloads/           # Downloaded files (auto-created)
```

## Downloads Location

Files are saved to: `spodl/downloads/`

- **Single tracks**: Direct in `downloads/`
- **Playlists/Albums**: In a folder with the playlist/album name

Example:
```
downloads/
├── Song Name.mp3
├── My Playlist/
│   ├── Song 1.mp3
│   ├── Song 2.mp3
│   └── Song 3.mp3
└── My Album/
    ├── Track 1.mp3
    ├── Track 2.mp3
    └── Track 3.mp3
```

## Troubleshooting

### "Port 8000 already in use"
```powershell
# Kill existing process
Get-Process python | Stop-Process -Force
# Then restart
```

### "Spotify credentials not set"
Make sure `run.ps1` has your credentials or environment variables are set.

### "No songs downloaded"
- Verify Spotify URL is correct
- Check internet connection
- Ensure Spotify credentials are valid
- Try a single track first

### Slow downloads
- Check internet speed
- Spotify API rate limits (wait a minute)
- Try smaller playlists first

## Performance Notes

- **Single tracks**: ~30-60 seconds
- **Playlists (50 songs)**: ~5-10 minutes
- **Large playlists (200+ songs)**: 20-30 minutes
- Actual time depends on internet speed and Spotify server load

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | Serve web UI |
| POST | `/api/download` | Start download |
| GET | `/api/status` | Get download status |
| GET | `/api/status/init` | Check Spotdl initialization |
| GET | `/api/downloads` | List all downloaded files |
| GET | `/api/download/{filename}` | Download a file |

## Security Notes

⚠️ **Important**: This app is designed for local use only!

- Do not expose to the internet without authentication
- Spotify credentials are stored in plaintext in `run.ps1`
- All files are accessible without password
- CORS is set to allow all origins

For production deployment, consider:
- Using environment variables instead of hardcoded credentials
- Adding authentication/authorization
- Restricting CORS origins
- Using HTTPS
- Running behind a reverse proxy (nginx, etc.)

## Support

For issues with spotdl itself: https://github.com/spotDL/spotdl

## License

This wrapper is provided as-is for personal use.
