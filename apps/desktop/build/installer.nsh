; ════════════════════════════════════════════════════════════════════
; DraftCoach Installer Theme — Dark Mode + Gold Accents
; ════════════════════════════════════════════════════════════════════
; electron-builder already defines MUI_ICON, MUI_UNICON, and
; MUI_FINISHPAGE_RUN on the command line. DO NOT redefine them here.

; ── MUI Color Overrides (safe ones only) ──────────────────────────
!macro customHeader
    ; Instfiles page: text color + background (guard against duplicate define)
    !ifndef MUI_INSTFILESPAGE_COLORS
        !define MUI_INSTFILESPAGE_COLORS "F0E6D2 010A13"
    !endif
!macroend

; ── Init: Force dark background on all controls ──────────────────
!macro customInit
    ; Set the main installer window text/background colors
    SetCtlColors $HWNDPARENT "F0E6D2" "010A13"
!macroend

; ── Post-install ─────────────────────────────────────────────────
!macro customInstall
    ; Create desktop shortcut with proper icon
    CreateShortCut "$DESKTOP\DraftCoach.lnk" "$INSTDIR\DraftCoach.exe" "" "$INSTDIR\DraftCoach.exe" 0
!macroend

!macro customUnInstall
    ; Clean up desktop shortcut
    Delete "$DESKTOP\DraftCoach.lnk"
!macroend
