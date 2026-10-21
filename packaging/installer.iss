#ifndef MyAppVersion
  #define MyAppVersion "1.4.0"
#endif
#ifndef DistDir
  #define DistDir "..\dist\1.4.0\Lotus"
#endif
#ifndef ReleaseDir
  #define ReleaseDir "..\dist\1.4.0"
#endif

[Setup]
AppId={{46C5C302-0B39-4F59-8C80-6F56FF4367E8}
AppName=创作者工作台
AppVersion={#MyAppVersion}
AppPublisher=ATtasar
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\Lotus-Workbench
DisableProgramGroupPage=yes
OutputDir={#ReleaseDir}
OutputBaseFilename=lotus-{#MyAppVersion}-setup-win64
SetupIconFile=..\desktop\workbench.ico
UninstallDisplayIcon={app}\Lotus.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#DistDir}\*"; DestDir: "{app}"; Excludes: "*.sqlite,*.db,config.json,config.last-good.json,data-location.json,data\*,logs\*,backups\*,runtime\*"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userdesktop}\创作者工作台"; Filename: "{app}\Lotus.exe"; Parameters: "start"
Name: "{userprograms}\创作者工作台"; Filename: "{app}\Lotus.exe"; Parameters: "start"

[Run]
Filename: "{app}\Lotus.exe"; Parameters: "install"; Description: "打开创作者工作台"; Flags: nowait postinstall skipifsilent

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var ResultCode: Integer;
begin
  Result := '';
  if FileExists(ExpandConstant('{app}\Lotus.exe')) then
    if not Exec(ExpandConstant('{app}\Lotus.exe'), 'stop --quiet', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
      Result := '无法安全停止旧版工作台，请先从托盘停止服务。原数据保留。';
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
    Exec(ExpandConstant('{app}\Lotus.exe'), 'stop --quiet', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
// User data is outside {app}. No UninstallDelete rule touches it.
