Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"
Name "轻图 ${VERSION}"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\QingtuLite"
InstallDirRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\QingtuLite" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\轻图.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
Function .onInit
 ${IfNot} ${AtLeastWin10}
  MessageBox MB_ICONSTOP "轻图轻量版需要 Windows 10 或更新版本。"
  Abort
 ${EndIf}
FunctionEnd
Section "轻图" SEC_APP
 SetShellVarContext current
 ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
 ${If} $0 == ""
 ${OrIf} $0 == "0.0.0.0"
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
 ${EndIf}
 ${If} $0 == ""
 ${OrIf} $0 == "0.0.0.0"
  DetailPrint "正在联网安装 Microsoft WebView2 Runtime…"
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "${WEBVIEW}"
  ExecWait '"$PLUGINSDIR\MicrosoftEdgeWebview2Setup.exe" /silent /install' $1
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 == ""
   ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
   MessageBox MB_ICONSTOP "WebView2 安装未完成，请联网后重试。"
   Abort
  ${EndIf}
 ${EndIf}
 SetOutPath "$INSTDIR"
 File /r "${APPDIR}\*"
 WriteUninstaller "$INSTDIR\卸载轻图.exe"
 CreateShortcut "$DESKTOP\轻图.lnk" "$INSTDIR\轻图.exe" "" "$INSTDIR\icon.ico"
 CreateDirectory "$SMPROGRAMS\轻图"
 CreateShortcut "$SMPROGRAMS\轻图\轻图.lnk" "$INSTDIR\轻图.exe" "" "$INSTDIR\icon.ico"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\QingtuLite" "DisplayName" "轻图"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\QingtuLite" "DisplayVersion" "${VERSION}"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\QingtuLite" "InstallLocation" "$INSTDIR"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\QingtuLite" "UninstallString" '"$INSTDIR\卸载轻图.exe"'
SectionEnd
Section "Uninstall"
 Delete "$DESKTOP\轻图.lnk"
 Delete "$SMPROGRAMS\轻图\轻图.lnk"
 RMDir "$SMPROGRAMS\轻图"
 Delete "$INSTDIR\轻图.exe"
 Delete "$INSTDIR\qingtu-io.exe"
 Delete "$INSTDIR\resources.neu"
 Delete "$INSTDIR\icon.ico"
 Delete "$INSTDIR\卸载轻图.exe"
 RMDir "$INSTDIR"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\QingtuLite"
 ; User projects are deliberately kept in APPDATA\qingtu\stitch-projects.
SectionEnd

Function .onInstSuccess
 ${If} ${Silent}
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "--force-run" $1
  IfErrors +2 0
  Exec '"$INSTDIR\轻图.exe"'
 ${EndIf}
FunctionEnd
