# SpotDL Web App - Setup Guide

## Quick Start (2 minutes)

### Step 1: Get Spotify API Credentials
1. Visit https://developer.spotify.com/dashboard/
2. Log in or create an account (free)
3. Click "Create an App"
4. Accept the terms and create the app
5. You'll see **Client ID** and **Client Secret**
6. Copy these values

### Step 2: Run the App

**Option A: PowerShell (Windows)**
```powershell
cd c:\Users\holde\Desktop\gitlab\spodl
.\run.ps1
```
- The script will prompt you for credentials if needed
- Open browser to: http://localhost:8000

**Option B: Command Line**
```bash
# Set environment variables first
set SPOTIPY_CLIENT_ID=your_client_id_here
set SPOTIPY_CLIENT_SECRET=your_client_secret_here

# Then run the app
cd c:\Users\holde\Desktop\gitlab\spodl
python app.py
```

**Option C: Python directly**
```bash
cd c:\Users\holde\Desktop\gitlab\spodl
python app.py
```

### Step 3: Use the Web App
1. Open http://localhost:8000 in your browser
2. Enter a Spotify URL or song name
3. Select download options (format, bitrate)
4. Click "Start Download"
5. Downloaded files appear below

## Features

✅ Download Spotify tracks
✅ Download playlists
✅ Download albums
✅ Download artist collections
✅ Choose audio format (MP3, WAV, FLAC, Opus)
✅ Adjust bitrate (128-320 kbps)
✅ Real-time progress tracking
✅ Download manager with file list

## Important Notes

⚠️ **Spotify Credentials Required**
   - All downloads require valid Spotify API credentials
   - Free tier is fine for personal use
   - Create app at: https://developer.spotify.com/dashboard

📝 **Supported URLs**
- Track: `https://open.spotify.com/track/...`
- Playlist: `https://open.spotify.com/playlist/...`
- Album: `https://open.spotify.com/album/...`
- Artist: `https://open.spotify.com/artist/...`

💾 **Downloads Location**
- Files saved to: `c:\Users\holde\Desktop\gitlab\spodl\downloads\`

## Troubleshooting

### "Connection refused"
- Make sure the server is running: `python app.py`
- Check port 8000 is not in use

### "No client_id" error
- Set environment variables correctly:
  ```bash
  set SPOTIPY_CLIENT_ID=your_id
  set SPOTIPY_CLIENT_SECRET=your_secret
  ```

### Slow downloads
- Check your internet connection
- Verify Spotify server status
- Try downloading smaller playlists first

### Files not saving
- Check `downloads/` folder exists
- Verify write permissions to the folder
- Check disk space availability

## File Structure

```
spodl/
├── app.py              # Backend server (Python/FastAPI)
├── index.html          # Frontend UI (HTML/CSS/JS)
├── run.ps1             # Startup script (PowerShell)
├── requirements.txt    # Python dependencies
├── README.md           # Full documentation
├── SETUP.md            # This file
└── downloads/          # Downloaded files (auto-created)
```

## API Endpoints

The backend provides these REST endpoints:

- `GET /` - Web interface
- `POST /api/download` - Start download
- `GET /api/status` - Get download status
- `GET /api/downloads` - List files
- `GET /api/download/{file}` - Download file

## Advanced Configuration

Edit `app.py` to customize:

```python
# Change download directory
DOWNLOAD_DIR = Path("my_downloads")

# Change server port (default 8000)
uvicorn.run(app, host="127.0.0.1", port=8080)

# Change filename format
spotdl.output = "{artist} - {title}"
```

## Security Notes

⚠️ **For Local Use Only**
- Don't expose this app to the internet
- Don't share Spotify credentials
- Create fresh API credentials if you suspect compromise

## Copyright & Legal

- Respect copyright laws in your country
- Only download content you have rights to
- spotDL is not affiliated with Spotify
- Use responsibly

## Support

For issues with:
- **spotDL tool**: https://github.com/spotDL/spotify-downloader
- **This web app**: Check console logs and error messages
- **Spotify API**: https://developer.spotify.com/documentation

## Next Steps

1. ✅ Set up Spotify credentials
2. ✅ Run the app with `python app.py`
3. ✅ Open http://localhost:8000
4. ✅ Download your favorite music!

Enjoy your music! 🎵
