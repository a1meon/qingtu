!include "UAC.nsh"
!define QINGTU_GUID "510f7683-73da-5142-8631-32518f41bf0b"
!define QINGTU_INSTALL "Software\${QINGTU_GUID}"
!define QINGTU_UNINSTALL "Software\Microsoft\Windows\CurrentVersion\Uninstall\${QINGTU_GUID}"
!define QINGTU_LITE_UNINSTALL "Software\Microsoft\Windows\CurrentVersion\Uninstall\QingtuLite"
Var InstallScope
Var RegistryView
Var UserView
Var MachineView
Var RegisteredUser
Var RegisteredMachine
Var ExplicitDirectory
Var CandidateDirectory
Var CandidateView
!macro SaveRegistration LABEL KEY VALUE
 Var /GLOBAL Prior${LABEL}
 Var /GLOBAL Had${LABEL}
 ClearErrors
 ReadRegStr $Prior${LABEL} SHCTX "${KEY}" "${VALUE}"
 ${If} ${Errors}
  StrCpy $Had${LABEL} 0
 ${Else}
  StrCpy $Had${LABEL} 1
 ${EndIf}
!macroend
!macro RestoreRegistration LABEL KEY VALUE
 ${If} $Had${LABEL} == 1
  WriteRegStr SHCTX "${KEY}" "${VALUE}" "$Prior${LABEL}"
 ${Else}
  DeleteRegValue SHCTX "${KEY}" "${VALUE}"
 ${EndIf}
!macroend
!macro UseInstallRegistryView
 ${If} $RegistryView == 32
  SetRegView 32
 ${Else}
  SetRegView 64
 ${EndIf}
!macroend

!macro ReadRegistryPath ROOT KEY OUTPUT VIEW
 StrCpy ${VIEW} 64
 SetRegView 64
 ReadRegStr ${OUTPUT} ${ROOT} "${KEY}" "InstallLocation"
 SetRegView 32
 ReadRegStr $9 ${ROOT} "${KEY}" "InstallLocation"
 ${If} $ExplicitDirectory == ""
 ${AndIf} ${OUTPUT} != ""
 ${AndIf} $9 != ""
 ${AndIf} ${OUTPUT} != $9
  MessageBox MB_ICONSTOP "检测到多个轻图安装目录。请运行安装包并用 /D= 指定需要更新的目录。" /SD IDOK
  Abort
 ${EndIf}
 ${If} ${OUTPUT} == ""
  StrCpy ${VIEW} 32
  StrCpy ${OUTPUT} $9
 ${ElseIf} $ExplicitDirectory != ""
 ${AndIf} $9 == $ExplicitDirectory
  StrCpy ${VIEW} 32
  StrCpy ${OUTPUT} $9
 ${EndIf}
!macroend
!macro ReadInstallScope ROOT OUTPUT VIEW
 !insertmacro ReadRegistryPath ${ROOT} "${QINGTU_INSTALL}" ${OUTPUT} ${VIEW}
 !insertmacro ReadRegistryPath ${ROOT} "${QINGTU_LITE_UNINSTALL}" $CandidateDirectory $CandidateView
 ${If} $ExplicitDirectory == ""
 ${AndIf} ${OUTPUT} != ""
 ${AndIf} $CandidateDirectory != ""
 ${AndIf} ${OUTPUT} != $CandidateDirectory
  MessageBox MB_ICONSTOP "检测到旧版与轻量版位于不同目录。请运行安装包并用 /D= 指定需要更新的目录。" /SD IDOK
  Abort
 ${EndIf}
 ${If} ${OUTPUT} == ""
  StrCpy ${OUTPUT} $CandidateDirectory
  StrCpy ${VIEW} $CandidateView
 ${ElseIf} $ExplicitDirectory != ""
 ${AndIf} $CandidateDirectory == $ExplicitDirectory
  StrCpy ${OUTPUT} $CandidateDirectory
  StrCpy ${VIEW} $CandidateView
 ${EndIf}
!macroend

