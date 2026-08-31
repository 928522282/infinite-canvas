#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef MyCanvasUrl
  #define MyCanvasUrl "https://canvas.best/"
#endif

#define MyAppName "Infinite Canvas Connector"
#define MyAppPublisher "Infinite Canvas"
#define MyAppExeName "launcher.vbs"

[Setup]
AppId={{B145187D-20A4-4687-A706-D7B4946CA720}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\Infinite Canvas Connector
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
OutputDir=output
OutputBaseFilename=Infinite-Canvas-Connector-Windows-x64

[Tasks]
Name: "startup"; Description: "登录 Windows 后自动启动连接器"; GroupDescription: "启动选项："; Flags: unchecked

[Files]
Source: "staging\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "staging\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "launcher.vbs"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Infinite Canvas"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\{#MyAppExeName}"" --open --site ""{#MyCanvasUrl}"""; WorkingDir: "{app}"
Name: "{group}\停止 Infinite Canvas Connector"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\{#MyAppExeName}"" stop"; WorkingDir: "{app}"
Name: "{userstartup}\Infinite Canvas Connector"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\{#MyAppExeName}"" --site ""{#MyCanvasUrl}"""; WorkingDir: "{app}"; Tasks: startup

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\{#MyAppExeName}"" --open --site ""{#MyCanvasUrl}"""; Description: "打开 Infinite Canvas"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\runtime\node.exe"; Parameters: """{app}\app\dist\index.js"" stop"; Flags: runhidden; RunOnceId: "StopConnector"
