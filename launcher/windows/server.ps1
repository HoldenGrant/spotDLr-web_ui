# spotDLr server for Windows: the Windows version of run.sh.
# Finds Python 3.10-3.13, keeps dependencies in a private .venv, checks FFmpeg and Node.js, runs app.py.
# Started hidden by launch.ps1 (the spotDLr shortcut); run.bat runs it in a visible window.

# "Continue", not "Stop": in Windows PowerShell 5.1, Stop turns any stderr text from a program (pip
# warnings, say) into a fatal error. Exit codes are checked explicitly instead.
$ErrorActionPreference = "Continue"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Repo

function Say($text) { Write-Output "[$(Get-Date -Format 'HH:mm:ss')] $text" }

# ---------- Python 3.10-3.13 (spotDL 4.4.3 refuses 3.14+) ----------
$Python = $null
$candidates = @()
if (Get-Command py -ErrorAction SilentlyContinue) {
    # The "py" launcher from python.org can pick a specific version
    foreach ($v in "3.13", "3.12", "3.11", "3.10") { $candidates += , @("py", "-$v") }
}
foreach ($name in "python", "python3") {
    if (Get-Command $name -ErrorAction SilentlyContinue) { $candidates += , @($name) }
}
foreach ($c in $candidates) {
    $exe = $c[0]; $args_ = @($c | Select-Object -Skip 1)
    try {
        & $exe @args_ -c "import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 13) else 1)" 2>$null
        if ($LASTEXITCODE -eq 0) { $Python = $c; break }
    } catch { }
}
if (-not $Python) {
    Say "ERROR: No compatible Python found. spotDLr needs Python 3.10 to 3.13."
    Say "Install it with:  winget install Python.Python.3.13   (or from python.org; tick 'Add to PATH')"
    exit 1
}
Say "Using Python: $($Python -join ' ')"

# ---------- private virtual environment ----------
$VenvPython = Join-Path $Repo ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    Say "Creating virtual environment (.venv)..."
    $exe = $Python[0]; $args_ = @($Python | Select-Object -Skip 1)
    & $exe @args_ -m venv .venv
    if ($LASTEXITCODE -ne 0) { Say "ERROR: could not create .venv"; exit 1 }
}

# Reinstall only when requirements.txt changed
$Stamp = Join-Path $Repo ".venv\.installed"
$Requirements = Join-Path $Repo "requirements.txt"
if (-not (Test-Path $Stamp) -or (Get-Item $Requirements).LastWriteTime -gt (Get-Item $Stamp).LastWriteTime) {
    Say "Installing dependencies (first run takes a minute or two)..."
    & $VenvPython -m pip install --upgrade pip --quiet 2>&1 | ForEach-Object { "$_" }
    & $VenvPython -m pip install -r $Requirements --quiet 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { Say "ERROR: dependency installation failed"; exit 1 }
    New-Item -ItemType File -Force -Path $Stamp | Out-Null
    Say "Dependencies installed"
}

# YouTube keeps changing and an old yt-dlp gets HTTP 403 on every song, so refresh it once a week
$YtdlpStamp = Join-Path $Repo ".venv\.ytdlp-updated"
if (-not (Test-Path $YtdlpStamp) -or (Get-Item $YtdlpStamp).LastWriteTime -lt (Get-Date).AddDays(-7)) {
    Say "Updating the YouTube downloader (yt-dlp)..."
    & $VenvPython (Join-Path $Repo "installer\update_ytdlp.py") 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -eq 0) { New-Item -ItemType File -Force -Path $YtdlpStamp | Out-Null }
    else { Say "Warning: couldn't update yt-dlp (offline?). Trying again next start." }
}

# ---------- FFmpeg: on PATH, or spotDL's own copy in %USERPROFILE%\.spotdl ----------
$SpotdlFfmpeg = Join-Path $env:USERPROFILE ".spotdl\ffmpeg.exe"
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -and -not (Test-Path $SpotdlFfmpeg)) {
    Say "FFmpeg not found. Downloading it via spotDL..."
    & $VenvPython -m spotdl --download-ffmpeg
}

# ---------- Node.js: yt-dlp needs a JavaScript runtime, or YouTube refuses downloads (HTTP 403) ----------
if (-not (Get-Command node -ErrorAction SilentlyContinue) -and -not (Get-Command deno -ErrorAction SilentlyContinue)) {
    Say "WARNING: Node.js not found. Browsing and playback work, but YouTube downloads will fail."
    Say "Install it with:  winget install OpenJS.NodeJS   then restart spotDLr."
}

# ---------- run ----------
Say "Starting spotDLr on http://localhost:8000"
$env:PYTHONUNBUFFERED = "1"  # write log lines as they happen, not in buffered chunks
# 2>&1 + "$_": uvicorn logs to stderr, which PowerShell 5.1 would otherwise wrap in error noise
& $VenvPython app.py 2>&1 | ForEach-Object { "$_" }
