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


REM Everything after Python itself is handled by server.ps1 (the same script the spotDLr shortcut uses):
REM private .venv, dependencies, FFmpeg, Node.js check. Spotify keys are optional.
echo Starting spotDLr... (keep this window open; close it to stop spotDLr)
echo It opens in your browser at http://localhost:8000 when ready.
echo.
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "for ($i = 0; $i -lt 600; $i++) { try { Invoke-RestMethod http://localhost:8000/api/status/init -TimeoutSec 2 | Out-Null; Start-Process http://localhost:8000; break } catch { Start-Sleep 1 } }"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\windows\server.ps1"
echo.
echo spotDLr stopped.
pause
