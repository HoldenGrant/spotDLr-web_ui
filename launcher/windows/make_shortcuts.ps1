# Creates the "spotDLr" shortcuts (Start menu + Desktop) that open spotDLr like an app.
# Run it through make_launcher.bat (double-click). Re-run it if you move the spotDLr folder.

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Launch = Join-Path $PSScriptRoot "launch.ps1"
$Icon = Join-Path $Repo "launcher\icon.ico"

$shell = New-Object -ComObject WScript.Shell
$places = @(
    [Environment]::GetFolderPath("Programs"),        # Start menu
    [Environment]::GetFolderPath("DesktopDirectory")  # Desktop
)
foreach ($folder in $places) {
    $shortcut = $shell.CreateShortcut((Join-Path $folder "spotDLr.lnk"))
    $shortcut.TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    # -WindowStyle Hidden + a minimized shortcut: no console window stays on screen
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launch`""
    $shortcut.WorkingDirectory = $Repo
    $shortcut.IconLocation = "$Icon,0"
    $shortcut.WindowStyle = 7
    $shortcut.Description = "Open spotDLr"
    $shortcut.Save()
    Write-Output "Created: $(Join-Path $folder 'spotDLr.lnk')"
}
Write-Output ""
Write-Output "Done. Open spotDLr from the Start menu or the Desktop. To pin it: right-click the Start menu entry > Pin to taskbar."
