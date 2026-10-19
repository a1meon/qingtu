Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"
Name "轻图 ${VERSION}"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\QingtuLite"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!include "windows-migration.nsh"
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION StartQingtu
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
Function .onInit
 ${IfNot} ${AtLeastWin10}
  MessageBox MB_ICONSTOP "轻图轻量版需要 Windows 10 或更新版本。"
  Abort
 ${EndIf}
 Call ResolveInstallDirectory
FunctionEnd
Section "轻图" SEC_APP
 ; WebView registration is 32-bit even for our x64 application.
 SetRegView 32
 ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
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
   ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
   MessageBox MB_ICONSTOP "WebView2 安装未完成，请联网后重试。"
   Abort
  ${EndIf}
 ${EndIf}
 !insertmacro UseInstallRegistryView
 InitPluginsDir
 SetOutPath "$PLUGINSDIR\payload"
 ClearErrors
 File /r "${APPDIR}\*"
 WriteUninstaller "$PLUGINSDIR\payload\卸载轻图.exe"
 ${If} ${Errors}
  MessageBox MB_ICONSTOP "安装文件暂存失败，旧程序保持不变。请检查磁盘空间和目录权限。" /SD IDOK
  Abort
 ${EndIf}
 SetOutPath "$PLUGINSDIR"
 File "${APPDIR}\qingtu-io.exe"
 ClearErrors
 ExecWait '"$PLUGINSDIR\qingtu-io.exe" --install-stage "$PLUGINSDIR\payload" "$INSTDIR"' $1
 ${If} ${Errors}
 ${OrIf} $1 != 0
  MessageBox MB_ICONSTOP "安装文件未能替换，旧程序已恢复。请关闭轻图后重试。" /SD IDOK
  Abort
 ${EndIf}
 !insertmacro SaveRegistration RootLocation "${QINGTU_INSTALL}" "InstallLocation"
 !insertmacro SaveRegistration DisplayName "${QINGTU_UNINSTALL}" "DisplayName"
 !insertmacro SaveRegistration Version "${QINGTU_UNINSTALL}" "DisplayVersion"
 !insertmacro SaveRegistration Location "${QINGTU_UNINSTALL}" "InstallLocation"
 !insertmacro SaveRegistration Uninstall "${QINGTU_UNINSTALL}" "UninstallString"
 ClearErrors
 WriteRegStr SHCTX "${QINGTU_INSTALL}" "InstallLocation" "$INSTDIR"
 WriteRegStr SHCTX "${QINGTU_UNINSTALL}" "DisplayName" "轻图"
 WriteRegStr SHCTX "${QINGTU_UNINSTALL}" "DisplayVersion" "${VERSION}"
 WriteRegStr SHCTX "${QINGTU_UNINSTALL}" "InstallLocation" "$INSTDIR"
 WriteRegStr SHCTX "${QINGTU_UNINSTALL}" "UninstallString" '"$INSTDIR\卸载轻图.exe"'
 ${If} ${Errors}
  Call RestoreInstallRegistration
  ExecWait '"$PLUGINSDIR\qingtu-io.exe" --install-rollback "$INSTDIR"' $1
  MessageBox MB_ICONSTOP "安装登记失败，旧程序已恢复。请检查目录权限后重试。" /SD IDOK
  Abort
 ${EndIf}
 ExecWait '"$PLUGINSDIR\qingtu-io.exe" --install-finish "$INSTDIR"' $1
 ${If} ${Errors}
 ${OrIf} $1 != 0
  Call RestoreInstallRegistration
  ExecWait '"$PLUGINSDIR\qingtu-io.exe" --install-rollback "$INSTDIR"' $1
  MessageBox MB_ICONSTOP "安装提交未完成。恢复文件已保留，请检查目录权限后重试。" /SD IDOK
  Abort
 ${EndIf}
 ; Cleanup only known Electron runtime paths after the new files committed.
 ; Unknown files and directories, including exports, are never recursively removed.
 Delete "$INSTDIR\resources\app.asar"
 Delete "$INSTDIR\resources\app-update.yml"
 Delete "$INSTDIR\resources\qingtu-update-source.json"
 Delete "$INSTDIR\resources\elevate.exe"
 Delete "$INSTDIR\Uninstall 轻图.exe"
 Delete "$INSTDIR\LICENSE.electron.txt"
 Delete "$INSTDIR\LICENSES.chromium.html"
 Delete "$INSTDIR\chrome_100_percent.pak"
 Delete "$INSTDIR\chrome_200_percent.pak"
 Delete "$INSTDIR\d3dcompiler_47.dll"
 Delete "$INSTDIR\dxcompiler.dll"
 Delete "$INSTDIR\dxil.dll"
 Delete "$INSTDIR\ffmpeg.dll"
 Delete "$INSTDIR\icudtl.dat"
 Delete "$INSTDIR\resources.pak"
 Delete "$INSTDIR\snapshot_blob.bin"
 Delete "$INSTDIR\v8_context_snapshot.bin"
 Delete "$INSTDIR\vk_swiftshader.dll"
 Delete "$INSTDIR\vk_swiftshader_icd.json"
 Delete "$INSTDIR\vulkan-1.dll"
 CreateShortcut "$DESKTOP\轻图.lnk" "$INSTDIR\轻图.exe" "" "$INSTDIR\icon.ico"
 CreateDirectory "$SMPROGRAMS\轻图"
 CreateShortcut "$SMPROGRAMS\轻图\轻图.lnk" "$INSTDIR\轻图.exe" "" "$INSTDIR\icon.ico"
 ReadRegStr $0 SHCTX "${QINGTU_LITE_UNINSTALL}" "InstallLocation"
 ${If} $0 == $INSTDIR
  DeleteRegKey SHCTX "${QINGTU_LITE_UNINSTALL}"
 ${EndIf}
SectionEnd
Function RestoreInstallRegistration
 !insertmacro RestoreRegistration RootLocation "${QINGTU_INSTALL}" "InstallLocation"
 !insertmacro RestoreRegistration DisplayName "${QINGTU_UNINSTALL}" "DisplayName"
 !insertmacro RestoreRegistration Version "${QINGTU_UNINSTALL}" "DisplayVersion"
 !insertmacro RestoreRegistration Location "${QINGTU_UNINSTALL}" "InstallLocation"
 !insertmacro RestoreRegistration Uninstall "${QINGTU_UNINSTALL}" "UninstallString"
FunctionEnd
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
 ReadRegStr $0 SHCTX "${QINGTU_INSTALL}" "InstallLocation"
 ${If} $0 == $INSTDIR
  DeleteRegKey SHCTX "${QINGTU_UNINSTALL}"
  DeleteRegKey SHCTX "${QINGTU_INSTALL}"
 ${EndIf}
 ; User projects are deliberately kept in APPDATA\qingtu\stitch-projects.
SectionEnd

Function .onInstSuccess
 ${If} ${Silent}
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "--force-run" $1
  IfErrors +2 0
  Call StartQingtu
 ${EndIf}
FunctionEnd
