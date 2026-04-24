; DraftCoach Splash Installer UI
; No wizard pages — just a branded splash screen with progress bar.
; The installer runs silently; this file styles the instfiles page as a splash.

Var SplashBgImage
Var SplashBgHandle

; ── Style the instfiles page as a splash screen ──
Function InstFilesPageShow
  ; Hide all default chrome
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1028
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1256
  ShowWindow $0 ${SW_HIDE}

  ; Expand page to fill window
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i .R0'
  ${If} $R0 = 0
    StrCpy $R0 96
  ${EndIf}
  IntOp $R1 520 * $R0
  IntOp $R1 $R1 / 96
  IntOp $R2 340 * $R0
  IntOp $R2 $R2 / 96
  GetDlgItem $R3 $HWNDPARENT 1018
  System::Call 'user32::MoveWindow(p $R3, i 0, i 0, i R1, i R2, i 1)'

  ; Get inner page dialog
  FindWindow $R4 "#32770" "" $HWNDPARENT
  SetCtlColors $R4 "${BRAND_TEXT_HEX}" "${BRAND_BG_HEX}"

  ; Create splash background bitmap
  ${NSD_CreateBitmap} 0 0 100% 100% ""
  Pop $SplashBgImage
  ${NSD_SetStretchedImage} $SplashBgImage "$PLUGINSDIR\splash.bmp" $SplashBgHandle

  ; Send bitmap to back so progress bar shows on top
  System::Call 'user32::SetWindowPos(p $SplashBgImage, i 1, i 0, i 0, i 0, i 0, i 0x0003)'

  ; ── Style and reposition the progress bar ──
  ; The progress bar is a child of the inner page dialog
  FindWindow $R5 "msctls_progress32" "" $R4
  ${If} $R5 != 0
    ; Remove Windows visual theme (so we can set custom colors)
    System::Call 'uxtheme::SetWindowTheme(p $R5, w " ", w " ")'

    ; Set gold bar color (BGR format: C89B3C → 3C9BC8)
    SendMessage $R5 0x0409 0 0x003C9BC8 ; PBM_SETBARCOLOR
    ; Set dark background (BGR: 010A13 → 130A01)
    SendMessage $R5 0x2001 0 0x00130A01 ; PBM_SETBKCOLOR

    ; Reposition progress bar to match the track area in the splash BMP
    ; Track in BMP: x=60, y=290, w=400, h=4 (at 520x340 base)
    ; Convert to percentages of window: x=11.5%, y=85.3%, w=76.9%, h=1.2%
    ; Use DPI-scaled pixel values
    IntOp $R6 60 * $R0
    IntOp $R6 $R6 / 96
    IntOp $R7 290 * $R0
    IntOp $R7 $R7 / 96
    IntOp $R8 400 * $R0
    IntOp $R8 $R8 / 96
    IntOp $R9 6 * $R0
    IntOp $R9 $R9 / 96
    System::Call 'user32::MoveWindow(p $R5, i R6, i R7, i R8, i R9, i 1)'

    ; Make sure progress bar is on top of bitmap
    System::Call 'user32::SetWindowPos(p $R5, i 0, i 0, i 0, i 0, i 0, i 0x0003)' ; HWND_TOP
  ${EndIf}

  ; ── Hide the details list and status text ──
  GetDlgItem $R5 $R4 1004 ; Status text
  ShowWindow $R5 ${SW_HIDE}
  GetDlgItem $R5 $R4 1006 ; Header text
  ShowWindow $R5 ${SW_HIDE}
  GetDlgItem $R5 $R4 1016 ; Details list
  ShowWindow $R5 ${SW_HIDE}

  ; Hide "Show details" button if present
  GetDlgItem $R5 $R4 1027
  ${If} $R5 != 0
    ShowWindow $R5 ${SW_HIDE}
  ${EndIf}

  SetCtlColors $HWNDPARENT "${BRAND_TEXT_HEX}" "${BRAND_BG_HEX}"
FunctionEnd
