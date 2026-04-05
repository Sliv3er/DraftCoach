; ══════════════════════════════════════════════════════════════════
; DraftCoach - Custom NSIS Installer Script
; ══════════════════════════════════════════════════════════════════
; This file is automatically included by electron-builder.
; It customizes the MUI2 installer to match the DraftCoach
; League-of-Legends-inspired dark theme.
; ══════════════════════════════════════════════════════════════════

; ── MUI2 Color Theme (LoL Client Dark) ────────────────────────
; Background: #010A13 (dark navy)
; Text:       #F0E6D2 (gold bright)
; Accents:    #C89B3C (gold)

!define MUI_BGCOLOR "010A13"
!define MUI_TEXTCOLOR "F0E6D2"

; ── Welcome Page ──────────────────────────────────────────────
!define MUI_WELCOMEPAGE_TITLE "Welcome to DraftCoach Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will install DraftCoach on your computer.$\r$\n$\r$\nDraftCoach is an AI-powered League of Legends companion that provides real-time builds, live scouting, cooldown tracking, and performance analytics.$\r$\n$\r$\nPowered by Google Gemini AI with Search Grounding.$\r$\n$\r$\nClick Next to continue."

; ── Finish Page ───────────────────────────────────────────────
!define MUI_FINISHPAGE_TITLE "DraftCoach Installed Successfully"
!define MUI_FINISHPAGE_TEXT "DraftCoach has been installed on your computer.$\r$\n$\r$\nClick Finish to close the setup wizard."
!define MUI_FINISHPAGE_RUN "$INSTDIR\DraftCoach.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch DraftCoach"
!define MUI_FINISHPAGE_LINK "Visit DraftCoach on GitHub"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/Sliv3er/DraftCoach"
!define MUI_FINISHPAGE_LINK_COLOR "C89B3C"

; ── Abort Warning ─────────────────────────────────────────────
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Are you sure you want to cancel DraftCoach installation?"

; ── Uninstaller ───────────────────────────────────────────────
!define MUI_UNCONFIRMPAGE_TEXT_TOP "DraftCoach will be uninstalled from the following folder. Click Uninstall to continue."

; ══════════════════════════════════════════════════════════════════
; Macros — hooks into the electron-builder install lifecycle
; ══════════════════════════════════════════════════════════════════

!macro preInit
  ; Set the default install directory to LocalAppData
  SetRegView 64
!macroend

!macro customInit
  ; Set installer UI colors for all controls
  SetCtlColors $HWNDPARENT "F0E6D2" "010A13"
!macroend

!macro customInstall
  ; Create desktop shortcut
  CreateShortCut "$DESKTOP\DraftCoach.lnk" "$INSTDIR\DraftCoach.exe" "" "$INSTDIR\DraftCoach.exe" 0

  ; Create Start Menu folder and shortcut
  CreateDirectory "$SMPROGRAMS\DraftCoach"
  CreateShortCut "$SMPROGRAMS\DraftCoach\DraftCoach.lnk" "$INSTDIR\DraftCoach.exe" "" "$INSTDIR\DraftCoach.exe" 0
  CreateShortCut "$SMPROGRAMS\DraftCoach\Uninstall DraftCoach.lnk" "$INSTDIR\Uninstall DraftCoach.exe" "" "$INSTDIR\Uninstall DraftCoach.exe" 0
!macroend

!macro customUnInstall
  ; Remove desktop shortcut
  Delete "$DESKTOP\DraftCoach.lnk"

  ; Remove Start Menu entries
  Delete "$SMPROGRAMS\DraftCoach\DraftCoach.lnk"
  Delete "$SMPROGRAMS\DraftCoach\Uninstall DraftCoach.lnk"
  RMDir "$SMPROGRAMS\DraftCoach"
!macroend
