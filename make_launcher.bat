@echo off
REM Windows: double-click once to create the "spotDLr" Start-menu and Desktop shortcuts.
REM From then on, open spotDLr from the Start menu: it starts everything and opens in its own window.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\windows\make_shortcuts.ps1"
echo.
pause
