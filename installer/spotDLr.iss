; spotDLr Windows installer (Inno Setup 6). Built by .github/workflows/windows-installer.yml:
;   pyinstaller installer/spotDLr.spec --distpath dist   then   ISCC /DAppVersion=x.y.z installer/spotDLr.iss
; Per-user install, no admin prompt. Music lives in the user's Music\spotDLr folder and is never
; touched by uninstall.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
; The AppId identifies the app across versions (upgrades replace it): never change it
AppId={{86ACF551-4557-4638-B063-0806C5249EC6}
AppName=spotDLr
AppVersion={#AppVersion}
AppVerName=spotDLr {#AppVersion}
AppPublisher=Holden Grant
AppPublisherURL=https://github.com/HoldenGrant/spotDLr-web_ui
DefaultDirName={localappdata}\Programs\spotDLr
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist-installer
OutputBaseFilename=spotDLr-Setup
SetupIconFile=..\launcher\icon.ico
UninstallDisplayIcon={app}\spotDLr.exe
UninstallDisplayName=spotDLr
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Close a running spotDLr before updating it
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Put a spotDLr icon on the desktop"; GroupDescription: "Shortcuts:"

[Files]
Source: "..\dist\spotDLr\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\spotDLr"; Filename: "{app}\spotDLr.exe"
Name: "{autodesktop}\spotDLr"; Filename: "{app}\spotDLr.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\spotDLr.exe"; Description: "Open spotDLr"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; The app window's private browser profile goes; music (Music\spotDLr) and settings stay
Type: filesandordirs; Name: "{localappdata}\spotDLr\browser-profile"
