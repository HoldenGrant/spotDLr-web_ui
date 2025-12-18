@echo off
echo SpotDL Web App Launcher
echo ========================
echo.

echo Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH
    echo Attempting to install Python automatically...
    echo.
    
    echo Downloading Python installer...
    powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.7/python-3.11.7-amd64.exe' -OutFile 'python-installer.exe' } catch { Write-Host 'Download failed'; exit 1 }"
    
    if not exist python-installer.exe (
        echo Failed to download Python installer
        echo Please manually install Python 3.8+ from https://python.org
        pause
        exit /b 1
    )
    
    echo Installing Python...
    start /wait python-installer.exe /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
    
    echo Cleaning up...
    del python-installer.exe
    
    echo Updating PATH for current session...
    set "PYTHON_PATH=%USERPROFILE%\AppData\Local\Programs\Python\Python311"
    set "PYTHON_SCRIPTS=%USERPROFILE%\AppData\Local\Programs\Python\Python311\Scripts"
    set "PATH=%PATH%;%PYTHON_PATH%;%PYTHON_SCRIPTS%"
    
    echo Testing Python...
    python --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo Python installation completed but may need a restart
        echo Please restart your command prompt and run this script again
        pause
        exit /b 1
    )
    
    echo Python installed successfully!
    echo.
)


echo Checking required Python libraries...
python -m pip freeze > pip-freeze-tmp.txt
findstr /i /c:"fastapi==" pip-freeze-tmp.txt >nul 2>&1
if %errorlevel% neq 0 set NEEDS_INSTALL=1
findstr /i /c:"uvicorn==" pip-freeze-tmp.txt >nul 2>&1
if %errorlevel% neq 0 set NEEDS_INSTALL=1
findstr /i /c:"spotdl==" pip-freeze-tmp.txt >nul 2>&1
if %errorlevel% neq 0 set NEEDS_INSTALL=1
findstr /i /c:"python-multipart==" pip-freeze-tmp.txt >nul 2>&1
if %errorlevel% neq 0 set NEEDS_INSTALL=1
del pip-freeze-tmp.txt
if defined NEEDS_INSTALL (
    echo Installing required Python libraries...
    python -m pip install --upgrade pip
    python -m pip install -r requirements.txt
) else (
    echo All required Python libraries are already installed.
)

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