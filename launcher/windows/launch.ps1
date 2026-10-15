# spotDLr launcher for Windows: what the spotDLr Start-menu / Desktop shortcut runs.
# Starts the server hidden (if it isn't running) and opens spotDLr in its own window
# (Chrome or Edge app mode: no tabs, no address bar). Windows twin of the macOS spotDLr.app.

$ErrorActionPreference = "Continue"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Port = 8000
$Url = "http://localhost:$Port"
$LogDir = Join-Path $env:LOCALAPPDATA "spotDLr"
$Log = Join-Path $LogDir "spotDLr.log"

function Fail($message) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($message, "spotDLr couldn't start", "OK", "Error") | Out-Null
    exit 1
}

# "Is spotDLr answering?", not just "is the port open": another app could hold port 8000
function Test-SpotDLr {
    try {
        $status = Invoke-RestMethod -Uri "$Url/api/status/init" -TimeoutSec 2 -UseBasicParsing
        return $status.PSObject.Properties.Name -contains "search_source"
    } catch { return $false }
}

function Test-PortBusy {
    try { return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop) }
    catch { return $false }
}

if (-not (Test-Path (Join-Path $Repo "app.py"))) {
    Fail "The spotDLr folder isn't at $Repo anymore. Open the folder where it is now and double-click make_launcher.bat again."
}

if (-not (Test-SpotDLr)) {
    if (Test-PortBusy) {
        Fail "Port $Port is being used by another app, so spotDLr can't start. Close that app and try again."
    }
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 5MB) { Move-Item -Force $Log "$Log.old" }
    "=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') starting spotDLr" | Out-File -FilePath $Log -Append -Encoding utf8

    # Hidden PowerShell running server.ps1; output appended to the log as UTF-8 text
    # Single-quoted paths inside the command: double any apostrophe (C:\Users\O'Brien)
    $server = (Join-Path $PSScriptRoot "server.ps1").Replace("'", "''")
    $logPath = $Log.Replace("'", "''")
    $command = "& '$server' 2>&1 | ForEach-Object { `"`$_`" } | Out-File -FilePath '$logPath' -Append -Encoding utf8"
    # -EncodedCommand (base64 of UTF-16LE): Windows command-line parsing would strip the inner
    # double quotes of a plain -Command string, so send it encoded and nothing gets mangled
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $process = Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -PassThru `
        -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encoded

    # A tray balloon so a slow first launch (installing dependencies) doesn't look broken
    $balloon = $null
    $started = Get-Date
    while (-not (Test-SpotDLr)) {
        if ($process.HasExited) {
            if ($balloon) { $balloon.Dispose() }
            Fail "The server stopped while starting. Details are in $Log"
        }
        $elapsed = ((Get-Date) - $started).TotalSeconds
        if ($elapsed -ge 4 -and -not $balloon) {
            Add-Type -AssemblyName System.Windows.Forms
            $balloon = New-Object System.Windows.Forms.NotifyIcon
            $balloon.Icon = [System.Drawing.SystemIcons]::Information
            $balloon.Visible = $true
            $balloon.ShowBalloonTip(10000, "spotDLr", "Starting... The first launch installs what it needs and can take a few minutes.", "Info")
        }
        if ($elapsed -gt 600) {
            if ($balloon) { $balloon.Dispose() }
            Fail "Starting took more than 10 minutes. Details are in $Log"
        }
        Start-Sleep -Milliseconds 500
    }
    if ($balloon) { $balloon.Dispose() }
}

# Its own window: Chrome or Edge in app mode. Edge comes with Windows, so there's always one.
$browsers = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
)
foreach ($browser in $browsers) {
    if ($browser -and (Test-Path $browser)) {
        Start-Process -FilePath $browser -ArgumentList "--app=$Url"
        exit 0
    }
}
Start-Process $Url  # no Chrome or Edge found: a normal tab in the default browser
