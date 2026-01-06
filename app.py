#!/usr/bin/env python
"""
SpotDL Web App - FastAPI Backend
A web interface for downloading Spotify songs
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import asyncio
import mimetypes
from pathlib import Path
from datetime import datetime
import logging
from typing import Optional
from spotdl import Spotdl, parse_query
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="SpotDL Web App", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
DOWNLOAD_DIR = Path("downloads")
DOWNLOAD_DIR.mkdir(exist_ok=True)

# Initialize Spotdl
spotdl = None
client_id = os.getenv("SPOTIPY_CLIENT_ID")
client_secret = os.getenv("SPOTIPY_CLIENT_SECRET")

logger.info(f"Loading .env file...")
logger.info(f"CLIENT_ID found: {'Yes' if client_id else 'No'}")
logger.info(f"CLIENT_SECRET found: {'Yes' if client_secret else 'No'}")

if client_id and client_secret:
    try:
        spotdl = Spotdl(
            client_id=client_id,
            client_secret=client_secret,
        )
        # Set output directory
        spotdl.output = str(DOWNLOAD_DIR / "{artist} - {title}")
        logger.info("Spotdl initialized successfully with Spotify credentials")
    except Exception as e:
        logger.warning(f"Could not initialize Spotdl: {e}. Some features may not work.")
        spotdl = None
else:
    logger.warning("Spotify credentials not set. Please set SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET environment variables.")
    spotdl = None

# Store download status
download_status = {
    "current": None,
    "progress": 0,
    "total": 0,
    "downloads": []
}

class DownloadRequest(BaseModel):
    """Model for download request"""
    query: str
    type: str = "track"  # track, playlist, album, artist
    format: str = "mp3"
    bitrate: str = "192"
    includeLyrics: bool = False

class DownloadResponse(BaseModel):
    """Model for download response"""
    status: str
    message: str
    download_id: Optional[str] = None

@app.on_event("startup")
async def startup():
    """Initialize the app"""
    logger.info("SpotDL Web App started")
    # Create downloads directory
    DOWNLOAD_DIR.mkdir(exist_ok=True)

@app.get("/api/status/init")
async def check_initialization():
    """Check if Spotdl is initialized"""
    return {
        "initialized": spotdl is not None,
        "message": "Spotdl is ready" if spotdl else "Spotdl not initialized - Spotify credentials required",
        "setup_url": "https://developer.spotify.com/dashboard/",
        "instructions": "Set SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET environment variables"
    }

@app.get("/")
async def root():
    """Serve the main HTML file"""
    return FileResponse("index.html")

@app.get("/api/status")
async def get_status():
    """Get current download status"""
    return download_status

@app.post("/api/download")
async def download(request: DownloadRequest, background_tasks: BackgroundTasks):
    """
    Start a download
    """
    try:
        if not spotdl:
            raise HTTPException(
                status_code=400,
                detail="Spotdl not initialized. Please set SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET environment variables. Visit https://developer.spotify.com/dashboard/"
            )
        
        if not request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        download_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Add background task
        background_tasks.add_task(
            process_download,
            query=request.query,
            download_type=request.type,
            download_id=download_id,
            format=request.format,
            bitrate=request.bitrate,
            include_lyrics=request.includeLyrics
        )
        
        download_status["current"] = {
            "id": download_id,
            "query": request.query,
            "type": request.type,
            "status": "processing",
            "progress": 0
        }
        
        return {
            "status": "started",
            "message": f"Download started for {request.query}",
            "download_id": download_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting download: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/downloads")
async def list_downloads():
    """List all completed downloads - both files and folders"""
    downloads = []
    
    if DOWNLOAD_DIR.exists():
        music_extensions = {'.mp3', '.wav', '.flac', '.opus', '.m4a'}
        
        for item in DOWNLOAD_DIR.glob("*"):
            if item.is_file() and item.suffix.lower() in music_extensions:
                # Direct music file
                downloads.append({
                    "filename": item.name,
                    "size": item.stat().st_size,
                    "date": datetime.fromtimestamp(item.stat().st_mtime).isoformat(),
                    "type": "file"
                })
            elif item.is_dir():
                # Folder (playlist/album) - list songs inside
                music_files = [f for f in item.rglob('*') if f.is_file() and f.suffix.lower() in music_extensions]
                
                for music_file in music_files:
                    downloads.append({
                        "filename": music_file.name,
                        "folder": item.name,
                        "size": music_file.stat().st_size,
                        "date": datetime.fromtimestamp(music_file.stat().st_mtime).isoformat(),
                        "type": "folder_item"
                    })
    
    return {"downloads": downloads}

@app.get("/api/download/{filename}")
async def get_download(filename: str):
    """Download or stream a file"""
    
    # Define explicit MIME types for audio files
    audio_extensions = {
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.flac': 'audio/flac',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.opus': 'audio/opus',
        '.aac': 'audio/aac'
    }
    
    def get_media_type(file_path):
        ext = file_path.suffix.lower()
        if ext in audio_extensions:
            return audio_extensions[ext]
        return mimetypes.guess_type(str(file_path))[0] or 'application/octet-stream'
    
    # First try direct file
    file_path = DOWNLOAD_DIR / filename
    if file_path.exists() and file_path.is_file():
        media_type = get_media_type(file_path)
        return FileResponse(
            file_path, 
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Disposition": f'inline; filename="{filename}"'
            }
        )
    
    # If not found, search in subdirectories
    for item in DOWNLOAD_DIR.glob("*"):
        if item.is_dir():
            subfolder_file = item / filename
            if subfolder_file.exists() and subfolder_file.is_file():
                media_type = get_media_type(subfolder_file)
                return FileResponse(
                    subfolder_file, 
                    media_type=media_type,
                    headers={
                        "Accept-Ranges": "bytes",
                        "Content-Disposition": f'inline; filename="{filename}"'
                    }
                )
    
    raise HTTPException(status_code=404, detail="File not found")

async def process_download(query: str, download_type: str, download_id: str, format: str, bitrate: str, include_lyrics: bool = False):
    """Process download in background"""
    try:
        if not spotdl:
            raise Exception("Spotdl not initialized. Check your Spotify credentials.")

        logger.info(f"Processing download: {query} ({download_type})")

        # Update status
        download_status["current"]["status"] = "processing"
        download_status["current"]["progress"] = 0
        download_status["current"]["songs_completed"] = 0

        # Map 'aac' to 'm4a' for spotdl CLI
        cli_format = format.lower()
        if cli_format == "aac":
            cli_format = "m4a"

        # Use subprocess to call spotdl CLI which handles everything properly
        import subprocess
        try:
            # Get total songs count from Spotify API
            total_songs = 1  # default for single track
            folder_name = None
            if download_type == "playlist" or download_type == "album":
                try:
                    import spotipy
                    sp = spotipy.Spotify(
                        client_credentials_manager=spotipy.SpotifyClientCredentials(
                            client_id=os.getenv("SPOTIPY_CLIENT_ID"),
                            client_secret=os.getenv("SPOTIPY_CLIENT_SECRET")
                        )
                    )
                    if download_type == "playlist":
                        playlist_id = query.split("/playlist/")[-1].split("?")[0]
                        try:
                            playlist = sp.playlist(playlist_id)
                            folder_name = playlist.get('name', None)
                            total_songs = playlist.get('tracks', {}).get('total', 1)
                            logger.info(f"Fetched playlist: {folder_name} with {total_songs} songs")
                        except Exception as e:
                            logger.warning(f"Could not fetch playlist info: {e}")
                    elif download_type == "album":
                        album_id = query.split("/album/")[-1].split("?")[0]
                        try:
                            album = sp.album(album_id)
                            folder_name = album.get('name', None)
                            total_songs = album.get('total_tracks', 1)
                            logger.info(f"Fetched album: {folder_name} with {total_songs} songs")
                        except Exception as e:
                            logger.warning(f"Could not fetch album info: {e}")
                except ImportError:
                    logger.warning("spotipy not installed, using default folder name")
                except Exception as e:
                    logger.warning(f"Error fetching info from Spotify: {e}")
                
                # Sanitize folder name
                if folder_name:
                    folder_name = "".join(c if c.isalnum() or c in (' ', '-', '_') else '' for c in folder_name).strip()[:100]
                
                # If folder_name is empty or None, create a default one
                if not folder_name:
                    folder_name = f"{download_type}_{download_id[:8]}"
                
                output_subdir = DOWNLOAD_DIR / folder_name
                output_subdir.mkdir(parents=True, exist_ok=True)
                output_dir = str(output_subdir)
                logger.info(f"Created folder: {folder_name}")
            else:
                output_dir = str(DOWNLOAD_DIR)
            download_status["current"]["total"] = total_songs
            # Build spotdl command
            cmd = [
                "spotdl",
                "download",
                query,
                "--output",
                output_dir,
                "--format",
                cli_format,
                "--force-update-metadata",
                "--ytm-data",
                "--add-unavailable",
                "--threads",
                "4"
            ]
            
            if include_lyrics:
                cmd.append("--generate-lrc")
            logger.info(f"Running command: {' '.join(cmd)}")
            logger.info(f"Output directory: {output_dir}")
            logger.info(f"Expected songs: {total_songs}")
            timeout_seconds = 1800 if download_type == "playlist" else 600
            music_extensions = {'.mp3', '.wav', '.flac', '.opus', '.m4a', '.aac'}
            output_path = Path(output_dir) if output_dir else None
            # Start the download process and stream output
            import time
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            downloaded_count = 0
            last_count = 0
            start_time = time.time()
            while True:
                line = process.stdout.readline()
                if not line and process.poll() is not None:
                    break
                # Heuristic: spotdl outputs 'Downloaded' or '100%|' per song
                if line:
                    if 'Downloaded' in line or '100%|' in line:
                        downloaded_count += 1
                # Always count files in output folder for more accuracy
                if output_path and output_path.exists():
                    files = [f for f in output_path.rglob('*') if f.is_file() and f.suffix.lower() in music_extensions]
                    downloaded_count = max(downloaded_count, len(files))
                # Update status every new song or every second
                if downloaded_count != last_count or (time.time() - start_time) % 1 < 0.2:
                    download_status["current"]["songs_completed"] = downloaded_count
                    download_status["current"]["progress"] = downloaded_count
                    last_count = downloaded_count
                    await asyncio.sleep(0.1)
            process.wait()
            await asyncio.sleep(0.5)
            if process.returncode == 0:
                # Final count
                if output_path and output_path.exists():
                    files = [f for f in output_path.rglob('*') if f.is_file() and f.suffix.lower() in music_extensions]
                    downloaded_count = len(files)
                if downloaded_count == 0:
                    downloaded_count = 1
                download_status["current"]["status"] = "completed"
                download_status["current"]["progress"] = total_songs
                download_status["current"]["songs_completed"] = downloaded_count
                download_status["current"]["total"] = total_songs
                download_status["downloads"].append({
                    "id": download_id,
                    "query": query,
                    "type": download_type,
                    "songs_downloaded": downloaded_count,
                    "status": "completed",
                    "timestamp": datetime.now().isoformat(),
                    "output_dir": output_dir
                })
                logger.info(f"Download completed: {query} ({downloaded_count} / {total_songs} songs)")
            else:
                error_msg = "Process failed"
                logger.error(f"Spotdl returned error: {error_msg}")
                raise Exception(f"Spotdl error: {error_msg}")
        except subprocess.TimeoutExpired:
            timeout_msg = "Download timed out (playlist downloads can take 20+ minutes, please wait...)"
            logger.warning(timeout_msg)
            download_status["current"]["status"] = "timeout"
            download_status["current"]["progress"] = 50
            raise Exception(timeout_msg)
        except Exception as download_error:
            logger.error(f"Spotdl download error: {download_error}")
            raise
            logger.error(f"Spotdl download error: {download_error}")
            raise
    
    except Exception as e:
        logger.error(f"Error processing download: {e}")
        download_status["current"]["status"] = "failed"
        download_status["current"]["error"] = str(e)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
