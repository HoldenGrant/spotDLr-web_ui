@echo off
setlocal enabledelayedexpansion
echo SpotDL Web App Launcher
echo ========================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorlevel% == 0 (
    echo Running with administrator privileges - Good!
) else (
    echo Note: Not running as administrator. Some features may require elevation.
)
echo.

echo Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH
    echo Attempting to install Python automatically...
    echo.
    
    echo Setting PowerShell execution policy...
    powershell -Command "Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force" >nul 2>&1
    
    echo Downloading Python installer...
    powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Write-Host 'Downloading Python 3.11.7...'; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.7/python-3.11.7-amd64.exe' -OutFile 'python-installer.exe' -UseBasicParsing; Write-Host 'Download completed successfully' } catch { Write-Host 'Download failed:' $_.Exception.Message; exit 1 }"
    
    if not exist python-installer.exe (
        echo Failed to download Python installer
        echo.
        echo Manual installation required:
        echo 1. Go to https://python.org
        echo 2. Download Python 3.8 or higher
        echo 3. During installation, check "Add Python to PATH"
        echo 4. Run this script again
        pause
        exit /b 1
    )
    
    echo Installing Python ^(this may take a few minutes^)...
    echo Please wait, do not close this window...
    start /wait python-installer.exe /quiet InstallAllUsers=0 PrependPath=1 Include_test=0 Include_launcher=1 AssociateFiles=0
    
    echo Cleaning up installer...
    if exist python-installer.exe del python-installer.exe
    
    echo Python installation completed!
    echo.
    echo IMPORTANT: Windows needs to be restarted to complete Python setup
    echo After restart, run this script again to continue
    echo.
    set /p RESTART="Do you want to restart now? (Y/N): "
    if /i "!RESTART!"=="Y" (
        echo Restarting computer in 10 seconds...
        echo Press Ctrl+C to cancel
        shutdown /r /t 10
        exit
    ) else (
        echo Please restart your computer manually and run this script again
        pause
        exit /b 0
    )
) else (
    for /f "tokens=*" %%i in ('python --version 2^>^&1') do set PYTHON_VER=%%i
    echo !PYTHON_VER!
    echo Python is already installed
    echo.
)


echo Checking required Python libraries...
if not exist requirements.txt (
    echo Error: requirements.txt file not found
    echo Please make sure you are running this script from the correct directory
    pause
    exit /b 1
)

echo Upgrading pip...
python -m pip install --upgrade pip --quiet

echo Installing/checking dependencies...
python -m pip install -r requirements.txt --quiet

if %errorlevel% neq 0 (
    echo Failed to install some dependencies
    echo Trying with user installation...
    python -m pip install -r requirements.txt --user --quiet
    if %errorlevel% neq 0 (
        echo Dependency installation failed
        echo You may need to install dependencies manually:
        echo python -m pip install -r requirements.txt
        pause
    )
)

echo Dependencies installed successfully
echo.

echo Setting Spotify credentials...
if exist .env (
    echo Reading credentials from .env file...
    for /f "usebackq delims=" %%i in (".env") do (
        set "line=%%i"
        for /f "tokens=1,2 delims==" %%A in ("!line!") do (
            if "%%A"=="SPOTIPY_CLIENT_ID" set "SPOTIPY_CLIENT_ID=%%B"
            if "%%A"=="SPOTIPY_CLIENT_SECRET" set "SPOTIPY_CLIENT_SECRET=%%B"
        )
    )
) else (
    echo No .env file found, will prompt for credentials...
)

if not defined SPOTIPY_CLIENT_ID (
    echo.
    echo Spotify credentials are required to use this app.
    echo Please visit: https://developer.spotify.com/dashboard/
    echo 1. Create a new app
    echo 2. Copy your Client ID and Client Secret
    echo.
    set /p SPOTIPY_CLIENT_ID="Enter your Spotify Client ID: "
)
if not defined SPOTIPY_CLIENT_SECRET (
    set /p SPOTIPY_CLIENT_SECRET="Enter your Spotify Client Secret: "
)

REM Validate credentials are not empty
if "!SPOTIPY_CLIENT_ID!"=="" (
    echo Error: Client ID cannot be empty
    pause
    exit /b 1
)
if "!SPOTIPY_CLIENT_SECRET!"=="" (
    echo Error: Client Secret cannot be empty  
    pause
    exit /b 1
)

REM Save credentials to .env file for future use
if not exist .env (
    echo SPOTIPY_CLIENT_ID=!SPOTIPY_CLIENT_ID!> .env
    echo SPOTIPY_CLIENT_SECRET=!SPOTIPY_CLIENT_SECRET!>> .env
    echo Credentials saved to .env file for future use
)

echo Credentials loaded successfully
echo.

echo Starting SpotDL Web App...
echo Server will run at: http://localhost:8000
echo Press Ctrl+C to stop
echo.

REM Set environment variables for Python process
set "SPOTIPY_CLIENT_ID=%SPOTIPY_CLIENT_ID%"
set "SPOTIPY_CLIENT_SECRET=%SPOTIPY_CLIENT_SECRET%"

echo Debug: SPOTIPY_CLIENT_ID is set to: %SPOTIPY_CLIENT_ID%
echo Debug: SPOTIPY_CLIENT_SECRET is set to: [HIDDEN]
echo.

python app.py
goto :eof

REM Function to refresh environment variables
:RefreshEnv
echo Refreshing environment variables...
for /f "skip=2 tokens=2*" %%A in ('reg query "HKCU\Environment" /v PATH 2^>nul') do (
    if not "%%B"=="" set "UserPath=%%B"
)
for /f "skip=2 tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do (
    if not "%%B"=="" set "SystemPath=%%B"
)
if defined UserPath set "PATH=%SystemPath%;%UserPath%"
set "PATH=%PATH%;%USERPROFILE%\AppData\Local\Programs\Python\Python311;%USERPROFILE%\AppData\Local\Programs\Python\Python311\Scripts"
goto :eof