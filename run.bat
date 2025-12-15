@echo off
echo SpotDL Web App Launcher
echo ========================
echo.

echo Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH
    echo Please install Python 3.8 or higher
    pause
    exit /b 1
)


echo Installing required Python libraries...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo Setting Spotify credentials...
if exist .env (
    for /f "usebackq tokens=1,2 delims==" %%A in (".env") do (
        if "%%A"=="SPOTIPY_CLIENT_ID" set SPOTIPY_CLIENT_ID=%%B
        if "%%A"=="SPOTIPY_CLIENT_SECRET" set SPOTIPY_CLIENT_SECRET=%%B
    )
)
if not defined SPOTIPY_CLIENT_ID (
    set /p SPOTIPY_CLIENT_ID="Enter your Spotify Client ID: "
)
if not defined SPOTIPY_CLIENT_SECRET (
    set /p SPOTIPY_CLIENT_SECRET="Enter your Spotify Client Secret: "
)

echo Starting SpotDL Web App...
echo Server will run at: http://localhost:8000
echo Press Ctrl+C to stop
echo.

python app.py