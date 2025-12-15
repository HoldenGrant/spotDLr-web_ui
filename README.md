# SpotDL Web App

A modern web interface for downloading Spotify songs, playlists, albums, and artists.

## Features

- 🎵 Download individual Spotify tracks
- 📋 Download entire playlists
- 💿 Download albums
- 🎤 Download artist discographies
- 🎚️ Multiple audio formats (MP3, WAV, FLAC, Opus)
- 📊 Adjustable bitrate options (128-320 kbps)
- 📥 Download manager with file history
- 🎨 Modern, responsive UI with Spotify theme
- ⚡ Real-time progress tracking

## Prerequisites

- Python 3.8+
- spotdl (already installed)
- pip packages: fastapi, uvicorn


## Quick Start

### Windows

1. Open Command Prompt in the project directory.
2. Run:
   ```bat
   run.bat
   ```
   This will:
   - Check Python installation
   - Install all required libraries from requirements.txt
   - Set Spotify credentials (edit run.bat to use your own)
   - Start the FastAPI server

### Mac/Linux

1. Open Terminal in the project directory.
2. Run:
   ```bash
   bash run.sh
   # or, if needed:
   chmod +x run.sh
   ./run.sh
   ```
   This will:
   - Check Python installation
   - Install all required libraries from requirements.txt
   - Set Spotify credentials (edit run.sh to use your own)
   - Start the FastAPI server

### Manual Setup (All Platforms)

1. Install Python 3.8+ if not already installed.
2. Install required libraries:
   ```bash
   pip install -r requirements.txt
   ```
3. Set your Spotify credentials:
   - Create a file named `.env` in the project folder with these contents:
     ```env
     SPOTIPY_CLIENT_ID=your_client_id
     SPOTIPY_CLIENT_SECRET=your_client_secret
     ```
   - The launcher scripts will read these automatically. If .env is missing or incomplete, you will be prompted for the keys.
4. Start the server:
   ```bash
   python app.py
   # or
   uvicorn app:app --reload --host 127.0.0.1 --port 8000
   ```

5. Open your browser to: `http://localhost:8000`
   - Or open `index.html` and change the API_BASE to match your server

## Usage

1. **Enter a Spotify URL or song name:**
   - Full URL: `https://open.spotify.com/track/...`
   - Playlist: `https://open.spotify.com/playlist/...`
   - Song name: `Blinding Lights - The Weeknd`

2. **Select download options:**
   - Type: Track, Playlist, Album, or Artist
   - Format: MP3, WAV, FLAC, or Opus
   - Bitrate: 128, 192, 256, or 320 kbps

3. **Click "Start Download"**
   - Progress will update in real-time
   - Downloaded files appear in the "Downloaded Files" section

4. **Download your file**
   - Click the download button next to each file
   - Files are saved in the `downloads/` directory

## Project Structure

```
spodl/
├── app.py              # FastAPI backend server
├── index.html          # Frontend UI
├── downloads/          # Downloaded files directory (auto-created)
└── README.md           # This file
```

## Configuration

Edit `app.py` to customize:

- `DOWNLOAD_DIR`: Change where files are saved
- Port and host in `uvicorn.run()`
- Audio quality settings
- Format options

## Environment Variables

Set these for Spotify authentication:

```bash
# Linux/Mac
export SPOTIPY_CLIENT_ID="your_id"
export SPOTIPY_CLIENT_SECRET="your_secret"

# Windows (PowerShell)
$env:SPOTIPY_CLIENT_ID="your_id"
$env:SPOTIPY_CLIENT_SECRET="your_secret"

# Windows (Command Prompt)
set SPOTIPY_CLIENT_ID=your_id
set SPOTIPY_CLIENT_SECRET=your_secret
```

## API Endpoints

- `GET /` - Main HTML interface
- `POST /api/download` - Start a download
- `GET /api/status` - Get download status
- `GET /api/downloads` - List downloaded files
- `GET /api/download/{filename}` - Download a file

## Troubleshooting

**"Connection refused" error:**
- Make sure the FastAPI server is running: `python app.py`
- Check that port 8000 is not already in use

**"Authentication failed" error:**
- Verify Spotify credentials are set correctly
- Generate new Client ID/Secret from Spotify Developer Dashboard

**Download speed is slow:**
- This depends on your internet connection and spotdl settings
- You can adjust bitrate settings in the UI

**Files not saving:**
- Make sure the `downloads/` directory exists and is writable
- Check file permissions in the spotdl directory

## Requirements

```
fastapi==0.104.0
uvicorn==0.24.0
spotdl==4.4.3
python-multipart==0.0.6
```

## License

MIT License - See spotdl for their license

## Notes

- The app requires internet connection to access Spotify
- Respect copyright and only download content you have rights to
- Use responsibly - don't overload Spotify's servers with mass downloads

## Support

For issues with spotdl: https://github.com/spotDL/spotify-downloader
For this web app: Check the console for error messages and logs
