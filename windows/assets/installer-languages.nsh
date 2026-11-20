; Select the installer locale before any visible page; no English-first popup.
!include LogicLib.nsh
!include FileFunc.nsh
!include WinMessages.nsh
!define MUI_BGCOLOR "0A1018"
!define MUI_TEXTCOLOR "F4F6F8"
!define MUI_INSTFILESPAGE_COLORS "F4F6F8 101720"
!define MUI_DIRECTORYPAGE_BGCOLOR "101720"
!define MUI_DIRECTORYPAGE_TEXTCOLOR "F4F6F8"
!define MUI_FINISHPAGE_LINK_COLOR "FF242D"
!ifdef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.AbbeedoTheme
!else
  !define MUI_CUSTOMFUNCTION_GUIINIT AbbeedoTheme
!endif
!include MUI2.nsh
!include nsDialogs.nsh

LangString AbbeedoAppName 1025 "ابوناصر TV"
LangString AbbeedoAppName 1033 "abbeedo TV"
LangString AbbeedoCaption 1025 "تثبيت ابوناصر TV"
LangString AbbeedoCaption 1033 "abbeedo TV Setup"
LangString AbbeedoWelcomeTitle 1025 "مرحبًا بك في ابوناصر TV"
LangString AbbeedoWelcomeTitle 1033 "Welcome to abbeedo TV"
LangString AbbeedoWelcomeBody 1025 "قنواتك وأفلامك ومسلسلاتك في تطبيق واحد.$\r$\n$\r$\nاختر التالي لتثبيت التطبيق على جهازك."
LangString AbbeedoWelcomeBody 1033 "Your channels, movies and series in one application.$\r$\n$\r$\nChoose Next to install the app on this computer."

; Preserve the standard per-page callbacks while painting every new page.
!macroundef MUI_PAGE_FUNCTION_CUSTOM
!macro MUI_PAGE_FUNCTION_CUSTOM TYPE
  !ifdef MUI_PAGE_CUSTOMFUNCTION_${TYPE}
    Call "${MUI_PAGE_CUSTOMFUNCTION_${TYPE}}"
    !undef MUI_PAGE_CUSTOMFUNCTION_${TYPE}
  !endif
  !if "${TYPE}" == "SHOW"
    !ifdef BUILD_UNINSTALLER
      Call un.AbbeedoTheme
    !else
      Call AbbeedoTheme
    !endif
  !endif
!macroend

!macro AbbeedoThemeFunction PREFIX
Function ${PREFIX}AbbeedoTheme
  Push $0
  Push $1
  Push $2
  SetCtlColors $HWNDPARENT F4F6F8 0A1018
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'
  System::Call 'user32::GetWindow(p $HWNDPARENT, i 5) p .r0'
  ${DoWhile} $0 != 0
    SetCtlColors $0 F4F6F8 0A1018
    System::Call 'user32::GetWindow(p r0, i 5) p .r1'
    ${DoWhile} $1 != 0
      SetCtlColors $1 F4F6F8 101720
      System::Call 'user32::GetWindow(p r1, i 5) p .r2'
      ${DoWhile} $2 != 0
        SetCtlColors $2 F4F6F8 101720
        System::Call 'user32::GetWindow(p r2, i 2) p .r2'
      ${Loop}
      System::Call 'user32::GetWindow(p r1, i 2) p .r1'
    ${Loop}
    System::Call 'user32::GetWindow(p r0, i 2) p .r0'
  ${Loop}
  GetDlgItem $0 $HWNDPARENT 1
  System::Call 'uxtheme::SetWindowTheme(p r0, w "", w "")'
  SetCtlColors $0 FFFFFF FF242D
  GetDlgItem $0 $HWNDPARENT 2
  System::Call 'uxtheme::SetWindowTheme(p r0, w "", w "")'
  SetCtlColors $0 F4F6F8 18212E
  GetDlgItem $0 $HWNDPARENT 3
  System::Call 'uxtheme::SetWindowTheme(p r0, w "", w "")'
  SetCtlColors $0 F4F6F8 18212E
  SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:$(AbbeedoCaption)"
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!macroend
!ifdef BUILD_UNINSTALLER
  !insertmacro AbbeedoThemeFunction "un."
!else
  !insertmacro AbbeedoThemeFunction ""
!endif

!macro preInit
  StrCpy $LANGUAGE 1025
  ReadRegStr $R0 HKCU "Software\abbeedo TV\Installer" "Language"
  ${If} $R0 == "1033"
    StrCpy $LANGUAGE 1033
  ${EndIf}
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/LANG=" $R1
  ${IfNot} ${Errors}
    ${If} $R1 == "1033"
      StrCpy $LANGUAGE 1033
    ${ElseIf} $R1 == "1025"
      StrCpy $LANGUAGE 1025
    ${EndIf}
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/ABBEEDOLANG=" $R1
  ${IfNot} ${Errors}
    ${If} $R1 == "en"
      StrCpy $LANGUAGE 1033
    ${ElseIf} $R1 == "ar"
      StrCpy $LANGUAGE 1025
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstallMode
  ; This installer is intentionally per-user and never offers a disabled admin option.
  StrCpy $isForceCurrentInstall "1"
!macroend
!macro customInit
  WriteRegStr HKCU "Software\abbeedo TV\Installer" "Language" $LANGUAGE
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "$(AbbeedoWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(AbbeedoWelcomeBody)"
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME
!macroend