Function ReadExplicitDirectory
 ; /D is the last argument and NSIS removes it from $CMDLINE. Preserve
 ; everything after it, including spaces and forward slash path separators.
 System::Call 'kernel32::GetCommandLineW() w .r8'
 StrCpy $ExplicitDirectory ""
 StrCpy $6 0
 StrLen $7 $8
 StrCpy $5 $8 1
 ${If} $5 == '$\"'
  StrCpy $6 1
  ${DoWhile} $6 < $7
   StrCpy $5 $8 1 $6
   IntOp $6 $6 + 1
   ${If} $5 == '$\"'
    ${Break}
   ${EndIf}
  ${Loop}
 ${Else}
  ${DoWhile} $6 < $7
   StrCpy $5 $8 1 $6
   ${If} $5 == " "
    ${Break}
   ${EndIf}
   IntOp $6 $6 + 1
  ${Loop}
 ${EndIf}
 ${DoWhile} $6 < $7
  StrCpy $5 $8 4 $6
  ${If} $5 == " /D="
   IntOp $6 $6 + 4
   StrCpy $ExplicitDirectory $8 "" $6
   ${Break}
  ${ElseIf} $5 == '$\"/D='
   IntOp $6 $6 + 4
   StrCpy $ExplicitDirectory $8 "" $6
   StrCpy $5 $ExplicitDirectory 1 -1
   ${If} $5 == '$\"'
    StrCpy $ExplicitDirectory $ExplicitDirectory -1
   ${EndIf}
   ${Break}
  ${EndIf}
  IntOp $6 $6 + 1
 ${Loop}
 ${If} $ExplicitDirectory != ""
  StrCpy $3 $ExplicitDirectory 1 1
  StrCpy $4 $ExplicitDirectory 1 2
  StrCpy $5 $ExplicitDirectory 2
  ${If} $3 == ":"
  ${AndIf} $4 == "\"
  ${OrIf} $3 == ":"
  ${AndIf} $4 == "/"
  ${OrIf} $5 == "\\"
  ${OrIf} $5 == "//"
   GetFullPathName $ExplicitDirectory $ExplicitDirectory
  ${Else}
   MessageBox MB_ICONSTOP "安装目录必须是完整的绝对路径。" /SD IDOK
   Abort
  ${EndIf}
 ${EndIf}
FunctionEnd

Function ResolveInstallDirectory
 Call ReadExplicitDirectory
 ${IfNot} ${UAC_IsInnerInstance}
  !insertmacro ReadInstallScope HKCU $RegisteredUser $UserView
 ${EndIf}
 !insertmacro ReadInstallScope HKLM $RegisteredMachine $MachineView
 StrCpy $InstallScope "user"
 StrCpy $RegistryView 64
 ${If} ${UAC_IsInnerInstance}
  ; HKCU may be a different administrator after credential elevation.
  StrCpy $RegisteredUser ""
 ${EndIf}
 ${If} $ExplicitDirectory != ""
  StrCpy $INSTDIR $ExplicitDirectory
 ${ElseIf} $RegisteredUser != ""
 ${AndIf} $RegisteredMachine != ""
 ${AndIf} $RegisteredUser != $RegisteredMachine
  MessageBox MB_ICONSTOP "检测到每用户和全用户的两份轻图。为避免更新错误目录，请运行安装包并用 /D= 指定需要更新的安装目录。" /SD IDOK
  Abort
 ${ElseIf} $RegisteredUser != ""
  StrCpy $INSTDIR $RegisteredUser
 ${ElseIf} $RegisteredMachine != ""
  StrCpy $INSTDIR $RegisteredMachine
 ${EndIf}
 ${If} $INSTDIR == $RegisteredUser
  StrCpy $RegistryView $UserView
 ${EndIf}
 ${If} $INSTDIR == $RegisteredMachine
  StrCpy $InstallScope "all"
  StrCpy $RegistryView $MachineView
  !insertmacro UAC_RunElevated
  ${If} $0 != 0
   MessageBox MB_ICONSTOP "无法获得原安装目录的写入权限，旧版本已保留。" /SD IDOK
   Abort
  ${EndIf}
  ${If} $1 == 1
   Quit
  ${EndIf}
  ${If} $3 != 1
   Abort
  ${EndIf}
 ${EndIf}
 !insertmacro UseInstallRegistryView
 ${If} $InstallScope == "all"
  SetShellVarContext all
 ${Else}
  SetShellVarContext current
 ${EndIf}
FunctionEnd

Function StartQingtu
 ${If} ${UAC_IsInnerInstance}
  !insertmacro UAC_AsUser_ExecShell "open" "$INSTDIR\轻图.exe" "" "$INSTDIR" SW_SHOWNORMAL
 ${Else}
  Exec '"$INSTDIR\轻图.exe"'
 ${EndIf}
FunctionEnd

Function un.onInit
 SetRegView 64
 ReadRegStr $0 HKLM "${QINGTU_INSTALL}" "InstallLocation"
 ${If} $0 != $INSTDIR
  SetRegView 32
  ReadRegStr $0 HKLM "${QINGTU_INSTALL}" "InstallLocation"
 ${EndIf}
 ${If} $0 == $INSTDIR
  !insertmacro UAC_RunElevated
  ${If} $0 != 0
   Abort
  ${EndIf}
  ${If} $1 == 1
   Quit
  ${EndIf}
  ${If} $3 != 1
   Abort
  ${EndIf}
  SetShellVarContext all
 ${Else}
  SetRegView 64
  ReadRegStr $0 HKCU "${QINGTU_INSTALL}" "InstallLocation"
  ${If} $0 != $INSTDIR
   SetRegView 32
  ${EndIf}
  SetShellVarContext current
 ${EndIf}
FunctionEnd
